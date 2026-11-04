/**
 * Cacheable data fetching for the /locations directory.
 *
 * The directory is public, catalog-wide data, so these functions use the
 * shared guest token and must NOT call cookies() or headers() directly or
 * indirectly (same rule as the guest feed pages, see guest-feed-data.ts).
 */
import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { getGuestGcipIdToken } from '../../../utils/auth-server';
import {
  ApiError,
  getLocations,
  searchFeeds,
  type LocationsParams,
  type SearchFeedsResponse,
} from '../../../services/feeds';
import {
  fetchAllPages,
  getContinentSlug,
  getPageOffset,
  getTotalFeedCount,
  isLocationAtPath,
  LOCATION_FEEDS_PAGE_SIZE,
  type LocationResult,
} from './location-directory';

/** 6 hours; also flushed on demand with the existing `guest-feeds` tag. */
export const LOCATION_DIRECTORY_REVALIDATE_SECONDS = 21600;
const CACHE_TAGS = ['location-directory', 'guest-feeds'];
const CACHE_OPTIONS = {
  tags: CACHE_TAGS,
  revalidate: LOCATION_DIRECTORY_REVALIDATE_SECONDS,
};

/** The statuses `feed_counts` counts, so a location lists as many feeds. */
const DIRECTORY_FEED_STATUSES: Array<
  'active' | 'inactive' | 'development' | 'future'
> = ['active', 'inactive', 'development', 'future'];

/**
 * A URL that does not exist: a 400/404 from the API, or no location at the
 * requested path. Thrown inside the cached functions because unstable_cache
 * never stores a thrown error: caching the miss would keep a location missing
 * for hours after it starts to exist.
 */
class LocationNotFoundError extends Error {}

async function requireData<T>(
  request: () => Promise<T | undefined>,
): Promise<T> {
  try {
    const data = await request();
    if (data == undefined) {
      throw new Error('Empty response from the locations API');
    }
    return data;
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 400 || error.status === 404)
    ) {
      throw new LocationNotFoundError(error.message);
    }
    throw error;
  }
}

/** Resolves a missing location to null so the page can call notFound(). */
async function nullWhenMissing<T>(
  request: () => Promise<T>,
): Promise<T | null> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof LocationNotFoundError) return null;
    throw error;
  }
}

/** Every page of `GET /v1/locations` for the query (100 per call). */
async function getAllLocations(
  query: LocationsParams,
  accessToken: string,
): Promise<LocationResult[]> {
  return await fetchAllPages(
    async (offset, limit) =>
      await requireData(
        async () =>
          await getLocations({ ...query, limit, offset }, accessToken),
      ),
  );
}

// unstable_cache keys on the key parts plus the call arguments, so the
// arguments are kept primitive.

const cachedContinents = unstable_cache(
  async (): Promise<LocationResult[]> => {
    const accessToken = await getGuestGcipIdToken();
    return await getAllLocations(
      { location_type: 'continent', include_feed_counts: true },
      accessToken,
    );
  },
  ['location-directory-continents'],
  CACHE_OPTIONS,
);

/** The location at `continent/path`; throws when there is none. */
const cachedLocation = unstable_cache(
  async (continent: string, path: string): Promise<LocationResult> => {
    const accessToken = await getGuestGcipIdToken();
    const response = await requireData(
      async () =>
        await getLocations(
          { continent, path, include_feed_counts: true, limit: 1 },
          accessToken,
        ),
    );
    const location = response.results?.[0];
    if (
      location == undefined ||
      location.location_id == undefined ||
      !isLocationAtPath(location, continent, path.split('/'))
    ) {
      throw new LocationNotFoundError(`No location at ${continent}/${path}`);
    }
    return location;
  },
  ['location-directory-location'],
  CACHE_OPTIONS,
);

const CHILDREN_QUERY = {
  has_feeds: true,
  include_feed_counts: true,
  sort: 'feed_count',
} as const satisfies LocationsParams;

