/**
 * @jest-environment node
 */

import {
  fetchReliabilityData,
  fetchCompleteFeedDataImpl,
} from './feed-data-shared';

jest.mock('server-only', () => ({}));

const mockGetGtfsFeedReliability = jest.fn();
const mockGetGtfsFeed = jest.fn();
const mockGetGtfsFeedDatasets = jest.fn();
const mockGetGtfsFeedRoutes = jest.fn();
const mockGetGtfsFeedAvailability = jest.fn();
const mockGetGtfsFeedContinuousCoverage = jest.fn();

jest.mock('../../../../../services/feeds', () => ({
  getGtfsFeedReliability: (...args: unknown[]) =>
    mockGetGtfsFeedReliability(...args),
  getGtfsFeedAvailability: (...args: unknown[]) =>
    mockGetGtfsFeedAvailability(...args),
  getGtfsFeedContinuousCoverage: (...args: unknown[]) =>
    mockGetGtfsFeedContinuousCoverage(...args),
  getGtfsFeed: (...args: unknown[]) => mockGetGtfsFeed(...args),
  getGtfsFeedDatasets: (...args: unknown[]) => mockGetGtfsFeedDatasets(...args),
  getGtfsFeedRoutes: (...args: unknown[]) => mockGetGtfsFeedRoutes(...args),
}));

const report = { feed_id: 'mdb-1', has_seal: true, criteria: [] };

describe('fetchReliabilityData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the reliability report on success', async () => {
    mockGetGtfsFeedReliability.mockResolvedValue(report);

    const result = await fetchReliabilityData('mdb-1', 'token', undefined);

    expect(result).toEqual({ reliability: report, failed: false });
  });

  it('reports failure without throwing when the API call fails', async () => {
    mockGetGtfsFeedReliability.mockRejectedValue(new Error('network error'));

    await expect(
      fetchReliabilityData('mdb-1', 'token', undefined),
    ).resolves.toEqual({ reliability: undefined, failed: true });
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
    expect(result.reliabilityError).toBe(false);
  });

  it('flags reliabilityError when the reliability API fails', async () => {
    mockGetGtfsFeedReliability.mockRejectedValue(new Error('network error'));

    const result = await fetchCompleteFeedDataImpl(
      'gtfs',
      'mdb-1',
      'token',
      undefined,
      true,
    );

    expect(result.reliability).toBeUndefined();
    expect(result.reliabilityError).toBe(true);
  });

  // Regression guard for the feed detail page's ISR TTL. This function runs
  // inside an unstable_cache, so the seal page's 6-hour entry must not be
  // reached from here: a nested unstable_cache is bypassed outright, and
  // reading that entry from the statically rendered feed page would cut the
  // page's 14-day TTL to 6 hours. See seal-analysis-data.ts.
  it('does not fetch the availability or continuous-coverage history', async () => {
    mockGetGtfsFeedReliability.mockResolvedValue(report);

    await fetchCompleteFeedDataImpl('gtfs', 'mdb-1', 'token', undefined, true);

    expect(mockGetGtfsFeedAvailability).not.toHaveBeenCalled();
    expect(mockGetGtfsFeedContinuousCoverage).not.toHaveBeenCalled();
  });
});
