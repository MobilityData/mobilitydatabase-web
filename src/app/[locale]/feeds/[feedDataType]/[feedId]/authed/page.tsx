import { type ReactElement } from 'react';
import FeedView from '../../../../../screens/Feed/FeedView';
import type { Metadata, ResolvingMetadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { fetchCompleteFeedData } from '../lib/feed-data';
import { generateFeedMetadata } from '../lib/generate-feed-metadata';

interface Props {
  params: Promise<{ locale: string; feedDataType: string; feedId: string }>;
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { locale, feedId, feedDataType } = await params;
  const t = await getTranslations({ locale });

  // Use complete feed data fetcher - same cache as page component
  const feedData = await fetchCompleteFeedData(feedDataType, feedId);

  return generateFeedMetadata({
    feed: feedData?.feed,
    t,
    gtfsFeeds: feedData?.relatedFeeds ?? [],
    gtfsRtFeeds: feedData?.relatedGtfsRtFeeds ?? [],
  });
}

/**
 * Feed detail page for AUTHENTICATED users.
 *
 * This route is reached via proxy rewrite when a session cookie exists.
 * Uses cookie-based auth to attach user identity to API calls, enabling
 * user-specific features and access control.
 *
 * Data is fetched via React cache() for per-request deduplication.
 */
export default async function AuthedFeedPage({
  params,
}: Props): Promise<ReactElement> {
  const { feedId, feedDataType } = await params;

  const feedData = await fetchCompleteFeedData(feedDataType, feedId);

  if (feedData == null) {
    return <div>Feed not found</div>;
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
    <FeedView
      feed={feed}
      feedDataType={feedDataType}
      initialDatasets={initialDatasets}
      relatedFeeds={relatedFeeds}
      relatedGtfsRtFeeds={relatedGtfsRtFeeds}
      totalRoutes={totalRoutes}
      routeTypes={routeTypes}
    />
  );
}
