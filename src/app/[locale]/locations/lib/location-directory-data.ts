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
  getLocationByPath,
  getLocationChildren,
  getLocations,
  searchFeeds,
  type LocationChildrenParams,
  type SearchFeedsResponse,
} from '../../../services/feeds';
import {
  fetchAllPages,
  fetchRemainingPages,
  getPageOffset,
  LOCATION_FEEDS_PAGE_SIZE,
  LOCATIONS_API_PAGE_SIZE,
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
 * A URL that does not exist: a 400/404 from the API (an unknown path is a
 * 404 from the lookup). Thrown inside the cached functions because
 * unstable_cache never stores a thrown error: caching the miss would keep a
 * location missing for hours after it starts to exist.
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

/** Children with feeds, most feeds first, with their counts. */
function childrenQuery(): Required<
  Pick<LocationChildrenParams, 'has_feeds' | 'include' | 'sort'>
> {
  return { has_feeds: true, include: ['feed_counts'], sort: 'feed_count' };
}

// unstable_cache keys on the key parts plus the call arguments, so the
// arguments are kept primitive.

/** The continents with feeds, most feeds first (every page). */
const cachedContinents = unstable_cache(
  async (): Promise<LocationResult[]> => {
    const accessToken = await getGuestGcipIdToken();
    return await fetchAllPages(
      async (offset, limit) =>
        await requireData(
          async () =>
            await getLocations(
              { ...childrenQuery(), location_type: 'continent', limit, offset },
              accessToken,
            ),
        ),
    );
  },
  ['location-directory-continents'],
  CACHE_OPTIONS,
);

interface LocationWithChildren {
  location: LocationResult;
  /** Every direct child with feeds, most feeds first. */
  children: LocationResult[];
}

/**
 * The location at `path` and its children with feeds: one lookup holds the
 * location and the first 100 children, the remaining children pages are
 * then fetched in parallel. Throws when no location has that path.
 */
const cachedLocation = unstable_cache(
  async (path: string): Promise<LocationWithChildren> => {
    const accessToken = await getGuestGcipIdToken();
    const { children: firstPage, ...location } = await requireData(
      async () =>
        await getLocationByPath(
          {
            ...childrenQuery(),
            path,
            include: ['feed_counts', 'children'],
            limit: LOCATIONS_API_PAGE_SIZE,
          },
          accessToken,
        ),
    );
    const locationId = location.location_id;
    const children = await fetchRemainingPages(
      firstPage ?? {},
      async (offset, limit) =>
        await requireData(
          async () =>
            await getLocationChildren(
              locationId,
              { ...childrenQuery(), limit, offset },
              accessToken,
            ),
        ),
    );
    return { location, children };
  },
  ['location-directory-location'],
  CACHE_OPTIONS,
);

/**
 * Carries a feed page without results out of unstable_cache without storing
 * it: an unknown path or a page past the last one, including any page after
 * the first of a location without feeds. The feeds are fetched in parallel
 * with the location, so caching those would let any URL add entries to the
 * data cache. The first, empty page of an existing location is stored, so that
 * it replaces a page that had feeds: a refresh that throws keeps the old entry.
 */
class UncachedFeedsPage extends Error {
  readonly feeds: SearchFeedsResponse;

  constructor(feeds: SearchFeedsResponse) {
    super('Empty feed page');
    this.feeds = feeds;
  }
}

/** Whether a location has this path; only asked when its feed page is empty. */
async function locationExists(
  path: string,
  accessToken: string,
): Promise<boolean> {
  try {
    return (await getLocationByPath({ path }, accessToken)) !== undefined;
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 400 || error.status === 404)
    ) {
      return false;
    }
    throw error;
  }
}

/**
 * One page of feeds: newest first at the root (`path` null), otherwise most
 * relevant to the location at `path` first.
 */
const cachedFeeds = unstable_cache(
  async (offset: number, path: string | null): Promise<SearchFeedsResponse> => {
    const accessToken = await getGuestGcipIdToken();
    const location =
      path !== null ? { location_path: path, sort: 'location' as const } : {};
    const feeds = await requireData(
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
    // An empty page is stored only when it is the first page of an existing
    // location: any other empty page (an unknown path, a page past the last
    // one, any page number of a location without feeds) would let a URL add
    // cache entries.
    if (
      (feeds.results ?? []).length === 0 &&
      ((feeds.total ?? 0) > 0 ||
        offset > 0 ||
        path === null ||
        !(await locationExists(path, accessToken)))
    ) {
      throw new UncachedFeedsPage(feeds);
    }
    return feeds;
  },
  ['location-directory-feeds'],
  CACHE_OPTIONS,
);

async function fetchFeeds(
  offset: number,
  path: string | null,
): Promise<SearchFeedsResponse> {
  try {
    return await cachedFeeds(offset, path);
  } catch (error) {
    if (error instanceof UncachedFeedsPage) return error.feeds;
    throw error;
  }
}

export interface LocationPageData {
  /** The current location; null at the root. */
  location: LocationResult | null;
  /** Continents at the root, otherwise the locations with feeds one level down. */
  children: LocationResult[];
  /** The requested page of feeds located there. */
  feeds: SearchFeedsResponse;
}

/**
 * The location (with its children) and the feed page are fetched in
 * parallel from the path alone, in one round trip.
 */
async function loadLocationPage(
  page: number,
  path: string,
): Promise<LocationPageData> {
  const offset = getPageOffset(page);

  if (path === '') {
    const [continents, feeds] = await Promise.all([
      cachedContinents(),
      fetchFeeds(offset, null),
    ]);
    return { location: null, children: continents, feeds };
  }

  const [{ location, children }, feeds] = await Promise.all([
    cachedLocation(path),
    fetchFeeds(offset, path),
  ]);
  return { location, children, feeds };
}

/**
 * Everything a directory page shows, or null when the location does not
 * exist. `path` is the location's API path, continent first (empty at the
 * root). React cache() dedupes the generateMetadata and page calls within
 * one request; it compares arguments by identity, hence primitives.
 */
export const fetchLocationPage = cache(
  async (page: number, path: string = ''): Promise<LocationPageData | null> =>
    await nullWhenMissing(async () => await loadLocationPage(page, path)),
);
