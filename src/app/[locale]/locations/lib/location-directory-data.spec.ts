/**
 * @jest-environment node
 */

import { ApiError } from '../../../services/feeds';
import {
  fetchLocationDirectory,
  fetchLocationDirectoryFeeds,
} from './location-directory-data';

jest.mock('server-only', () => ({}));

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  cache: (fn: unknown) => fn,
}));

// Behaves like unstable_cache: a resolved value is stored per arguments, a
// thrown error is not.
jest.mock('next/cache', () => ({
  unstable_cache: <A extends unknown[], R>(
    fn: (...args: A) => Promise<R>,
  ): ((...args: A) => Promise<R>) => {
    const store = new Map<string, R>();
    return async (...args: A): Promise<R> => {
      const key = JSON.stringify(args);
      if (store.has(key)) return store.get(key) as R;
      const value = await fn(...args);
      store.set(key, value);
      return value;
    };
  },
}));

const mockGetLocationDirectory = jest.fn();
const mockSearchFeeds = jest.fn();

jest.mock('../../../services/feeds', () => ({
  ApiError: class ApiError extends Error {
    readonly status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  getLocationDirectory: (...args: unknown[]) =>
    mockGetLocationDirectory(...args),
  searchFeeds: (...args: unknown[]) => mockSearchFeeds(...args),
}));

jest.mock('../../../utils/auth-server', () => ({
  getGuestGcipIdToken: async () => 'guest-token',
}));

const directory = {
  level: 'continent',
  breadcrumb: [],
  feed_counts: { gtfs: 1, gtfs_rt: 0, gbfs: 0, total: 1 },
  children: [],
};

describe('location directory data', () => {
  beforeEach(() => {
    mockGetLocationDirectory.mockReset();
    mockSearchFeeds.mockReset();
  });

  it('resolves a 404 to null without caching it', async () => {
    mockGetLocationDirectory
      .mockRejectedValueOnce(new ApiError('Not Found', 404))
      .mockResolvedValueOnce(directory);

    await expect(fetchLocationDirectory('europe')).resolves.toBeNull();
    await expect(fetchLocationDirectory('europe')).resolves.toEqual(directory);
    expect(mockGetLocationDirectory).toHaveBeenCalledTimes(2);
  });

  it('resolves a 400 on the feeds page to null without caching it', async () => {
    const feeds = { total: 0, results: [] };
    mockSearchFeeds
      .mockRejectedValueOnce(new ApiError('Bad Request', 400))
      .mockResolvedValueOnce(feeds);

    await expect(fetchLocationDirectoryFeeds(1, 'asia')).resolves.toBeNull();
    await expect(fetchLocationDirectoryFeeds(1, 'asia')).resolves.toEqual(
      feeds,
    );
  });

  it('lists the feeds of a node with search, most relevant first', async () => {
    mockSearchFeeds.mockResolvedValue({ total: 0, results: [] });

    await fetchLocationDirectoryFeeds(2, 'europe', 'portugal');
    expect(mockSearchFeeds).toHaveBeenCalledWith(
      {
        query: {
          continent: 'europe',
          country: 'portugal',
          status: ['active', 'inactive', 'development', 'future'],
          sort: 'location',
          limit: 20,
          offset: 20,
        },
      },
      'guest-token',
    );
  });

  it('lists the newest feeds at the root, which has no location', async () => {
    mockSearchFeeds.mockResolvedValue({ total: 0, results: [] });

    await fetchLocationDirectoryFeeds(1);
    const [{ query }] = mockSearchFeeds.mock.calls[0] as [
      { query: Record<string, unknown> },
    ];
    expect(query.sort).toBeUndefined();
    expect(query.continent).toBeUndefined();
  });

  it('caches a found location', async () => {
    mockGetLocationDirectory.mockResolvedValue(directory);

    await fetchLocationDirectory('oceania');
    await fetchLocationDirectory('oceania');
    expect(mockGetLocationDirectory).toHaveBeenCalledTimes(1);
  });

  it('rethrows other API errors', async () => {
    mockGetLocationDirectory.mockRejectedValueOnce(
      new ApiError('Server Error', 500),
    );

    await expect(fetchLocationDirectory('africa')).rejects.toThrow(
      'Server Error',
    );
  });
});
