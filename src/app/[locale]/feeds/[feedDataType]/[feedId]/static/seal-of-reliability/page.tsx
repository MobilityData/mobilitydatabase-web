import FeedReliabilityView from '../../../../../../screens/Feed/components/FeedReliabilityView';
import { type ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { fetchGuestFeedData } from '../../lib/guest-feed-data';
import { type FeedDataResult } from '../../lib/feed-data-shared';
import {
  fetchGuestSealAnalysisData,
  type SealAnalysisData,
} from '../../lib/seal-analysis-data';

interface Props {
  params: Promise<{ feedDataType: string; feedId: string }>;
}

/**
 * Opts this page out of the ISR page cache its layout sets up with
 * `dynamic = 'force-static'`. The nested-most segment config wins, so this
 * overrides the layout, and with PPR disabled Next excludes the route from
 * prerendering and renders it per request.
 *
 * WHY: The data coming from this page needs to be 24 hour fresh.
 * Including a complicated caching mechanism would be overkill
 * If performance or SEO scores need improving, might be worth revisiting
 *
 */
export const dynamic = 'force-dynamic';

/**
 * Seal of Reliability breakdown page (GUEST version).
 *
 * IMPORTANT: This page does NOT call cookies() or headers(). It is reached
 * via proxy rewrite for users without a session, and has no user identity to
 * read even though it renders dynamically.
 */
export default async function StaticFeedReliabilityPage({
  params,
}: Props): Promise<ReactElement> {
  const { feedId, feedDataType } = await params;

  let feedData: FeedDataResult;
  let sealAnalysis: SealAnalysisData | undefined;
  try {
    const [fetchedFeed, fetchedSeal] = await Promise.all([
      fetchGuestFeedData(feedDataType, feedId),
      fetchGuestSealAnalysisData(feedDataType, feedId),
    ]);
    feedData = fetchedFeed;
    sealAnalysis = fetchedSeal;
  } catch (e) {
    // Layout should have caught non-existent feeds, but handle edge case
    console.error(
      `[StaticFeedReliabilityPage] Failed to fetch feed ${feedId}:`,
      e,
    );
    notFound();
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
