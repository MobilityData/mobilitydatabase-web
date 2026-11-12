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
const mockGetLocationByPath = jest.fn();
const mockGetLocationChildren = jest.fn();
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
  getLocationByPath: (...args: unknown[]) => mockGetLocationByPath(...args),
  getLocationChildren: (...args: unknown[]) => mockGetLocationChildren(...args),
  searchFeeds: (...args: unknown[]) => mockSearchFeeds(...args),
}));

jest.mock('../../../utils/auth-server', () => ({
  getGuestGcipIdToken: async () => 'guest-token',
}));

const STATUSES = ['active', 'inactive', 'development', 'future'];
const MONTREAL_PATH = 'north-america/canada/quebec/montreal';

const northAmerica = {
  location_id: -5,
  location_type: 'continent',
  name: 'North America',
  slug: 'north-america',
  path: 'north-america',
  path_slugs: ['north-america'],
  feed_counts: { total: 30 },
};
const montreal = {
  location_id: 175905,
  location_type: 'municipality',
  name: 'Montréal',
  slug: 'montreal',
  path: MONTREAL_PATH,
  path_slugs: ['north-america', 'canada', 'quebec', 'montreal'],
  feed_counts: { total: 22 },
};
const feeds = { total: 22, results: [{ id: 'mdb-1' }] };
const emptyFeeds = { total: 0, results: [] };

function child(index: number): typeof montreal {
  return {
    ...montreal,
    location_id: index + 1,
    slug: `child-${index + 1}`,
    path: `${MONTREAL_PATH}/child-${index + 1}`,
  };
}

