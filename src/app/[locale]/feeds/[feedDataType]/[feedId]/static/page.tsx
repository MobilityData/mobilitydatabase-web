import { type ReactElement } from 'react';
import FeedView from '../../../../../screens/Feed/FeedView';
import FeedJsonLd from '../lib/FeedJsonLd';
import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { fetchGuestFeedData } from '../lib/guest-feed-data';
import { generateFeedMetadata } from '../lib/generate-feed-metadata';
import { type FeedDataResult } from '../lib/feed-data-shared';

interface Props {
  params: Promise<{ feedDataType: string; feedId: string }>;
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

  return generateFeedMetadata({
    feed: feedData.feed,
    t,
  });
}

export default async function StaticFeedPage({
  params,
}: Props): Promise<ReactElement> {
  const { feedId, feedDataType } = await params;
  // Use guest (ISR-safe) fetcher - cached by feedId + feedDataType only
  // If API fails, error is thrown (not cached as error page for 24h)
  let feedData: FeedDataResult;
  try {
    feedData = await fetchGuestFeedData(feedDataType, feedId);
  } catch (e) {
    // Layout should have caught non-existent feeds, but handle edge case
    console.error(`[StaticFeedPage] Failed to fetch feed ${feedId}:`, e);
    notFound();
  }

  const {
    feed,
    initialDatasets,
    relatedFeeds,
    relatedGtfsRtFeeds,
    totalRoutes,
    routeTypes,
  } = feedData;

  return (
    <>
      <FeedJsonLd
        feed={feed}
        relatedFeeds={relatedFeeds}
        relatedGtfsRtFeeds={relatedGtfsRtFeeds}
      />
      <FeedView
        feed={feed}
        initialDatasets={initialDatasets}
        relatedFeeds={relatedFeeds}
        relatedGtfsRtFeeds={relatedGtfsRtFeeds}
        totalRoutes={totalRoutes}
        routeTypes={routeTypes}
      />
    </>
  );
}
