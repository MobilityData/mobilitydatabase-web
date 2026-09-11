/**
 * Seal of Reliability data fetching for the dedicated seal-of-reliability
 *
 * Each of the three endpoints below has its own cache entry, keyed by feed id
 * alone, so each is shared across requests and users, guest and authenticated
 * alike.
 */

import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import {
  getGtfsFeedAvailability,
  getGtfsFeedContinuousCoverage,
  getGtfsFeedReliability,
} from '../../../../../services/feeds';
import type { components } from '../../../../../services/feeds/types';
import {
  getGuestGcipIdToken,
  getSSRAccessToken,
  getUserContextJwtFromCookie,
} from '../../../../../utils/auth-server';

type ReliabilityReport = components['schemas']['FeedReliabilityReport'];
type AvailabilityResponse =
  components['schemas']['GtfsFeedAvailabilityResponse'];
type ContinuousCoverageResponse =
  components['schemas']['GtfsFeedContinuousCoverageResponse'];

/**
 * 6 hours
 */
export const SEAL_ANALYSIS_REVALIDATE = 21600;

const COVERAGE_LIMIT = 100;
/** Exported so the specs follow it rather than restating the page size. */
export const AVAILABILITY_LIMIT = 100; // to be changed to 200

/**
 * How far back the availability heatmap looks. Kept in step with
 * AVAILABILITY_HISTORY_MONTHS in screens/Feed/lib/availability-history.ts,
 * which decides how much of it is drawn.
 */
const AVAILABILITY_HISTORY_MONTHS = 6;
export const AVAILABILITY_MAX_EXTRA_PAGES = 5;

/**
 * The newest checks going back `AVAILABILITY_HISTORY_MONTHS`, flattened into
 * one response.
 *
 * One call covers the window in the ordinary case. The response reports the
 * `total` matching the window, so anything beyond the first page is fetched
 * as a fixed set of follow-up requests in parallel rather than a serial walk.
 * Sorted newest-first so that a feed checked often enough to overflow the cap
 * keeps the days the heatmap actually draws.
 */
async function fetchAvailabilityHistory(
  feedId: string,
  accessToken: string,
  userContextJwt: string | undefined,
  now: Date,
): Promise<AvailabilityResponse | undefined> {
  const from = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - AVAILABILITY_HISTORY_MONTHS,
      now.getUTCDate(),
    ),
  ).toISOString();

  const fetchPage = async (
    offset: number,
  ): Promise<AvailabilityResponse | undefined> =>
    await getGtfsFeedAvailability(
      feedId,
      accessToken,
      {
        from,
        limit: AVAILABILITY_LIMIT,
        offset,
        // Passed explicitly because the OpenAPI spec contradicts itself on the
        // default ordering of `checks`.
        sort: 'desc',
      },
      userContextJwt,
    );

  const firstPage = await fetchPage(0);
  if (firstPage == undefined) {
    return undefined;
  }

  const checks = [...firstPage.checks];

  // An empty first page means there is nothing to walk, whatever `total` says.
  if (checks.length > 0 && firstPage.total > AVAILABILITY_LIMIT) {
    const pageCount = Math.min(
      Math.ceil(firstPage.total / AVAILABILITY_LIMIT),
      AVAILABILITY_MAX_EXTRA_PAGES + 1,
    );
    const rest = await Promise.all(
      Array.from(
        { length: pageCount - 1 },
        async (_, index) => await fetchPage((index + 1) * AVAILABILITY_LIMIT),
      ),
    );
    for (const page of rest) {
      checks.push(...(page?.checks ?? []));
    }
  }

  return { ...firstPage, offset: 0, limit: checks.length, checks };
}

export interface SealAnalysisData {
  reliability?: ReliabilityReport;
  availability?: AvailabilityResponse;
  continuousCoverage?: ContinuousCoverageResponse;
  /**
   * True when the reliability call failed outright - distinct from "this feed
   * has no verdict yet", which comes back as a successful response.
   */
  reliabilityError: boolean;
  availabilityError: boolean;
}

/**
 * Cache entries below are keyed by feed id only - the analysis describes the
 * feed, not the caller - so guests and authenticated users read the same
 * entries. The credentials are closed over purely to authenticate the calls
 * and are intentionally excluded from the key.
 *
 * Each endpoint gets its own `unstable_cache` entry rather than one entry for
 * all three. `unstable_cache` never persists a rejected call, so keeping them
 * separate means a failing endpoint simply isn't cached - and retries on the
 * next request - without discarding a sibling endpoint's successful, and
 * cacheable, result.
 */
