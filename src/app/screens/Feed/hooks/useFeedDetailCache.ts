import useSWR, { useSWRConfig } from 'swr';
import { type AllFeedType } from '../../../services/feeds/utils';

export interface ClientFeedCacheData {
  feed: AllFeedType;
  lastUpdated: number;
}

/**
 * Key generator for SWR feed detail caching.
 */
export function getFeedDetailCacheKey(feedDataType: string, feedId: string): string {
  return `client-feed-${feedDataType}-${feedId}`;
}

/**
 * Client-side SWR hook for cached feed detail inquiries.
 * Provides instant cached retrieval, stale-while-revalidate,
 * and user-specific client caching without bloating Next.js server cache.
 */
export function useFeedDetailCache(
  feedDataType: string,
  feedId: string,
  initialData?: AllFeedType,
) {
  const { mutate } = useSWRConfig();
  const key = getFeedDetailCacheKey(feedDataType, feedId);

  const { data, error, isLoading, isValidating } = useSWR<AllFeedType>(
    key,
    null, // Initialized from server props, revalidated via mutations or manual refresh
    {
      fallbackData: initialData,
      revalidateOnFocus: false,
      revalidateIfStale: false,
    },
  );

  const invalidateFeedCache = () => {
    return mutate(key);
  };

  const updateFeedCache = (updatedFeed: AllFeedType) => {
    return mutate(key, updatedFeed, false);
  };

  return {
    feed: data ?? initialData,
    error,
    isLoading,
    isValidating,
    invalidateFeedCache,
    updateFeedCache,
  };
}
