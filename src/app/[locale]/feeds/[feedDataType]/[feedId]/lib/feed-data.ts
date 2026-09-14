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
  isMobilityDatabaseAdmin,
} from '../../../../../utils/auth-server';
import { getRemoteConfigValues } from '../../../../../../lib/remote-config.server';
import {
  fetchCompleteFeedDataImpl,
  type FeedDataResult,
} from './feed-data-shared';

export type FeedData = FeedDataResult;

/**
 * Fetch all data needed for a feed page.
 *
 * Caching strategy:
 * - React cache(): Deduplicates within a single request (layout + page + metadata)
 * - unstable_cache with role: Server-side cache partitioned by role ('admin' | 'authenticated')
 *   instead of per-user UID, preventing cache bloat across authenticated users.
 * - Client-side SWR: Used for user-specific mutations and stale-while-revalidate client navigation.
 */
export const fetchCompleteFeedData = cache(
  async (
    feedDataType: string,
    feedId: string,
  ): Promise<FeedData | undefined> => {
    const [accessToken, userContextJwt, user, remoteConfig] = await Promise.all(
      [
        getSSRAccessToken(),
        getUserContextJwtFromCookie(),
        getCurrentUserFromCookie(),
        getRemoteConfigValues(),
      ],
    );
    const userRole =
      user?.email && isMobilityDatabaseAdmin(user.email)
        ? 'admin'
        : user
          ? 'authenticated'
          : 'guest';

    const cachedFetch = unstable_cache(
      async () => {
        return await fetchCompleteFeedDataImpl(
          feedDataType,
          feedId,
          accessToken,
          userContextJwt,
          remoteConfig.enableSealOfReliability,
        );
      },
      [`feed-role-${feedDataType}-${feedId}-${userRole}`], // shared cache key per role instead of per user
      {
        tags: [`feed-${feedId}`, `role-${userRole}`, `feed-type-${feedDataType}`],
        revalidate: 600, // 10 minutes
      },
    );

    try {
      return await cachedFetch();
    } catch (e) {
      return undefined;
    }
  },
);