const cachedCountries = unstable_cache(
  async (continent: string): Promise<LocationResult[]> => {
    const accessToken = await getGuestGcipIdToken();
    return await getAllLocations(
      { ...CHILDREN_QUERY, continent, location_type: 'country' },
      accessToken,
    );
  },
  ['location-directory-countries'],
  CACHE_OPTIONS,
);

const cachedSubLocations = unstable_cache(
  async (parentLocationId: number): Promise<LocationResult[]> => {
    const accessToken = await getGuestGcipIdToken();
    return await getAllLocations(
      { ...CHILDREN_QUERY, parent_location_id: parentLocationId },
      accessToken,
    );
  },
  ['location-directory-sub-locations'],
  CACHE_OPTIONS,
);

/**
 * One page of feeds: newest first at the root (no location), otherwise most
 * relevant to the continent or location first.
 */
const cachedFeeds = unstable_cache(
  async (
    offset: number,
    continent: string | null,
    locationId: number | null,
  ): Promise<SearchFeedsResponse> => {
    const accessToken = await getGuestGcipIdToken();
    const location =
      locationId !== null
        ? { location_id: locationId, sort: 'location' as const }
        : continent !== null
          ? { continent, sort: 'location' as const }
          : {};
    return await requireData(
      async () =>
        await searchFeeds(
          {
            query: {
              ...location,
              status: DIRECTORY_FEED_STATUSES,
              limit: LOCATION_FEEDS_PAGE_SIZE,
              offset,
            },
          },
          accessToken,
        ),
    );
  },
  ['location-directory-feeds'],
  CACHE_OPTIONS,
);

export interface LocationPageData {
  /** The current location; null at the root. */
  location: LocationResult | null;
  /** Continents at the root, otherwise the locations with feeds one level down. */
  children: LocationResult[];
  /** The requested page of feeds located there. */
  feeds: SearchFeedsResponse;
}

async function loadLocationPage(
  page: number,
  continent: string | undefined,
  path: string,
): Promise<LocationPageData> {
  const offset = getPageOffset(page);

  if (continent === undefined) {
    const [continents, feeds] = await Promise.all([
      cachedContinents(),
      cachedFeeds(offset, null, null),
    ]);
    // Children deeper down are fetched with `has_feeds`; continents are not,
    // so that an empty continent still resolves.
    const children = continents.filter(
      (continent) => getTotalFeedCount(continent.feed_counts) > 0,
    );
    return { location: null, children, feeds };
  }

  if (path === '') {
    // Resolve the continent before listing its countries and feeds, so an
    // unknown slug is a 404 and never adds entries to the data cache.
    const continents = await cachedContinents();
    const location = continents.find(
      (candidate) => getContinentSlug(candidate) === continent,
    );
    if (location == undefined) {
      throw new LocationNotFoundError(`Unknown continent ${continent}`);
    }
    const [children, feeds] = await Promise.all([
      cachedCountries(continent),
      cachedFeeds(offset, continent, null),
    ]);
    return { location, children, feeds };
  }

  const location = await cachedLocation(continent, path);
  const locationId = location.location_id ?? 0;
  const [children, feeds] = await Promise.all([
    cachedSubLocations(locationId),
    cachedFeeds(offset, null, locationId),
  ]);
  return { location, children, feeds };
}

/**
 * Everything a directory page shows, or null when the location does not
 * exist. `path` is the location's path slugs joined with `/` (empty at the
 * root and on a continent page). React cache() dedupes the generateMetadata
 * and page calls within one request; it compares arguments by identity,
 * hence primitives.
 */
export const fetchLocationPage = cache(
  async (
    page: number,
    continent?: string,
    path: string = '',
  ): Promise<LocationPageData | null> =>
    await nullWhenMissing(
      async () => await loadLocationPage(page, continent, path),
    ),
);