function cachedReliability(
  feedId: string,
  accessToken: string,
  userContextJwt: string | undefined,
): () => Promise<ReliabilityReport | undefined> {
  return unstable_cache(
    async () =>
      await getGtfsFeedReliability(feedId, accessToken, userContextJwt),
    [`seal-analysis-reliability-${feedId}`],
    {
      tags: [`feed-${feedId}`, 'seal-analysis'],
      revalidate: SEAL_ANALYSIS_REVALIDATE,
    },
  );
}

function cachedAvailability(
  feedId: string,
  accessToken: string,
  userContextJwt: string | undefined,
): () => Promise<AvailabilityResponse | undefined> {
  return unstable_cache(
    async () =>
      await fetchAvailabilityHistory(
        feedId,
        accessToken,
        userContextJwt,
        new Date(),
      ),
    [`seal-analysis-availability-${feedId}`],
    {
      tags: [`feed-${feedId}`, 'seal-analysis'],
      revalidate: SEAL_ANALYSIS_REVALIDATE,
    },
  );
}

function cachedContinuousCoverage(
  feedId: string,
  accessToken: string,
  userContextJwt: string | undefined,
): () => Promise<ContinuousCoverageResponse | undefined> {
  return unstable_cache(
    async () =>
      await getGtfsFeedContinuousCoverage(
        feedId,
        accessToken,
        { limit: COVERAGE_LIMIT },
        userContextJwt,
      ),
    [`seal-analysis-coverage-${feedId}`],
    {
      tags: [`feed-${feedId}`, 'seal-analysis'],
      revalidate: SEAL_ANALYSIS_REVALIDATE,
    },
  );
}

/**
 * Fetch the three seal endpoints together.
 *
 * `allSettled`, not `all`: the availability and continuous-coverage history
 * are supporting detail, so one of them failing degrades to `undefined` (with
 * its own `*Error` flag, for availability) rather than taking down a page
 * that can still show the criteria. Only the reliability breakdown ever
 * bubbles up as a thrown error past the exported loaders, because the seal
 * page has nothing to render without it - see `fetchGuestSealAnalysisData`
 * and `fetchAuthedSealAnalysisData`.
 */
async function fetchSealAnalysisImpl(
  feedId: string,
  accessToken: string,
  userContextJwt: string | undefined,
): Promise<SealAnalysisData> {
  const [reliabilityResult, availabilityResult, coverageResult] =
    await Promise.allSettled([
      cachedReliability(feedId, accessToken, userContextJwt)(),
      cachedAvailability(feedId, accessToken, userContextJwt)(),
      cachedContinuousCoverage(feedId, accessToken, userContextJwt)(),
    ]);

  return {
    reliability:
      reliabilityResult.status === 'fulfilled'
        ? reliabilityResult.value
        : undefined,
    reliabilityError: reliabilityResult.status === 'rejected',
    availability:
      availabilityResult.status === 'fulfilled'
        ? availabilityResult.value
        : undefined,
    availabilityError: availabilityResult.status === 'rejected',
    continuousCoverage:
      coverageResult.status === 'fulfilled' ? coverageResult.value : undefined,
  };
}

/** `undefined` whenever there is no analysis to fetch, rather than an error. */
function isSealAnalysisApplicable(feedDataType: string): boolean {
  // The three endpoints exist only under /v1/gtfs_feeds.
  return feedDataType === 'gtfs';
}

/**
 * Guest loader, for the `static/` route tree.
 *
 * Reads no cookies and no headers, so it does not by itself force a route out
 * of static rendering - but see the file header: reading its 6-hour entry
 * from a statically rendered page would still drag that page's ISR TTL down
 * to 6 hours, so its only caller is the force-dynamic seal page.
 *
 * `cache()` dedupes within a single request; the per-endpoint `unstable_cache`
 * entries it reads from dedupe across requests and users.
 */
export const fetchGuestSealAnalysisData = cache(
  async (
    feedDataType: string,
    feedId: string,
  ): Promise<SealAnalysisData | undefined> => {
    if (!isSealAnalysisApplicable(feedDataType)) {
      return undefined;
    }

    const accessToken = await getGuestGcipIdToken();

    return await fetchSealAnalysisImpl(feedId, accessToken, undefined);
  },
);

/**
 * Authenticated loader. Forwards end-user identity on the API calls, but
 * lands on the same feed-scoped cache entry as the guest loader.
 */
export const fetchAuthedSealAnalysisData = cache(
  async (
    feedDataType: string,
    feedId: string,
  ): Promise<SealAnalysisData | undefined> => {
    if (!isSealAnalysisApplicable(feedDataType)) {
      return undefined;
    }

    const [accessToken, userContextJwt] = await Promise.all([
      getSSRAccessToken(),
      getUserContextJwtFromCookie(),
    ]);

    return await fetchSealAnalysisImpl(feedId, accessToken, userContextJwt);
  },
);
