/**
 * Guest (ISR-cacheable) data fetching functions for feed pages.
 *
 * CRITICAL: These functions must NOT call cookies() or headers() directly or
 * indirectly. Use getGuestGcipIdToken() which is cache-safe.
 *
 */

import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { getGuestGcipIdToken } from '../../../../../utils/auth-server';
import {
  fetchCompleteFeedDataImpl,
  type FeedDataResult,
} from './feed-data-shared';

/**
 * Fetch complete feed data for ISR pages.
 *
 * IMPORTANT: If the API call fails, the error is thrown (not swallowed),
 * ensuring that ISR does NOT cache an error page.
 *
 * Caching strategy:
 * - React cache(): Deduplicates within a single request (layout + page)
 * - unstable_cache: Server-side cache shared across all users and route segments
 *   (e.g., /feeds/gtfs/mdb-123 and /feeds/gtfs/mdb-123/map share the same data)
 *
 * @throws Error if feed is not found or API fails
 */
export const fetchGuestFeedData = cache(
  async (feedDataType: string, feedId: string): Promise<FeedDataResult> => {
    const cachedFetch = unstable_cache(
      async () => {
        const accessToken = await getGuestGcipIdToken();
        return await fetchCompleteFeedDataImpl(
          feedDataType,
          feedId,
          accessToken,
          undefined, // no user context for guest
        );
      },
      [`feed-guest-${feedDataType}-${feedId}`], // unique cache key
      {
        tags: [`feed-${feedId}`, `feed-type-${feedDataType}`, 'guest-feeds'],
        revalidate: 1209600, // 14 days - public feed data is relatively stable (revalidate on demand via API when feed is updated)
      },
    );

    return await cachedFetch();
  },
);
