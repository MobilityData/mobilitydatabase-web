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
  name: 'North America',
  slug: 'north-america',
  continent_slug: 'north-america',
  path_slugs: [],
  feed_counts: { total: 30 },
};
const antarctica = {
  ...northAmerica,
  name: 'Antarctica',
  slug: 'antarctica',
  continent_slug: 'antarctica',
  feed_counts: { total: 0 },
};
const montreal = {
  location_id: 175905,
  location_type: 'municipality',
  name: 'Montréal',
  slug: 'montreal',
  continent_slug: 'north-america',
  path_slugs: ['canada', 'quebec', 'montreal'],
  feed_counts: { total: 22 },
};
const feeds = { total: 22, results: [] };

/** getLocations answers by query shape. */
function answerLocations(
  byQuery: (query: Record<string, unknown>) => unknown,
): void {
  mockGetLocations.mockImplementation(async (query: Record<string, unknown>) =>
    byQuery(query),
  );
}

function locationQueries(): Array<Record<string, unknown>> {
  return mockGetLocations.mock.calls.map(
    ([query]) => query as Record<string, unknown>,
  );
}

function searchQueries(): Array<Record<string, unknown>> {
  return mockSearchFeeds.mock.calls.map(
    ([params]) => (params as { query: Record<string, unknown> }).query,
  );
}

describe('fetchLocationPage', () => {
  beforeEach(() => {
    mockCacheStore.clear();
    mockGetLocations.mockReset();
    mockSearchFeeds.mockReset();
    mockSearchFeeds.mockResolvedValue(feeds);
  });

  it('lists the continents with feeds and the newest feeds at the root', async () => {
    answerLocations(() => ({ total: 2, results: [northAmerica, antarctica] }));

    const data = await fetchLocationPage(2);

    expect(data).toEqual({ location: null, children: [northAmerica], feeds });
    expect(locationQueries()).toEqual([
      {
        location_type: 'continent',
        include_feed_counts: true,
        limit: 100,
        offset: 0,
      },
    ]);
    expect(mockGetLocations.mock.calls[0][1]).toBe('guest-token');
    expect(searchQueries()).toEqual([
      { status: STATUSES, limit: 20, offset: 20 },
    ]);
  });

  it('lists the countries and feeds of a continent', async () => {
    const canada = { ...montreal, location_type: 'country', slug: 'canada' };
    answerLocations((query) =>
      query.location_type === 'continent'
        ? { total: 1, results: [northAmerica] }
        : { total: 1, results: [canada] },
    );

    const data = await fetchLocationPage(1, 'north-america', '');

    expect(data).toEqual({ location: northAmerica, children: [canada], feeds });
    expect(locationQueries()[1]).toEqual({
      continent: 'north-america',
      location_type: 'country',
      has_feeds: true,
      include_feed_counts: true,
      sort: 'feed_count',
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

  it('is null for an unknown continent, without listing anything', async () => {
    answerLocations(() => ({ total: 1, results: [northAmerica] }));

    await expect(fetchLocationPage(1, 'atlantis', '')).resolves.toBeNull();
    expect(mockGetLocations).toHaveBeenCalledTimes(1);
    expect(mockSearchFeeds).not.toHaveBeenCalled();
  });

  it('resolves a deeper location by path, then its children and feeds', async () => {
    const child = { ...montreal, location_id: 1, slug: 'ville-marie' };
    answerLocations((query) =>
      query.path !== undefined
        ? { total: 1, results: [montreal] }
        : { total: 1, results: [child] },
    );

    const data = await fetchLocationPage(
      3,
      'north-america',
      'canada/quebec/montreal',
    );

    expect(data).toEqual({ location: montreal, children: [child], feeds });
    expect(locationQueries()).toEqual([
      {
        continent: 'north-america',
        path: 'canada/quebec/montreal',
        include_feed_counts: true,
        limit: 1,
      },
      {
        parent_location_id: 175905,
        has_feeds: true,
        include_feed_counts: true,
        sort: 'feed_count',
        limit: 100,
        offset: 0,
      },
    ]);
    expect(searchQueries()).toEqual([
      {
        location_id: 175905,
        sort: 'location',
        status: STATUSES,
        limit: 20,
        offset: 40,
      },
    ]);
  });

  it('pages through every child location', async () => {
    const children = Array.from({ length: 230 }, (_, index) => ({
      ...montreal,
      location_id: index + 1,
      slug: `child-${index + 1}`,
    }));
    answerLocations((query) => {
      if (query.path !== undefined) return { total: 1, results: [montreal] };
      const offset = query.offset as number;
      const limit = query.limit as number;
      return { total: 230, results: children.slice(offset, offset + limit) };
    });

    const data = await fetchLocationPage(
      1,
      'north-america',
      'canada/quebec/montreal',
    );

    expect(data?.children).toEqual(children);
    expect(
      locationQueries()
        .slice(1)
        .map(({ offset, limit }) => [offset, limit]),
    ).toEqual([
      [0, 100],
      [100, 100],
      [200, 100],
    ]);
  });

  it('is null when no location has the path, and never caches the miss', async () => {
    answerLocations(() => ({ total: 0, results: [] }));
    await expect(
      fetchLocationPage(1, 'north-america', 'canada/quebec/montreal'),
    ).resolves.toBeNull();
    expect(mockSearchFeeds).not.toHaveBeenCalled();

    answerLocations((query) =>
      query.path !== undefined
        ? { total: 1, results: [montreal] }
        : { total: 0, results: [] },
    );
    await expect(
      fetchLocationPage(1, 'north-america', 'canada/quebec/montreal'),
    ).resolves.toMatchObject({ location: montreal });
  });

  it('is null when the result is not at the requested continent or path', async () => {
    answerLocations(() => ({ total: 1, results: [montreal] }));

    // The API accepts continent codes too; only slugs are valid URLs.
    await expect(
      fetchLocationPage(1, 'na', 'canada/quebec/montreal'),
    ).resolves.toBeNull();
    await expect(
      fetchLocationPage(1, 'north-america', 'canada/quebec'),
    ).resolves.toBeNull();
  });

  it('resolves a 400 or 404 to null without caching it', async () => {
    mockGetLocations
      .mockRejectedValueOnce(new ApiError('Bad Request', 400))
      .mockResolvedValue({ total: 1, results: [northAmerica] });

    await expect(fetchLocationPage(1)).resolves.toBeNull();
    await expect(fetchLocationPage(1)).resolves.toMatchObject({
      children: [northAmerica],
    });

    mockSearchFeeds.mockReset();
    mockSearchFeeds
      .mockRejectedValueOnce(new ApiError('Not Found', 404))
      .mockResolvedValueOnce(feeds);
    await expect(fetchLocationPage(2)).resolves.toBeNull();
    await expect(fetchLocationPage(2)).resolves.toMatchObject({ feeds });
  });

  it('caches a found location', async () => {
    answerLocations((query) =>
      query.path !== undefined
        ? { total: 1, results: [montreal] }
        : { total: 0, results: [] },
    );

    await fetchLocationPage(1, 'north-america', 'canada/quebec/montreal');
    await fetchLocationPage(2, 'north-america', 'canada/quebec/montreal');
    // Location and children once; one feed page each.
    expect(mockGetLocations).toHaveBeenCalledTimes(2);
    expect(mockSearchFeeds).toHaveBeenCalledTimes(2);
  });

  it('rethrows other API errors', async () => {
    mockGetLocations.mockRejectedValueOnce(new ApiError('Server Error', 500));

    await expect(fetchLocationPage(1)).rejects.toThrow('Server Error');
  });
});
