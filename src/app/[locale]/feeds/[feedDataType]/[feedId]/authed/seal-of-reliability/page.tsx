import FeedReliabilityView from '../../../../../../screens/Feed/components/FeedReliabilityView';
import { type ReactElement } from 'react';

/**
 * Force dynamic rendering for authenticated route.
 * This allows cookie() and headers() access.
 */
export const dynamic = 'force-dynamic';

export default async function AuthedFeedReliabilityPage(): Promise<ReactElement> {
  return <FeedReliabilityView />;
}
