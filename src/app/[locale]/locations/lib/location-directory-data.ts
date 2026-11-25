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
  getPageOffset,
  LOCATION_FEEDS_PAGE_SIZE,
  toContinentInfo,
  type ContinentInfo,
  type LocationRequest,
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
 * A URL that does not exist: no location matches it, or the API rejects it
 * (400). Thrown inside the cached functions because unstable_cache never
 * stores a thrown error: caching the miss would keep a location missing for
 * hours after it starts to exist.
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

/** Locations with feeds, most feeds first, with their counts. */
const WITH_FEEDS: Pick<LocationsParams, 'has_feeds' | 'include' | 'sort'> = {
  has_feeds: true,
  include: ['feed_counts'],
  sort: 'feed_count',
};

/** Every location matching the filters (every page). */
async function fetchLocations(
  filters: LocationsParams,
): Promise<LocationResult[]> {
  const accessToken = await getGuestGcipIdToken();
  return await fetchAllPages(
    async (offset, limit) =>
      await requireData(
        async () =>
          await getLocations({ ...filters, limit, offset }, accessToken),
      ),
  );
}

/** The only location matching the filters; throws when there is none. */
async function fetchLocation(
  filters: LocationsParams,
): Promise<LocationResult> {
  const accessToken = await getGuestGcipIdToken();
  const { results } = await requireData(
    async () =>
      await getLocations(
        { ...filters, include: ['feed_counts'], limit: 1 },
        accessToken,
      ),
  );
  const location = results[0];
  if (location === undefined) throw new LocationNotFoundError('No location');
  return location;
}

// unstable_cache keys on the key parts plus the call arguments, so the
// arguments are kept primitive.

/** The seven continents with their counts, most feeds first. */
const cachedContinents = unstable_cache(
  async (): Promise<LocationResult[]> =>
    await fetchLocations({
      location_type: 'continent',
      include: ['feed_counts'],
      sort: 'feed_count',
    }),
  ['location-directory-continents'],
  CACHE_OPTIONS,
);

/** The countries of a continent (slug) that have feeds. */
const cachedContinentCountries = unstable_cache(
  async (continentSlug: string): Promise<LocationResult[]> =>
    await fetchLocations({
      ...WITH_FEEDS,
      location_type: 'country',
      continent: continentSlug,
    }),
  ['location-directory-continent-countries'],
  CACHE_OPTIONS,
);

/** The country with this ISO 3166-1 code; throws when there is none. */
const cachedCountry = unstable_cache(
  async (countryCode: string): Promise<LocationResult> =>
    await fetchLocation({
      location_type: 'country',
      country_code: countryCode,
    }),
  ['location-directory-country'],
  CACHE_OPTIONS,
);

/** The location with this id; throws when there is none. */
const cachedPlace = unstable_cache(
  async (locationId: number): Promise<LocationResult> =>
    await fetchLocation({ location_id: locationId }),
  ['location-directory-place'],
  CACHE_OPTIONS,
);

/** The direct children with feeds of a location. */
const cachedChildren = unstable_cache(
  async (parentLocationId: number): Promise<LocationResult[]> =>
    await fetchLocations({
      ...WITH_FEEDS,
      parent_location_id: parentLocationId,
    }),
  ['location-directory-children'],
  CACHE_OPTIONS,
);

/** Whose feeds a page lists: every feed, a continent's or a location's. */
type FeedScope =
  | { kind: 'all' }
  | { kind: 'continent'; continentSlug: string }
  | { kind: 'location'; locationId: number };

/**
 * Carries a feed page without results out of unstable_cache without storing
 * it: an unknown location or a page past the last one, including any page
 * after the first of a location without feeds. The feeds are fetched in
 * parallel with the location, so caching those would let any URL add entries
 * to the data cache. The first, empty page of an existing location is stored,
 * so that it replaces a page that had feeds: a refresh that throws keeps the
 * old entry.
 */
class UncachedFeedsPage extends Error {
  readonly feeds: SearchFeedsResponse;

  constructor(feeds: SearchFeedsResponse) {
    super('Empty feed page');
    this.feeds = feeds;
  }
}

/** Whether the scope's location exists; only asked when its page is empty. */
async function scopeExists(
  scope: FeedScope,
  accessToken: string,
): Promise<boolean> {
  if (scope.kind === 'all') return true;
  const filters: LocationsParams =
    scope.kind === 'continent'
      ? { location_type: 'continent', continent: scope.continentSlug }
      : { location_id: scope.locationId };
  try {
    const locations = await getLocations({ ...filters, limit: 1 }, accessToken);
    return (locations?.total ?? 0) > 0;
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) return false;
    throw error;
  }
}

function scopeQuery(
  scope: FeedScope,
):
  | { location_id: number; sort: 'location' }
  | { continent: string; sort: 'location' }
  | Record<string, never> {
  if (scope.kind === 'continent') {
    return { continent: scope.continentSlug, sort: 'location' };
  }
  if (scope.kind === 'location') {
    return { location_id: scope.locationId, sort: 'location' };
  }
  return {};
}

/**
 * One page of feeds: newest first for every feed, otherwise most relevant to
 * the continent or location first. The scope is passed as primitives, for the
 * cache key.
 */
