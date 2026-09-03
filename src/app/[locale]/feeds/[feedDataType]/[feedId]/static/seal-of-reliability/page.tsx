import FeedReliabilityView from '../../../../../../screens/Feed/components/FeedReliabilityView';
import { type ReactElement } from 'react';

/**
 * Seal of Reliability breakdown page (GUEST/ISR-cacheable version).
 *
 * IMPORTANT: This page does NOT call cookies() or headers() to remain
 * ISR-compatible. User session is not available in guest route.
 */
export default async function StaticFeedReliabilityPage(): Promise<ReactElement> {
  return <FeedReliabilityView />;
}
