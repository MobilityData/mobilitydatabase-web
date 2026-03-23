import FullMapView from '../../../../../../screens/Feed/components/FullMapView';
import { type ReactElement } from 'react';
import type { Metadata, ResolvingMetadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { fetchGuestFeedData } from '../../lib/guest-feed-data';
import { type FeedDataResult } from '../../lib/feed-data-shared';
import { generateMapFeedMetadata } from '../../lib/generate-feed-metadata';

interface Props {
  params: Promise<{ locale: string; feedDataType: string; feedId: string }>;
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { feedId, feedDataType } = await params;

  const [t, feedData] = await Promise.all([
    getTranslations(),
    fetchGuestFeedData(feedDataType, feedId),
  ]);

  return generateMapFeedMetadata({
    feed: feedData.feed,
    t,
  });
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
