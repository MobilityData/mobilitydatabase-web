'use client';
import { useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { searchFeeds } from '../../../services/feeds';
import {
  type AllFeedsType,
  type AllFeedsParams,
} from '../../../services/feeds/utils';
import { getUserAccessToken } from '../../../services/profile-service';
import { app } from '../../../../firebase';
import {
  getDataTypeParamFromSelectedFeedTypes,
  getInitialSelectedFeedTypes,
} from '../../../screens/Feeds/utility';

const SEARCH_LIMIT = 20;

// This is for client-side caching
const CACHE_TTL_MS = 60 * 30 * 1000; // 30 minutes - controls how long search results are cached in SWR

/**
 * Ensures a Firebase user exists (anonymous or authenticated) before
 * SWR attempts to fetch. If no user is signed in, triggers anonymous
 * sign-in — the same thing App.tsx does for legacy React Router pages.
 * This is needed for the access token
 *
 * TODO: Revisit this logic to be used at a more global level without slowing down the initial load of all pages that don't require auth (e.g. about, contact). For example, we could move this logic to a context provider that's used only on the feeds page and its children.
 */
function useFirebaseAuthReady(): boolean {
  const [isReady, setIsReady] = useState(() => app.auth().currentUser !== null);

  useEffect(() => {
    const unsubscribe = app.auth().onAuthStateChanged((user) => {
      if (user !== null) {
        setIsReady(true);
      } else {
        // No user — trigger anonymous sign-in (mirrors App.tsx behavior)
        setIsReady(false);
        app
          .auth()
          .signInAnonymously()
          .catch(() => {
            // Auth listener will handle the state update on success;
            // if sign-in fails, isReady stays false and SWR won't fetch.
          });
      }
    });
    return unsubscribe;
  }, []);

  return isReady;
}

/**
 * Derives all API query params from the URL search params.
 * This is the single source of truth — no duplicated React state.
 */
export function deriveSearchParams(searchParams: URLSearchParams): {
  searchQuery: string;
  page: number;
  feedTypes: Record<string, boolean>;
  isOfficial: boolean;
  features: string[];
  gbfsVersions: string[];
  licenses: string[];
  hasTransitFeedsRedirect: boolean;
} {
  const feedTypes = getInitialSelectedFeedTypes(searchParams);

  return {
    searchQuery: searchParams.get('q') ?? '',
    page: searchParams.get('o') !== null ? Number(searchParams.get('o')) : 1,
    feedTypes,
    isOfficial: searchParams.get('official') === 'true',
    features: searchParams.get('features')?.split(',').filter(Boolean) ?? [],
    gbfsVersions:
      searchParams.get('gbfs_versions')?.split(',').filter(Boolean) ?? [],
    licenses: searchParams.get('licenses')?.split(',').filter(Boolean) ?? [],
    hasTransitFeedsRedirect: searchParams.get('utm_source') === 'transitfeeds',
  };
}

/**
 * Derives boolean flags for which filter categories are enabled,
 * based on the selected feed types.
 */
export function deriveFilterFlags(feedTypes: Record<string, boolean>): {
  areNoDataTypesSelected: boolean;
  isOfficialTagFilterEnabled: boolean;
  areFeatureFiltersEnabled: boolean;
  areGBFSFiltersEnabled: boolean;
} {
  const areNoDataTypesSelected =
    !feedTypes.gtfs && !feedTypes.gtfs_rt && !feedTypes.gbfs;
  return {
    areNoDataTypesSelected,
    isOfficialTagFilterEnabled:
      feedTypes.gtfs || feedTypes.gtfs_rt || areNoDataTypesSelected,
    areFeatureFiltersEnabled:
      (!feedTypes.gtfs_rt && !feedTypes.gbfs) || feedTypes.gtfs,
    areGBFSFiltersEnabled:
      feedTypes.gbfs && !feedTypes.gtfs_rt && !feedTypes.gtfs,
  };
}

/**
 * Builds a stable SWR cache key from the derived search params.
 * Returns null when we shouldn't fetch (e.g. no auth available).
 */
function buildSwrKey(derived: ReturnType<typeof deriveSearchParams>): string {
  const {
    searchQuery,
    page,
    feedTypes,
    isOfficial,
    features,
    gbfsVersions,
    licenses,
  } = derived;
  const flags = deriveFilterFlags(feedTypes);
  const cacheWindow = Math.floor(Date.now() / CACHE_TTL_MS);

  // Build a deterministic key representing the current search state
  const params = new URLSearchParams();
  params.set('cw', String(cacheWindow));
  params.set('q', searchQuery);
  params.set('page', String(page));
  params.set('dt', getDataTypeParamFromSelectedFeedTypes(feedTypes) ?? '');
  if (flags.isOfficialTagFilterEnabled && isOfficial) {
    params.set('official', 'true');
  }
  if (flags.areFeatureFiltersEnabled && features.length > 0) {
    params.set('features', features.join(','));
  }
  if (flags.areGBFSFiltersEnabled && gbfsVersions.length > 0) {
    params.set('gbfs_versions', gbfsVersions.join(','));
  }
  if (licenses.length > 0) {
    params.set('licenses', licenses.join(','));
  }
  return `feeds-search?${params.toString()}`;
}

/**
 * Fetcher function: obtains an access token and calls the search API.
 */
async function feedsFetcher(
  derivedSearchParams: ReturnType<typeof deriveSearchParams>,
): Promise<AllFeedsType | undefined> {
  const accessToken = await getUserAccessToken();
  const {
    searchQuery,
    page,
    feedTypes,
    isOfficial,
    features,
    gbfsVersions,
    licenses,
  } = derivedSearchParams;
  const flags = deriveFilterFlags(feedTypes);
  const offset = (page - 1) * SEARCH_LIMIT;

  const params: AllFeedsParams = {
    query: {
      limit: SEARCH_LIMIT,
      offset,
      search_query: searchQuery,
      data_type: getDataTypeParamFromSelectedFeedTypes(feedTypes),
      is_official: flags.isOfficialTagFilterEnabled
        ? isOfficial || undefined
        : undefined,
      status: ['active', 'inactive', 'development', 'future'],
      feature: flags.areFeatureFiltersEnabled ? features : undefined,
      version: flags.areGBFSFiltersEnabled
        ? gbfsVersions.join(',').replaceAll('v', '')
        : undefined,
      license_ids: licenses.length > 0 ? licenses.join(',') : undefined,
    },
  };

  return await searchFeeds(params, accessToken);
}

/**
 * SWR hook for feeds search. The URL search params drive the cache key,
 * so browser back/forward automatically triggers a re-fetch.
 */
export function useFeedsSearch(searchParams: URLSearchParams): {
  feedsData: AllFeedsType | undefined;
  isLoading: boolean;
  isValidating: boolean;
  isError: boolean;
  searchLimit: number;
} {
  const authReady = useFirebaseAuthReady();
  const { cache } = useSWRConfig();
  const derivedSearchParams = deriveSearchParams(searchParams);
  const key = authReady ? buildSwrKey(derivedSearchParams) : null;

  const cachedState = key !== null ? cache.get(key) : undefined;
  const hasCachedDataForKey =
    cachedState !== undefined &&
    typeof cachedState === 'object' &&
    cachedState !== null &&
    'data' in cachedState &&
    cachedState.data !== undefined;

  const {
    data,
    error,
    isLoading,
    isValidating: swrIsValidating,
  } = useSWR<AllFeedsType | undefined>(
    key,
    async () => await feedsFetcher(derivedSearchParams),
    {
      // Keep previous data visible while revalidating (no flash to skeleton)
      keepPreviousData: true,
      // Don't refetch on window focus for search results
      revalidateOnFocus: false,
      // Deduplicate identical requests within 2 seconds
      dedupingInterval: 2000,
    },
  );

  return {
    feedsData: data,
    // True only on first load (no cached data yet)
    isLoading: isLoading && data === undefined,
    // True when SWR is fetching and this key has no cached data yet.
    // This avoids showing loading UI when navigating back/forward to a cached search.
    isValidating: swrIsValidating && !hasCachedDataForKey,
    isError: error !== undefined,
    searchLimit: SEARCH_LIMIT,
  };
}

/**
 * Builds a new URLSearchParams string from the given filter state,
 * suitable for `router.push()`.
 */
export function buildSearchUrl(
  pathname: string,
  filters: {
    searchQuery?: string;
    page?: number;
    feedTypes?: Record<string, boolean>;
    isOfficial?: boolean;
    features?: string[];
    gbfsVersions?: string[];
    licenses?: string[];
    utmSource?: string | null;
  },
): string {
  const params = new URLSearchParams();

  if (filters.searchQuery != null && filters.searchQuery !== '') {
    params.set('q', filters.searchQuery);
  }
  if (filters.page !== undefined && filters.page !== 1) {
    params.set('o', String(filters.page));
  }
  if (filters.feedTypes?.gtfs === true) {
    params.set('gtfs', 'true');
  }
  if (filters.feedTypes?.gtfs_rt === true) {
    params.set('gtfs_rt', 'true');
  }
  if (filters.feedTypes?.gbfs === true) {
    params.set('gbfs', 'true');
  }
  if (filters.features != null && filters.features.length > 0) {
    params.set('features', filters.features.join(','));
  }
  if (filters.gbfsVersions != null && filters.gbfsVersions.length > 0) {
    params.set('gbfs_versions', filters.gbfsVersions.join(','));
  }
  if (filters.licenses != null && filters.licenses.length > 0) {
    params.set('licenses', filters.licenses.join(','));
  }
  if (filters.isOfficial === true) {
    params.set('official', 'true');
  }
  if (filters.utmSource != null && filters.utmSource !== '') {
    params.set('utm_source', filters.utmSource);
  }

  const qs = params.toString();
  return `${pathname}${qs.length > 0 ? `?${qs}` : ''}`;
}
