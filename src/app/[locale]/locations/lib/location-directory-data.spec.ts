/**
 * @jest-environment node
 */

import { ApiError } from '../../../services/feeds';
import { fetchLocationPage } from './location-directory-data';

jest.mock('server-only', () => ({}));

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  cache: (fn: unknown) => fn,
}));

// Behaves like unstable_cache: a resolved value is stored per key parts and
// arguments, a thrown error is not. Tests reset the store between them.
const mockCacheStore = new Map<string, unknown>();
jest.mock('next/cache', () => ({
  unstable_cache: <A extends unknown[], R>(
    fn: (...args: A) => Promise<R>,
    keyParts: string[],
  ): ((...args: A) => Promise<R>) => {
    return async (...args: A): Promise<R> => {
      const key = JSON.stringify([keyParts, args]);
      if (mockCacheStore.has(key)) return mockCacheStore.get(key) as R;
      const value = await fn(...args);
      mockCacheStore.set(key, value);
      return value;
    };
  },
}));

const mockGetLocations = jest.fn();
const mockSearchFeeds = jest.fn();

jest.mock('../../../services/feeds', () => ({
  ApiError: class ApiError extends Error {
    readonly status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  getLocations: (...args: unknown[]) => mockGetLocations(...args),
  searchFeeds: (...args: unknown[]) => mockSearchFeeds(...args),
}));

jest.mock('../../../utils/auth-server', () => ({
  getGuestGcipIdToken: async () => 'guest-token',
}));

const STATUSES = ['active', 'inactive', 'development', 'future'];

const northAmerica = {
  location_id: null,
  location_type: 'continent',
  continent_code: 'NA',
  name: 'North America',
  slug: 'north-america',
  path_slugs: ['north-america'],
  feed_counts: { total: 30 },
};
const antarctica = {
  ...northAmerica,
  continent_code: 'AN',
  name: 'Antarctica',
  slug: 'antarctica',
  path_slugs: ['antarctica'],
  feed_counts: { total: 0 },
};
const canada = {
  location_id: 1428125,
  location_type: 'country',
  continent_code: 'NA',
  name: 'Canada',
  slug: 'ca',
  path_slugs: ['ca'],
  feed_counts: { total: 25 },
};
const montreal = {
  location_id: 175905,
  location_type: 'municipality',
  continent_code: 'NA',
  name: 'Montréal',
  slug: '175905-montreal',
  path_slugs: ['ca', '61549-quebec', '175905-montreal'],
  feed_counts: { total: 22 },
};
const CONTINENT_INFO = [
  { code: 'NA', slug: 'north-america', name: 'North America' },
  { code: 'AN', slug: 'antarctica', name: 'Antarctica' },
];
const feeds = { total: 22, results: [{ id: 'mdb-1' }] };
const emptyFeeds = { total: 0, results: [] };

type Params = Record<string, unknown>;

/** Answers /v1/locations like the API, from its filters. */
function locationsApi({
  children = [montreal],
  places = [canada, montreal],
}: { children?: unknown[]; places?: Array<typeof montreal> } = {}) {
  return async (params: Params) => {
    const page = (rows: unknown[]) => {
      const offset = Number(params.offset ?? 0);
      const limit = Number(params.limit ?? 100);
      return {
        total: rows.length,
        results: rows.slice(offset, offset + limit),
      };
    };
    if (params.location_type === 'continent') {
      const continents = [northAmerica, antarctica];
      return page(
        params.continent === undefined
          ? continents
          : continents.filter(({ slug }) => slug === params.continent),
      );
    }
    if (params.location_type === 'country' && params.continent !== undefined) {
      return page([canada]);
    }
    if (params.country_code !== undefined) {
      return page(
        places.filter(
          ({ location_type, slug }) =>
            location_type === 'country' && slug === params.country_code,
        ),
      );
    }
    if (params.parent_location_id !== undefined) return page(children);
    if (params.location_id !== undefined) {
      return page(
        places.filter(({ location_id }) => location_id === params.location_id),
      );
    }
    throw new Error(`unexpected query ${JSON.stringify(params)}`);
  };
}

function locationQueries(): Params[] {
  return mockGetLocations.mock.calls.map(([params]) => params as Params);
}

function searchQueries(): Params[] {
  return mockSearchFeeds.mock.calls.map(
    ([params]) => (params as { query: Params }).query,
  );
}

describe('fetchLocationPage', () => {
  beforeEach(() => {
    mockCacheStore.clear();
    mockGetLocations.mockReset();
    mockGetLocations.mockImplementation(locationsApi());
    mockSearchFeeds.mockReset();
    mockSearchFeeds.mockResolvedValue(feeds);
  });

  it('lists the continents with feeds and the newest feeds at the root', async () => {
    const data = await fetchLocationPage(2, 'root', '');

    expect(data).toEqual({
      location: null,
      children: [northAmerica],
      feeds,
      continents: CONTINENT_INFO,
    });
    expect(locationQueries()).toEqual([
      {
        location_type: 'continent',
        include: ['feed_counts'],
        sort: 'feed_count',
        limit: 100,
        offset: 0,
      },
    ]);
    expect(searchQueries()).toEqual([
      { status: STATUSES, limit: 20, offset: 20 },
    ]);
  });

  it('lists a continent with its countries and feeds, in parallel', async () => {
    const data = await fetchLocationPage(1, 'continent', 'north-america');

    expect(data).toEqual({
      location: northAmerica,
      children: [canada],
      feeds,
      continents: CONTINENT_INFO,
    });
    expect(locationQueries()).toContainEqual({
      has_feeds: true,
      include: ['feed_counts'],
      sort: 'feed_count',
      location_type: 'country',
      continent: 'north-america',
      limit: 100,
      offset: 0,
    });
    expect(searchQueries()).toEqual([
      {
        continent: 'north-america',
        sort: 'location',
        status: STATUSES,
        limit: 20,
        offset: 0,
      },
    ]);
  });

  it('is null for an unknown continent', async () => {
    expect(await fetchLocationPage(1, 'continent', 'atlantis')).toBeNull();
  });

  it('resolves a country from its code, then its children and feeds', async () => {
    const data = await fetchLocationPage(1, 'country', 'ca');

    expect(data?.location).toEqual(canada);
    expect(data?.children).toEqual([montreal]);
    expect(locationQueries()).toContainEqual({
      location_type: 'country',
      country_code: 'ca',
      include: ['feed_counts'],
      limit: 1,
    });
    expect(locationQueries()).toContainEqual({
      has_feeds: true,
      include: ['feed_counts'],
      sort: 'feed_count',
      parent_location_id: canada.location_id,
      limit: 100,
      offset: 0,
    });
    expect(searchQueries()).toEqual([
      {
        location_id: canada.location_id,
        sort: 'location',
        status: STATUSES,
        limit: 20,
        offset: 0,
      },
    ]);
  });

  it('fetches a place, its children and its feeds from its id', async () => {
    const data = await fetchLocationPage(2, 'place', '175905');

    expect(data).toEqual({
      location: montreal,
      children: [montreal],
      feeds,
      continents: CONTINENT_INFO,
    });
    expect(locationQueries()).toContainEqual({
      location_id: 175905,
      include: ['feed_counts'],
      limit: 1,
    });
    expect(searchQueries()).toEqual([
      {
        location_id: 175905,
        sort: 'location',
        status: STATUSES,
        limit: 20,
        offset: 20,
      },
    ]);
  });

  it('is null for an unknown place or country', async () => {
    mockSearchFeeds.mockResolvedValue(emptyFeeds);
    expect(await fetchLocationPage(1, 'place', '42')).toBeNull();
    expect(await fetchLocationPage(1, 'country', 'zz')).toBeNull();
  });

  it('is null when the API rejects the request', async () => {
    mockGetLocations.mockRejectedValue(new ApiError('Bad request', 400));
    expect(await fetchLocationPage(1, 'place', '175905')).toBeNull();
  });

  it('rethrows other API errors', async () => {
    mockGetLocations.mockRejectedValue(new ApiError('Unavailable', 503));
    await expect(fetchLocationPage(1, 'place', '175905')).rejects.toThrow(
      'Unavailable',
    );
  });

  it('fetches every page of children', async () => {
    const children = Array.from({ length: 150 }, (_, index) => ({
      ...montreal,
      location_id: index + 1,
    }));
    mockGetLocations.mockImplementation(locationsApi({ children }));

    const data = await fetchLocationPage(1, 'place', '175905');

    expect(data?.children).toHaveLength(150);
    expect(
      locationQueries()
        .filter((params) => params.parent_location_id !== undefined)
        .map(({ offset }) => offset),
    ).toEqual([0, 100]);
  });

  it('caches the empty feed page of a location without feeds', async () => {
    mockSearchFeeds.mockResolvedValue(emptyFeeds);

    await fetchLocationPage(1, 'place', '175905');
    await fetchLocationPage(1, 'place', '175905');

    expect(mockSearchFeeds).toHaveBeenCalledTimes(1);
  });

  it('never caches a later page of a location without feeds', async () => {
    mockSearchFeeds.mockResolvedValue(emptyFeeds);

    await fetchLocationPage(3, 'place', '175905');
    await fetchLocationPage(3, 'place', '175905');

    expect(mockSearchFeeds).toHaveBeenCalledTimes(2);
  });

  it('never caches a page past the last one', async () => {
    mockSearchFeeds.mockResolvedValue({ total: 22, results: [] });

    await fetchLocationPage(9, 'place', '175905');
    await fetchLocationPage(9, 'place', '175905');

    expect(mockSearchFeeds).toHaveBeenCalledTimes(2);
  });

  it('never caches the empty feed page of an unknown location', async () => {
    mockSearchFeeds.mockResolvedValue(emptyFeeds);

    await fetchLocationPage(1, 'place', '42');
    await fetchLocationPage(1, 'place', '42');

    expect(mockSearchFeeds).toHaveBeenCalledTimes(2);
  });
});
