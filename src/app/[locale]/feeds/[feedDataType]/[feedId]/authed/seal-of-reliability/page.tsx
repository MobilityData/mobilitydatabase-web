import FeedReliabilityView from '../../../../../../screens/Feed/components/FeedReliabilityView';
import { type ReactElement } from 'react';
import { fetchCompleteFeedData } from '../../lib/feed-data';
import { fetchAuthedSealAnalysisData } from '../../lib/seal-analysis-data';

interface Props {
  params: Promise<{ feedDataType: string; feedId: string }>;
}

/**
 * Force dynamic rendering for authenticated route.
 * This allows cookie() and headers() access.
 */
export const dynamic = 'force-dynamic';

export default async function AuthedFeedReliabilityPage({
  params,
}: Props): Promise<ReactElement> {
  const { feedId, feedDataType } = await params;

  const [feedData, sealAnalysis] = await Promise.all([
    fetchCompleteFeedData(feedDataType, feedId),
    fetchAuthedSealAnalysisData(feedDataType, feedId),
  ]);

  if (feedData == null) {
    return <div>Feed not found</div>;
  }

  if (sealAnalysis?.reliabilityError === true) {
    throw new Error(
      `Failed to load Seal of Reliability data for feed ${feedId}`,
    );
  }

  return (
    <FeedReliabilityView feed={feedData.feed} sealAnalysis={sealAnalysis} />
  );
}
