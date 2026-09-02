/**
 * @jest-environment node
 */

import {
  fetchReliabilityData,
  fetchCompleteFeedDataImpl,
} from './feed-data-shared';

jest.mock('server-only', () => ({}));
jest.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
}));

const mockGetGtfsFeedReliability = jest.fn();
const mockGetGtfsFeed = jest.fn();
const mockGetGtfsFeedDatasets = jest.fn();
const mockGetGtfsFeedRoutes = jest.fn();

jest.mock('../../../../../services/feeds', () => ({
  getGtfsFeedReliability: (...args: unknown[]) =>
    mockGetGtfsFeedReliability(...args),
  getGtfsFeed: (...args: unknown[]) => mockGetGtfsFeed(...args),
  getGtfsFeedDatasets: (...args: unknown[]) => mockGetGtfsFeedDatasets(...args),
  getGtfsFeedRoutes: (...args: unknown[]) => mockGetGtfsFeedRoutes(...args),
}));

describe('fetchReliabilityData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the reliability report on success', async () => {
    const report = { feed_id: 'mdb-1', has_seal: true, criteria: [] };
    mockGetGtfsFeedReliability.mockResolvedValue(report);

    const result = await fetchReliabilityData('mdb-1', 'token', undefined);

    expect(result).toEqual(report);
  });

  // unstable_cache is mocked as a pass-through here, so this exercises the
  // real cached-fetcher function: it must reject (not resolve to `null`)
  // on failure, or a real unstable_cache would persist the failure as a
  // 14-day negative-cache entry.
  it('returns undefined without throwing when the API call fails', async () => {
    mockGetGtfsFeedReliability.mockRejectedValue(new Error('network error'));

    await expect(
      fetchReliabilityData('mdb-1', 'token', undefined),
    ).resolves.toBeUndefined();
  });
});

describe('fetchCompleteFeedDataImpl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGtfsFeed.mockResolvedValue({ id: 'mdb-1', data_type: 'gtfs' });
    mockGetGtfsFeedDatasets.mockResolvedValue([]);
    mockGetGtfsFeedRoutes.mockResolvedValue(null);
  });

  it('does not call the reliability API when enableSealOfReliability is false', async () => {
    const result = await fetchCompleteFeedDataImpl(
      'gtfs',
      'mdb-1',
      'token',
      undefined,
      false,
    );

    expect(mockGetGtfsFeedReliability).not.toHaveBeenCalled();
    expect(result.reliability).toBeUndefined();
  });

  it('calls the reliability API when enableSealOfReliability is true', async () => {
    const report = { feed_id: 'mdb-1', has_seal: true, criteria: [] };
    mockGetGtfsFeedReliability.mockResolvedValue(report);

    const result = await fetchCompleteFeedDataImpl(
      'gtfs',
      'mdb-1',
      'token',
      undefined,
      true,
    );

    expect(mockGetGtfsFeedReliability).toHaveBeenCalledTimes(1);
    expect(result.reliability).toEqual(report);
  });
});
