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
  getLocationDirectory,
  searchFeeds,
  type LocationDirectoryResponse,
  type SearchFeedsResponse,
} from '../../../services/feeds';
import {
  getPageOffset,
  LOCATION_FEEDS_PAGE_SIZE,
  type LocationQuery,
} from './location-directory';

/** 6 hours; also flushed on demand with the existing `guest-feeds` tag. */
export const LOCATION_DIRECTORY_REVALIDATE_SECONDS = 21600;
const CACHE_TAGS = ['location-directory', 'guest-feeds'];

/** The statuses the directory counts, so a node lists as many feeds. */
const DIRECTORY_FEED_STATUSES: Array<
  'active' | 'inactive' | 'development' | 'future'
> = ['active', 'inactive', 'development', 'future'];

/**
 * 400 (invalid hierarchy) and 404 (nothing located there) both mean the URL
 * does not exist. They are thrown as this error inside the cached functions,
 * because unstable_cache never stores a thrown error: caching the miss would
 * keep a location missing for hours after it starts to exist (e.g. a
 * 404 served before the API route was deployed).
 */
class LocationNotFoundError extends Error {}

async function requireData<T>(
  request: () => Promise<T | undefined>,
): Promise<T> {
  try {
    const data = await request();
    if (data == undefined) {
      throw new Error('Empty response from the location directory API');
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

function toQuery(
  continent: string | undefined,
  country: string | undefined,
  subdivision: string | undefined,
  municipality: string | undefined,
): LocationQuery {
  const query: LocationQuery = {};
  if (continent != undefined) query.continent = continent;
  if (country != undefined) query.country = country;
  if (subdivision != undefined) query.subdivision = subdivision;
  if (municipality != undefined) query.municipality = municipality;
  return query;
}

// unstable_cache keys on the key parts plus the call arguments, so the
// arguments are kept primitive.
const cachedDirectory = unstable_cache(
  async (
    continent?: string,
    country?: string,
    subdivision?: string,
    municipality?: string,
  ): Promise<LocationDirectoryResponse> => {
    const accessToken = await getGuestGcipIdToken();
    return await requireData(
      async () =>
        await getLocationDirectory(
          toQuery(continent, country, subdivision, municipality),
          accessToken,
        ),
    );
  },
  ['location-directory'],
  { tags: CACHE_TAGS, revalidate: LOCATION_DIRECTORY_REVALIDATE_SECONDS },
);

const cachedDirectoryFeeds = unstable_cache(
  async (
    offset: number,
    continent?: string,
    country?: string,
    subdivision?: string,
    municipality?: string,
  ): Promise<SearchFeedsResponse> => {
    const accessToken = await getGuestGcipIdToken();
    return await requireData(
      async () =>
        await searchFeeds(
          {
            query: {
              ...toQuery(continent, country, subdivision, municipality),
              status: DIRECTORY_FEED_STATUSES,
              // Most relevant location first; the API rejects it without a
              // location, so the root lists the newest feeds first.
              sort: continent != undefined ? 'location' : undefined,
              limit: LOCATION_FEEDS_PAGE_SIZE,
              offset,
            },
          },
          accessToken,
        ),
    );
  },
  ['location-directory-feeds'],
  { tags: CACHE_TAGS, revalidate: LOCATION_DIRECTORY_REVALIDATE_SECONDS },
);

/**
 * Directory node (breadcrumb, counts, children), or null when the location
 * does not exist. React cache() dedupes the generateMetadata + page calls
 * within one request; it compares arguments by identity, hence primitives.
 */
export const fetchLocationDirectory = cache(
  async (
    continent?: string,
    country?: string,
    subdivision?: string,
    municipality?: string,
  ): Promise<LocationDirectoryResponse | null> =>
    await nullWhenMissing(
      async () =>
        await cachedDirectory(continent, country, subdivision, municipality),
    ),
);

/** One page (1-based) of the feeds located in a node, or null if missing. */
export const fetchLocationDirectoryFeeds = cache(
  async (
    page: number,
    continent?: string,
    country?: string,
    subdivision?: string,
    municipality?: string,
  ): Promise<SearchFeedsResponse | null> =>
    await nullWhenMissing(
      async () =>
        await cachedDirectoryFeeds(
          getPageOffset(page),
          continent,
          country,
          subdivision,
          municipality,
        ),
    ),
);