const cachedFeeds = unstable_cache(
  async (
    offset: number,
    scopeKind: FeedScope['kind'],
    scopeValue: string | number | null,
  ): Promise<SearchFeedsResponse> => {
    const scope: FeedScope =
      scopeKind === 'continent'
        ? { kind: 'continent', continentSlug: String(scopeValue) }
        : scopeKind === 'location'
          ? { kind: 'location', locationId: Number(scopeValue) }
          : { kind: 'all' };
    const accessToken = await getGuestGcipIdToken();
    const feeds = await requireData(
      async () =>
        await searchFeeds(
          {
            query: {
              ...scopeQuery(scope),
              status: DIRECTORY_FEED_STATUSES,
              limit: LOCATION_FEEDS_PAGE_SIZE,
              offset,
            },
          },
          accessToken,
        ),
    );
    // An empty page is stored only when it is the first page of an existing
    // location: any other empty page (an unknown location, a page past the
    // last one, any page number of a location without feeds) would let a URL
    // add cache entries.
    if (
      (feeds.results ?? []).length === 0 &&
      ((feeds.total ?? 0) > 0 ||
        offset > 0 ||
        scope.kind === 'all' ||
        !(await scopeExists(scope, accessToken)))
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
  scope: FeedScope,
): Promise<SearchFeedsResponse> {
  const scopeValue =
    scope.kind === 'continent'
      ? scope.continentSlug
      : scope.kind === 'location'
        ? scope.locationId
        : null;
  try {
    return await cachedFeeds(offset, scope.kind, scopeValue);
  } catch (error) {
    if (error instanceof UncachedFeedsPage) return error.feeds;
    throw error;
  }
}

export interface LocationPageData {
  /** The current location; null at the root. */
  location: LocationResult | null;
  /** Continents with feeds at the root, otherwise the children with feeds. */
  children: LocationResult[];
  /** The requested page of feeds located there. */
  feeds: SearchFeedsResponse;
  /** The seven continents, to name and link every location's continent. */
  continents: ContinentInfo[];
}

/**
 * The location, its children and the feed page. A continent or a place is
 * fetched in parallel with its children and feeds, from the URL alone; a
 * country's id is first resolved from its code (cached).
 */
async function loadLocationPage(
  page: number,
  request: LocationRequest,
): Promise<LocationPageData> {
  const offset = getPageOffset(page);

  if (request.kind === 'root') {
    const [continents, feeds] = await Promise.all([
      cachedContinents(),
      fetchFeeds(offset, { kind: 'all' }),
    ]);
    return {
      location: null,
      children: continents.filter(
        (continent) => (continent.feed_counts?.total ?? 0) > 0,
      ),
      feeds,
      continents: toContinentInfo(continents),
    };
  }

  if (request.kind === 'continent') {
    const { continentSlug } = request;
    const [continents, children, feeds] = await Promise.all([
      cachedContinents(),
      cachedContinentCountries(continentSlug),
      fetchFeeds(offset, { kind: 'continent', continentSlug }),
    ]);
    const location = continents.find(({ slug }) => slug === continentSlug);
    if (location === undefined) throw new LocationNotFoundError(continentSlug);
    return {
      location,
      children,
      feeds,
      continents: toContinentInfo(continents),
    };
  }

  if (request.kind === 'country') {
    const [continents, location] = await Promise.all([
      cachedContinents(),
      cachedCountry(request.countryCode),
    ]);
    const locationId = location.location_id as number;
    const [children, feeds] = await Promise.all([
      cachedChildren(locationId),
      fetchFeeds(offset, { kind: 'location', locationId }),
    ]);
    return {
      location,
      children,
      feeds,
      continents: toContinentInfo(continents),
    };
  }

  const { locationId } = request;
  const [continents, location, children, feeds] = await Promise.all([
    cachedContinents(),
    cachedPlace(locationId),
    cachedChildren(locationId),
    fetchFeeds(offset, { kind: 'location', locationId }),
  ]);
  return {
    location,
    children,
    feeds,
    continents: toContinentInfo(continents),
  };
}

/**
 * Everything a directory page shows, or null when the location does not
 * exist. React cache() dedupes the generateMetadata and page calls within
 * one request; it compares arguments by identity, hence primitives: the
 * request is passed as its URL segments.
 */
export const fetchLocationPage = cache(
  async (
    page: number,
    kind: LocationRequest['kind'],
    key: string,
  ): Promise<LocationPageData | null> =>
    await nullWhenMissing(
      async () => await loadLocationPage(page, toRequest(kind, key)),
    ),
);

/** The cache() key of a request: its kind and what identifies it. */
export function requestKey(request: LocationRequest): string {
  switch (request.kind) {
    case 'root':
      return '';
    case 'continent':
      return request.continentSlug;
    case 'country':
      return request.countryCode;
    case 'place':
      return String(request.locationId);
  }
}

function toRequest(
  kind: LocationRequest['kind'],
  key: string,
): LocationRequest {
  switch (kind) {
    case 'root':
      return { kind, segments: [] };
    case 'continent':
      return { kind, segments: [], continentSlug: key };
    case 'country':
      return { kind, segments: [], countryCode: key };
    case 'place':
      return { kind, segments: [], locationId: Number(key) };
  }
}
