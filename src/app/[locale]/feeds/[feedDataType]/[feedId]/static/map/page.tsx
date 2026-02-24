import FullMapView from '../../../../../../screens/Feed/components/FullMapView';
import { type ReactElement } from 'react';
import { fetchGuestFeedData } from '../../lib/guest-feed-data';
import { type FeedDataResult } from '../../lib/feed-data-shared';

interface Props {
  params: Promise<{ locale: string; feedDataType: string; feedId: string }>;
}

/**
 * Full map view page for feed visualization (GUEST/ISR-cacheable version).
 *
 * IMPORTANT: This page does NOT call cookies() or headers() to remain
 * ISR-compatible. User session is not available in guest route.
 *
 */
export default async function StaticFullMapViewPage({
  params,
}: Props): Promise<ReactElement> {
  const { feedId, feedDataType } = await params;

  let feedData: FeedDataResult;
  try {
    feedData = await fetchGuestFeedData(feedDataType, feedId);
  } catch (e) {
    console.error(`[StaticFullMapViewPage] Failed to fetch feed ${feedId}:`, e);
    return <div>Feed not found</div>;
  }

  return <FullMapView feedData={feedData} />;
}
