/**
 * Seal of Reliability data fetching for the dedicated seal-of-reliability
 *
 * The cache key is the feed id alone, so a single entry is shared across
 * requests and users, guest and authenticated alike.
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
import { getRemoteConfigValues } from '../../../../../../lib/remote-config.server';

type ReliabilityReport = components['schemas']['FeedReliabilityReport'];
type AvailabilityResponse =
  components['schemas']['GtfsFeedAvailabilityResponse'];
type ContinuousCoverageResponse =
  components['schemas']['GtfsFeedContinuousCoverageResponse'];

/**
 * 6 hours
 */
export const SEAL_ANALYSIS_REVALIDATE = 21600;

/**
 * Both history endpoints are paginated with a maximum of 100 items. We take
 * the newest page, which is what a breakdown UI needs; revisit this if the
 * design calls for a specific time window (both endpoints also accept
 * date-range filters) rather than "the most recent N".
 */
const HISTORY_LIMIT = 100;

export interface SealAnalysisData {
  reliability?: ReliabilityReport;
  availability?: AvailabilityResponse;
  continuousCoverage?: ContinuousCoverageResponse;
  /**
   * True when the reliability call failed outright - distinct from "this feed
   * has no verdict yet", which comes back as a successful response.
   */
  reliabilityError: boolean;
}

/**
 * Fetch the three seal endpoints together.
 *
 * `allSettled`, not `all`: the availability and continuous-coverage history
 * are supporting detail, so one of them failing degrades to `undefined`
 * rather than taking down a page that can still show the criteria. Only the
 * reliability breakdown reports failure, via `reliabilityError`, because the
 * seal page has nothing to render without it.
 */
async function fetchSealAnalysisImpl(
  feedId: string,
  accessToken: string,
  userContextJwt: string | undefined,
): Promise<SealAnalysisData> {
  const [reliabilityResult, availabilityResult, coverageResult] =
    await Promise.allSettled([
      getGtfsFeedReliability(feedId, accessToken, userContextJwt),
      getGtfsFeedAvailability(
        feedId,
        accessToken,
        // Passed explicitly because the OpenAPI spec contradicts itself on the
        // default ordering of `checks`.
        { limit: HISTORY_LIMIT, sort: 'desc' },
        userContextJwt,
      ),
      getGtfsFeedContinuousCoverage(
        feedId,
        accessToken,
        { limit: HISTORY_LIMIT },
        userContextJwt,
      ),
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
    continuousCoverage:
      coverageResult.status === 'fulfilled' ? coverageResult.value : undefined,
  };
}

/**
 * The shared cache entry. Keyed by feed id only - the analysis describes the
 * feed, not the caller - so guests and authenticated users read the same
 * entry. The credentials are closed over purely to authenticate the calls and
 * are intentionally excluded from the key.
 */
function cachedSealAnalysis(
  feedId: string,
  accessToken: string,
  userContextJwt: string | undefined,
): () => Promise<SealAnalysisData> {
  const cachedFetch = unstable_cache(
    async () => {
      const result = await fetchSealAnalysisImpl(
        feedId,
        accessToken,
        userContextJwt,
      );
      if (result.reliabilityError) {
        throw new Error(`Failed to load reliability data for feed ${feedId}`);
      }
      return result;
    },
    [`seal-analysis-${feedId}`],
    {
      tags: [`feed-${feedId}`, 'seal-analysis'],
      revalidate: SEAL_ANALYSIS_REVALIDATE,
    },
  );

  return async () => {
    try {
      return await cachedFetch();
    } catch {
      return { reliabilityError: true };
    }
  };
}

/** `undefined` whenever there is no analysis to fetch, rather than an error. */
function isSealAnalysisApplicable(
  feedDataType: string,
  enableSealOfReliability: boolean,
): boolean {
  // The three endpoints exist only under /v1/gtfs_feeds.
  return feedDataType === 'gtfs' && enableSealOfReliability;
}

/**
 * Guest loader, for the `static/` route tree.
 *
 * Reads no cookies and no headers, so it does not by itself force a route out
 * of static rendering - but see the file header: reading its 6-hour entry
 * from a statically rendered page would still drag that page's ISR TTL down
 * to 6 hours, so its only caller is the force-dynamic seal page.
 *
 * `cache()` dedupes within a single request; the `unstable_cache` entry it
 * wraps dedupes across requests and users.
 */
export const fetchGuestSealAnalysisData = cache(
  async (
    feedDataType: string,
    feedId: string,
  ): Promise<SealAnalysisData | undefined> => {
    const [accessToken, remoteConfig] = await Promise.all([
      getGuestGcipIdToken(),
      getRemoteConfigValues(),
    ]);

    if (
      !isSealAnalysisApplicable(
        feedDataType,
        remoteConfig.enableSealOfReliability,
      )
    ) {
      return undefined;
    }

    return await cachedSealAnalysis(feedId, accessToken, undefined)();
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
    const [accessToken, userContextJwt, remoteConfig] = await Promise.all([
      getSSRAccessToken(),
      getUserContextJwtFromCookie(),
      getRemoteConfigValues(),
    ]);

    if (
      !isSealAnalysisApplicable(
        feedDataType,
        remoteConfig.enableSealOfReliability,
      )
    ) {
      return undefined;
    }

    return await cachedSealAnalysis(feedId, accessToken, userContextJwt)();
  },
);
