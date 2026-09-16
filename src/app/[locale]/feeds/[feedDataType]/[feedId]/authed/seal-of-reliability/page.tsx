import FeedReliabilityView from '../../../../../../screens/Feed/components/FeedReliabilityView';
import { type ReactElement } from 'react';
import { fetchCompleteFeedData } from '../../lib/feed-data';
import { fetchAuthedSealAnalysisData } from '../../lib/seal-analysis-data';
import { getLatestDataset } from '../../../../../../screens/Feed/Feed.functions';
import { notFound } from 'next/navigation';
import type { Metadata, ResolvingMetadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { generateSealFeedMetadata } from '../../lib/generate-feed-metadata';

interface Props {
  params: Promise<{ locale: string; feedDataType: string; feedId: string }>;
}

/**
 * Force dynamic rendering for authenticated route.
 * This allows cookie() and headers() access.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { locale, feedId, feedDataType } = await params;
  const t = await getTranslations({ locale });

  // Same cache as the page component - no extra API call.
  const feedData = await fetchCompleteFeedData(feedDataType, feedId);

  return generateSealFeedMetadata({
    feed: feedData?.feed,
    t,
  });
}

export default async function AuthedFeedReliabilityPage({
  params,
}: Props): Promise<ReactElement> {
  const { feedId, feedDataType } = await params;

  // Seal of Reliability only exists for GTFS Schedule feeds (see
  // isSealAnalysisApplicable in lib/seal-analysis-data.ts).
  if (feedDataType !== 'gtfs') {
    throw new Error(
      `Seal of Reliability is not available for data type ${feedDataType}`,
    );
  }

  const [feedData, sealAnalysis] = await Promise.all([
    fetchCompleteFeedData(feedDataType, feedId),
    fetchAuthedSealAnalysisData(feedDataType, feedId),
  ]);

  if (feedData == null) notFound();

  if (sealAnalysis?.reliabilityError === true) {
    throw new Error(
      `Failed to load Seal of Reliability data for feed ${feedId}`,
    );
  }

  return (
    <FeedReliabilityView
      feed={feedData.feed}
      latestDataset={getLatestDataset(feedData.feed, feedData.initialDatasets)}
      sealAnalysis={sealAnalysis}
    />
  );
}
