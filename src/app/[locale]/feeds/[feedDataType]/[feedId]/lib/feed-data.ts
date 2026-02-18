/**
 * Authenticated data fetching functions for feed pages.
 * These functions use React's cache() to deduplicate requests across components.
 * For per-user server-side caching, use unstable_cache with user ID in cache key.
 */

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import {
  getSSRAccessToken,
  getUserContextJwtFromCookie,
  getCurrentUserFromCookie,
} from '../../../../../utils/auth-server';
import {
  fetchCompleteFeedDataImpl,
  type FeedDataResult,
} from './feed-data-shared';

export type FeedData = FeedDataResult;

/**
 * Fetch all data needed for a feed page.
 *
 * Caching strategy:
 * - React cache(): Deduplicates within a single request (layout + page)
 * - unstable_cache with user ID: Server-side cache per user across navigations
 *
 * Each user gets their own cached version that persists across page navigations
 * (e.g., /feeds/gtfs/mdb-123 → /feeds/gtfs/mdb-123/map)
 * 
 * Revalidation is short due to the per-user-per-feed cache, but can be adjusted based on needs.
 */
export const fetchCompleteFeedData = cache(
  async (
    feedDataType: string,
    feedId: string,
  ): Promise<FeedData | undefined> => {
    const [accessToken, userContextJwt, user] = await Promise.all([
      getSSRAccessToken(),
      getUserContextJwtFromCookie(),
      getCurrentUserFromCookie(),
    ]);
    const userId = user?.uid ?? 'anonymous';

    const cachedFetch = unstable_cache(
      async () => {
        return await fetchCompleteFeedDataImpl(
          feedDataType,
          feedId,
          accessToken,
          userContextJwt,
        );
      },
      [`feed-complete-${feedDataType}-${feedId}-${userId}`], // unique cache key per user
      {
        tags: [`feed-${feedId}`, `user-${userId}`, `feed-type-${feedDataType}`],
        revalidate: 600, // 10 minutes - to revisit based on user usage / cache storage availability
      },
    );

    try {
      return await cachedFetch();
    } catch (e) {
      return undefined;
    }
  },
);
