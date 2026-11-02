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
  getLocationDirectoryFeeds,
  type LocationDirectoryFeedsResponse,
  type LocationDirectoryResponse,
} from '../../../services/feeds';
import {
  getPageOffset,
  LOCATION_FEEDS_PAGE_SIZE,
  type LocationQuery,
} from './location-directory';

/** 1 day; also flushed on demand with the existing `guest-feeds` tag. */
export const LOCATION_DIRECTORY_REVALIDATE_SECONDS = 86400;
const CACHE_TAGS = ['location-directory', 'guest-feeds'];

/**
 * 400 (invalid hierarchy) and 404 (nothing located there) both mean the URL
 * does not exist; they resolve to null so the page can call notFound(). Any
 * other failure is rethrown so an error is never cached.
 */
async function nullWhenMissing<T>(
  request: () => Promise<T | undefined>,
): Promise<T | null> {
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
      return null;
    }
    throw error;
  }
}

function toQuery(
  continent: string | undefined,
  countryCode: string | undefined,
  subdivision: string | undefined,
  municipality: string | undefined,
): LocationQuery {
  const query: LocationQuery = {};
  if (continent != undefined) query.continent = continent;
  if (countryCode != undefined) query.country_code = countryCode;
  if (subdivision != undefined) query.subdivision = subdivision;
  if (municipality != undefined) query.municipality = municipality;
  return query;
}

// unstable_cache keys on the key parts plus the call arguments, so the
// arguments are kept primitive.
const cachedDirectory = unstable_cache(
  async (
    continent?: string,
    countryCode?: string,
    subdivision?: string,
    municipality?: string,
  ): Promise<LocationDirectoryResponse | null> => {
    const accessToken = await getGuestGcipIdToken();
    return await nullWhenMissing(
      async () =>
        await getLocationDirectory(
          toQuery(continent, countryCode, subdivision, municipality),
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
    countryCode?: string,
    subdivision?: string,
    municipality?: string,
  ): Promise<LocationDirectoryFeedsResponse | null> => {
    const accessToken = await getGuestGcipIdToken();
    return await nullWhenMissing(
      async () =>
        await getLocationDirectoryFeeds(
          {
            ...toQuery(continent, countryCode, subdivision, municipality),
            limit: LOCATION_FEEDS_PAGE_SIZE,
            offset,
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
    countryCode?: string,
    subdivision?: string,
    municipality?: string,
  ): Promise<LocationDirectoryResponse | null> =>
    await cachedDirectory(continent, countryCode, subdivision, municipality),
);

/** One page (1-based) of the feeds located in a node, or null if missing. */
export const fetchLocationDirectoryFeeds = cache(
  async (
    page: number,
    continent?: string,
    countryCode?: string,
    subdivision?: string,
    municipality?: string,
  ): Promise<LocationDirectoryFeedsResponse | null> =>
    await cachedDirectoryFeeds(
      getPageOffset(page),
      continent,
      countryCode,
      subdivision,
      municipality,
    ),
);
