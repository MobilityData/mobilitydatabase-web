import FeedReliabilityView from '../../../../../../screens/Feed/components/FeedReliabilityView';
import { type ReactElement } from 'react';

interface Props {
  params: Promise<{ locale: string; feedDataType: string; feedId: string }>;
}

/**
 * Seal of Reliability breakdown page (GUEST/ISR-cacheable version).
 *
 * IMPORTANT: This page does NOT call cookies() or headers() to remain
 * ISR-compatible. User session is not available in guest route.
 */
export default async function StaticFeedReliabilityPage({
}: Props): Promise<ReactElement> {

  return <FeedReliabilityView />;
}
