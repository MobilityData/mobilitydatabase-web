import FeedReliabilityView from '../../../../../../screens/Feed/components/FeedReliabilityView';
import { type ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { fetchGuestFeedData } from '../../lib/guest-feed-data';
import { fetchGuestSealAnalysisData } from '../../lib/seal-analysis-data';

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

  // Seal of Reliability only exists for GTFS Schedule feeds (see
  // isSealAnalysisApplicable in lib/seal-analysis-data.ts).
  if (feedDataType !== 'gtfs') {
    throw new Error(
      `Seal of Reliability is not available for data type ${feedDataType}`,
    );
  }

  // Settled rather than all-or-nothing: the two requests fail for unrelated
  // reasons and need unrelated responses. A missing feed is a 404; a seal
  // loader that can't mint a token, read Remote Config, or reach its cache is
  // a reliability error on a page that does exist.
  const [feedResult, sealResult] = await Promise.allSettled([
    fetchGuestFeedData(feedDataType, feedId),
    fetchGuestSealAnalysisData(feedDataType, feedId),
  ]);

  if (feedResult.status === 'rejected') {
    // Layout should have caught non-existent feeds, but handle edge case
    console.error(
      `[StaticFeedReliabilityPage] Failed to fetch feed ${feedId}:`,
      feedResult.reason,
    );
    notFound();
  }

  // Rethrown as-is so this segment's error.tsx renders the full-page
  // reliability error, and the original cause keeps its stack.
  if (sealResult.status === 'rejected') {
    throw sealResult.reason;
  }

  const sealAnalysis = sealResult.value;

  if (sealAnalysis?.reliabilityError === true) {
    throw new Error(
      `Failed to load Seal of Reliability data for feed ${feedId}`,
    );
  }

  return (
    <FeedReliabilityView
      feed={feedResult.value.feed}
      sealAnalysis={sealAnalysis}
    />
  );
}
