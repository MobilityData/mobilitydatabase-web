import FeedReliabilityView from '../../../../../../screens/Feed/components/FeedReliabilityView';
import { type ReactElement } from 'react';

interface Props {
  params: Promise<{ locale: string; feedDataType: string; feedId: string }>;
}

/**
 * Force dynamic rendering for authenticated route.
 * This allows cookie() and headers() access.
 */
export const dynamic = 'force-dynamic';

export default async function AuthedFeedReliabilityPage({}: Props): Promise<ReactElement> {
  return <FeedReliabilityView />;
}