/** The lookup answer: the location and the first page of its children. */
function detail(
  location: Record<string, unknown>,
  children: unknown[],
  total: number = children.length,
): Record<string, unknown> {
  return { ...location, children: { total, results: children } };
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
    mockGetLocationByPath.mockReset();
    mockGetLocationChildren.mockReset();
    mockSearchFeeds.mockReset();
    mockSearchFeeds.mockResolvedValue(feeds);
  });

  it('lists the continents with feeds and the newest feeds at the root', async () => {
    mockGetLocations.mockResolvedValue({ total: 1, results: [northAmerica] });

    const data = await fetchLocationPage(2);

    expect(data).toEqual({ location: null, children: [northAmerica], feeds });
    expect(mockGetLocations.mock.calls).toEqual([
      [
        {
          location_type: 'continent',
          has_feeds: true,
          include: ['feed_counts'],
          sort: 'feed_count',
          limit: 100,
          offset: 0,
        },
        'guest-token',
      ],
    ]);
    expect(searchQueries()).toEqual([
      { status: STATUSES, limit: 20, offset: 20 },
    ]);
    expect(mockGetLocationByPath).not.toHaveBeenCalled();
  });

  it('looks a continent up by path, like any other location', async () => {
    const canada = { ...montreal, location_type: 'country', slug: 'canada' };
    mockGetLocationByPath.mockResolvedValue(detail(northAmerica, [canada]));

    const data = await fetchLocationPage(1, 'north-america');

    expect(data).toEqual({ location: northAmerica, children: [canada], feeds });
    expect(searchQueries()).toEqual([
      {
        location_path: 'north-america',
        sort: 'location',
        status: STATUSES,
        limit: 20,
        offset: 0,
      },
    ]);
    expect(mockGetLocations).not.toHaveBeenCalled();
  });

  it('fetches the location, its children and its feeds in parallel', async () => {
    let resolveLookup: (value: unknown) => void = () => {};
    mockGetLocationByPath.mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );

    const pending = fetchLocationPage(3, MONTREAL_PATH);
    // The feeds are requested before the lookup answers.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(searchQueries()).toEqual([
      {
        location_path: MONTREAL_PATH,
        sort: 'location',
        status: STATUSES,
        limit: 20,
        offset: 40,
      },
    ]);
    resolveLookup(detail(montreal, [child(0)]));

    await expect(pending).resolves.toEqual({
      location: montreal,
      children: [child(0)],
      feeds,
    });
    expect(mockGetLocationByPath.mock.calls).toEqual([
      [
        {
          path: MONTREAL_PATH,
          include: ['feed_counts', 'children'],
          has_feeds: true,
          sort: 'feed_count',
          limit: 100,
        },
        'guest-token',
      ],
    ]);
    expect(mockGetLocationChildren).not.toHaveBeenCalled();
  });

  it('pages through the children beyond the first 100', async () => {
    const children = Array.from({ length: 230 }, (_, index) => child(index));
    mockGetLocationByPath.mockResolvedValue(
      detail(montreal, children.slice(0, 100), 230),
    );
    mockGetLocationChildren.mockImplementation(
      async (_id: number, query: { offset: number; limit: number }) => ({
        total: 230,
        results: children.slice(query.offset, query.offset + query.limit),
      }),
    );

    const data = await fetchLocationPage(1, MONTREAL_PATH);

    expect(data?.children).toEqual(children);
    expect(mockGetLocationChildren.mock.calls).toEqual([
      [
        175905,
        {
          has_feeds: true,
          include: ['feed_counts'],
          sort: 'feed_count',
          limit: 100,
          offset: 100,
        },
        'guest-token',
      ],
      [
        175905,
        {
          has_feeds: true,
          include: ['feed_counts'],
          sort: 'feed_count',
          limit: 100,
          offset: 200,
        },
        'guest-token',
      ],
    ]);
  });

  it('is null when the lookup is a 404, and never caches the miss', async () => {
    mockSearchFeeds.mockResolvedValue(emptyFeeds);
    // The lookup, then the existence check of the empty feed page.
    mockGetLocationByPath
      .mockRejectedValueOnce(new ApiError('Not Found', 404))
      .mockRejectedValueOnce(new ApiError('Not Found', 404));
    await expect(fetchLocationPage(1, MONTREAL_PATH)).resolves.toBeNull();
    // Nothing cached for the unknown path, not even its empty feed page.
    expect(mockCacheStore.size).toBe(0);

    mockSearchFeeds.mockResolvedValue(feeds);
    mockGetLocationByPath.mockResolvedValue(detail(montreal, []));
    await expect(fetchLocationPage(1, MONTREAL_PATH)).resolves.toMatchObject({
      location: montreal,
      feeds,
    });
  });

  it('caches the empty feed page of a location without feeds', async () => {
    // Stored, so that it replaces a page that had feeds before.
    mockGetLocationByPath.mockResolvedValue(detail(montreal, []));
    mockSearchFeeds.mockResolvedValue(emptyFeeds);

    await expect(fetchLocationPage(1, MONTREAL_PATH)).resolves.toMatchObject({
      feeds: emptyFeeds,
    });
    await fetchLocationPage(1, MONTREAL_PATH);
    expect(mockSearchFeeds).toHaveBeenCalledTimes(1);
    // The lookup and one existence check.
    expect(mockGetLocationByPath).toHaveBeenCalledTimes(2);
  });

  it('never caches a later page of a location without feeds', async () => {
    // Any page number would otherwise add a cache entry.
    mockGetLocationByPath.mockResolvedValue(detail(montreal, []));
    mockSearchFeeds.mockResolvedValue(emptyFeeds);

    await fetchLocationPage(2, MONTREAL_PATH);
    await fetchLocationPage(2, MONTREAL_PATH);
    await fetchLocationPage(3, MONTREAL_PATH);
    expect(mockSearchFeeds).toHaveBeenCalledTimes(3);
    // The location lookup only: no existence check for a page after the first.
    expect(mockGetLocationByPath).toHaveBeenCalledTimes(1);
  });

  it('never caches a page past the last one', async () => {
    mockGetLocationByPath.mockResolvedValue(detail(montreal, []));
    mockSearchFeeds.mockResolvedValue({ total: 22, results: [] });

    // The page turns it into a 404 (page > page count); the data layer just does not store it.
    await expect(fetchLocationPage(9, MONTREAL_PATH)).resolves.toMatchObject({
      feeds: { total: 22, results: [] },
    });
    await fetchLocationPage(9, MONTREAL_PATH);
    expect(mockSearchFeeds).toHaveBeenCalledTimes(2);
    // No existence check: the total says the location has feeds.
    expect(mockGetLocationByPath).toHaveBeenCalledTimes(1);
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
    mockGetLocationByPath.mockResolvedValue(detail(montreal, []));

    await fetchLocationPage(1, MONTREAL_PATH);
    await fetchLocationPage(2, MONTREAL_PATH);
    await fetchLocationPage(2, MONTREAL_PATH);
    // The location once; one call per feed page.
    expect(mockGetLocationByPath).toHaveBeenCalledTimes(1);
    expect(mockSearchFeeds).toHaveBeenCalledTimes(2);
  });

  it('rethrows other API errors', async () => {
    mockGetLocations.mockRejectedValueOnce(new ApiError('Server Error', 500));
    await expect(fetchLocationPage(1)).rejects.toThrow('Server Error');

    mockGetLocationByPath.mockRejectedValueOnce(
      new ApiError('Server Error', 500),
    );
    await expect(fetchLocationPage(1, MONTREAL_PATH)).rejects.toThrow(
      'Server Error',
    );
  });
});
