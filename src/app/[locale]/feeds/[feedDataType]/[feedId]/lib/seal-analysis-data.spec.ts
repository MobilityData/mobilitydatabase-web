/**
 * @jest-environment node
 */

import {
  SEAL_ANALYSIS_REVALIDATE,
  fetchGuestSealAnalysisData,
} from './seal-analysis-data';

jest.mock('server-only', () => ({}));

// Pass-throughs so the real fetcher body runs. `cache` is stubbed because
// React's request-scoped memoization has no scope in a bare node test.
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  cache: (fn: unknown) => fn,
}));

const mockUnstableCache = jest.fn();
jest.mock('next/cache', () => ({
  unstable_cache: (fn: unknown, keys: unknown, opts: unknown) => {
    mockUnstableCache(keys, opts);
    return fn;
  },
}));

const mockGetGtfsFeedReliability = jest.fn();
const mockGetGtfsFeedAvailability = jest.fn();
const mockGetGtfsFeedContinuousCoverage = jest.fn();

jest.mock('../../../../../services/feeds', () => ({
  getGtfsFeedReliability: (...args: unknown[]) =>
    mockGetGtfsFeedReliability(...args),
  getGtfsFeedAvailability: (...args: unknown[]) =>
    mockGetGtfsFeedAvailability(...args),
  getGtfsFeedContinuousCoverage: (...args: unknown[]) =>
    mockGetGtfsFeedContinuousCoverage(...args),
}));

jest.mock('../../../../../utils/auth-server', () => ({
  getGuestGcipIdToken: async () => 'guest-token',
  getSSRAccessToken: async () => 'ssr-token',
  getUserContextJwtFromCookie: async () => 'user-jwt',
}));

const mockGetRemoteConfigValues = jest.fn();
jest.mock('../../../../../../lib/remote-config.server', () => ({
  getRemoteConfigValues: async () => await mockGetRemoteConfigValues(),
}));

const report = { feed_id: 'mdb-1', has_seal: true, criteria: [] };
const availability = { feed_id: 'mdb-1', total: 1, offset: 0, limit: 100 };
const coverage = { feed_id: 'mdb-1', latest_files: [] };

describe('fetchGuestSealAnalysisData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRemoteConfigValues.mockResolvedValue({
      enableSealOfReliability: true,
    });
    mockGetGtfsFeedReliability.mockResolvedValue(report);
    mockGetGtfsFeedAvailability.mockResolvedValue(availability);
    mockGetGtfsFeedContinuousCoverage.mockResolvedValue(coverage);
  });

  it('returns all three payloads on success', async () => {
    const result = await fetchGuestSealAnalysisData('gtfs', 'mdb-1');

    expect(result).toEqual({
      reliability: report,
      availability,
      continuousCoverage: coverage,
      reliabilityError: false,
    });
  });

  it('caches on the feed id alone, with a 6 hour TTL', async () => {
    await fetchGuestSealAnalysisData('gtfs', 'mdb-1');

    expect(SEAL_ANALYSIS_REVALIDATE).toBe(21600);
    // Key excludes the caller so guest and authed share one entry.
    expect(mockUnstableCache).toHaveBeenCalledWith(
      ['seal-analysis-mdb-1'],
      expect.objectContaining({
        revalidate: 21600,
        tags: ['feed-mdb-1', 'seal-analysis'],
      }),
    );
  });

  it('requests the newest page of each history endpoint', async () => {
    await fetchGuestSealAnalysisData('gtfs', 'mdb-1');

    expect(mockGetGtfsFeedAvailability).toHaveBeenCalledWith(
      'mdb-1',
      'guest-token',
      { limit: 100, sort: 'desc' },
      undefined,
    );
    expect(mockGetGtfsFeedContinuousCoverage).toHaveBeenCalledWith(
      'mdb-1',
      'guest-token',
      { limit: 100 },
      undefined,
    );
  });

  it('flags reliabilityError when the reliability call fails', async () => {
    mockGetGtfsFeedReliability.mockRejectedValue(new Error('network error'));

    const result = await fetchGuestSealAnalysisData('gtfs', 'mdb-1');

    expect(result?.reliabilityError).toBe(true);
    expect(result?.reliability).toBeUndefined();
    // The supporting history still came back and is still usable.
    expect(result?.availability).toEqual(availability);
  });

  it('degrades a failed history call without flagging reliabilityError', async () => {
    mockGetGtfsFeedAvailability.mockRejectedValue(new Error('boom'));
    mockGetGtfsFeedContinuousCoverage.mockRejectedValue(new Error('boom'));

    const result = await fetchGuestSealAnalysisData('gtfs', 'mdb-1');

    expect(result?.availability).toBeUndefined();
    expect(result?.continuousCoverage).toBeUndefined();
    expect(result?.reliabilityError).toBe(false);
    expect(result?.reliability).toEqual(report);
  });

  it('fetches nothing when the seal feature flag is off', async () => {
    mockGetRemoteConfigValues.mockResolvedValue({
      enableSealOfReliability: false,
    });

    const result = await fetchGuestSealAnalysisData('gtfs', 'mdb-1');

    expect(result).toBeUndefined();
    expect(mockGetGtfsFeedReliability).not.toHaveBeenCalled();
  });

  it.each(['gtfs_rt', 'gbfs'])(
    'fetches nothing for %s feeds, which have no seal endpoints',
    async (feedDataType) => {
      const result = await fetchGuestSealAnalysisData(feedDataType, 'mdb-1');

      expect(result).toBeUndefined();
      expect(mockGetGtfsFeedReliability).not.toHaveBeenCalled();
    },
  );
});
