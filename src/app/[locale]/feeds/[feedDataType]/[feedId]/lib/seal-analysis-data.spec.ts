/**
 * @jest-environment node
 */

import {
  AVAILABILITY_LIMIT,
  AVAILABILITY_MAX_EXTRA_PAGES,
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

const report = { feed_id: 'mdb-1', has_seal: true, criteria: [] };
const check = { checked_at: '2026-09-08T04:00:00Z', success: true };
const availability = {
  feed_id: 'mdb-1',
  total: 1,
  offset: 0,
  limit: AVAILABILITY_LIMIT,
  checks: [check],
};
// The loader flattens the pages it walked, so `limit` reports how many checks
// came back rather than the page size it asked for.
const flattenedAvailability = { ...availability, offset: 0, limit: 1 };
const coverage = { feed_id: 'mdb-1', latest_files: [] };

describe('fetchGuestSealAnalysisData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGtfsFeedReliability.mockResolvedValue(report);
    mockGetGtfsFeedAvailability.mockResolvedValue(availability);
    mockGetGtfsFeedContinuousCoverage.mockResolvedValue(coverage);
  });

  it('returns all three payloads on success', async () => {
    const result = await fetchGuestSealAnalysisData('gtfs', 'mdb-1');

    expect(result).toEqual({
      reliability: report,
      availability: flattenedAvailability,
      continuousCoverage: coverage,
      reliabilityError: false,
      availabilityError: false,
    });
  });

  it('caches each endpoint separately on the feed id alone, with a 6 hour TTL', async () => {
    await fetchGuestSealAnalysisData('gtfs', 'mdb-1');

    expect(SEAL_ANALYSIS_REVALIDATE).toBe(21600);
    // Keys exclude the caller so guest and authed share the same entries.
    expect(mockUnstableCache).toHaveBeenCalledTimes(3);
    for (const key of [
      'seal-analysis-reliability-mdb-1',
      'seal-analysis-availability-mdb-1',
      'seal-analysis-coverage-mdb-1',
    ]) {
      expect(mockUnstableCache).toHaveBeenCalledWith(
        [key],
        expect.objectContaining({
          revalidate: 21600,
          tags: ['feed-mdb-1', 'seal-analysis'],
        }),
      );
    }
  });

  it('requests six months of availability and the newest coverage page', async () => {
    await fetchGuestSealAnalysisData('gtfs', 'mdb-1');

    expect(mockGetGtfsFeedAvailability).toHaveBeenCalledWith(
      'mdb-1',
      'guest-token',
      {
        from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/),
        limit: AVAILABILITY_LIMIT,
        offset: 0,
        sort: 'desc',
      },
      undefined,
    );
    // One page covers the window, so `total` never asks for a second call.
    expect(mockGetGtfsFeedAvailability).toHaveBeenCalledTimes(1);
    expect(mockGetGtfsFeedContinuousCoverage).toHaveBeenCalledWith(
      'mdb-1',
      'guest-token',
      { limit: 100 },
      undefined,
    );
  });

  it('clamps the window start to a real date at month end', async () => {
    // Six months before Aug 31 is Feb 31, which rolls forward to Mar 3 unless
    // the subtraction clamps - losing days the heatmap draws.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-31T09:15:00Z'));
    try {
      await fetchGuestSealAnalysisData('gtfs', 'mdb-1');
    } finally {
      jest.useRealTimers();
    }

    expect(mockGetGtfsFeedAvailability).toHaveBeenCalledWith(
      'mdb-1',
      'guest-token',
      expect.objectContaining({ from: '2026-02-28T00:00:00.000Z' }),
      undefined,
    );
  });

  it('fetches the follow-up pages `total` reports beyond the first', async () => {
    const page = (offset: number, total: number, count: number): unknown => ({
      feed_id: 'mdb-1',
      total,
      offset,
      limit: AVAILABILITY_LIMIT,
      checks: Array.from({ length: count }, (_, index) => ({
        checked_at: `2026-09-08T04:00:0${index % 10}Z`,
        success: true,
      })),
    });
    // Two full pages and a partial third.
    const total = AVAILABILITY_LIMIT * 2 + 50;
    mockGetGtfsFeedAvailability
      .mockResolvedValueOnce(page(0, total, AVAILABILITY_LIMIT))
      .mockResolvedValueOnce(
        page(AVAILABILITY_LIMIT, total, AVAILABILITY_LIMIT),
      )
      .mockResolvedValueOnce(page(AVAILABILITY_LIMIT * 2, total, 50));

    const result = await fetchGuestSealAnalysisData('gtfs', 'mdb-1');

    expect(mockGetGtfsFeedAvailability).toHaveBeenCalledTimes(3);
    for (const offset of [AVAILABILITY_LIMIT, AVAILABILITY_LIMIT * 2]) {
      expect(mockGetGtfsFeedAvailability).toHaveBeenCalledWith(
        'mdb-1',
        'guest-token',
        expect.objectContaining({ offset, limit: AVAILABILITY_LIMIT }),
        undefined,
      );
    }
    expect(result?.availability?.checks).toHaveLength(total);
  });

  it('stops at the page cap rather than walking the whole history', async () => {
    mockGetGtfsFeedAvailability.mockResolvedValue({
      feed_id: 'mdb-1',
      total: AVAILABILITY_LIMIT * 500,
      offset: 0,
      limit: AVAILABILITY_LIMIT,
      checks: Array.from({ length: AVAILABILITY_LIMIT }, () => check),
    });

    const result = await fetchGuestSealAnalysisData('gtfs', 'mdb-1');

    // The first page plus the follow-up pages the cap allows.
    expect(mockGetGtfsFeedAvailability).toHaveBeenCalledTimes(
      AVAILABILITY_MAX_EXTRA_PAGES + 1,
    );
    expect(result?.availability?.checks).toHaveLength(
      AVAILABILITY_LIMIT * (AVAILABILITY_MAX_EXTRA_PAGES + 1),
    );
  });

  it('flags reliabilityError without discarding the other endpoints', async () => {
    mockGetGtfsFeedReliability.mockRejectedValue(new Error('network error'));

    const result = await fetchGuestSealAnalysisData('gtfs', 'mdb-1');

    expect(result?.reliabilityError).toBe(true);
    expect(result?.reliability).toBeUndefined();
    // Each endpoint has its own cache entry, so a failed reliability call
    // isn't held for the 6 hour TTL, and it doesn't take the sibling
    // endpoints' successful, independently-cached results down with it. Both
    // seal pages still throw to their error boundary on reliabilityError
    // regardless, so none of this would render anyway.
    expect(result?.availability).toEqual(flattenedAvailability);
    expect(result?.continuousCoverage).toEqual(coverage);
  });

  it('flags availabilityError without discarding reliability or coverage', async () => {
    mockGetGtfsFeedAvailability.mockRejectedValue(new Error('boom'));

    const result = await fetchGuestSealAnalysisData('gtfs', 'mdb-1');

    expect(result?.availability).toBeUndefined();
    expect(result?.availabilityError).toBe(true);
    expect(result?.continuousCoverage).toEqual(coverage);
    expect(result?.reliabilityError).toBe(false);
    expect(result?.reliability).toEqual(report);
  });

  it('degrades a failed continuous-coverage call without flagging any error', async () => {
    mockGetGtfsFeedContinuousCoverage.mockRejectedValue(new Error('boom'));

    const result = await fetchGuestSealAnalysisData('gtfs', 'mdb-1');

    expect(result?.continuousCoverage).toBeUndefined();
    expect(result?.reliabilityError).toBe(false);
    expect(result?.availabilityError).toBe(false);
    expect(result?.reliability).toEqual(report);
    expect(result?.availability).toEqual(flattenedAvailability);
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
