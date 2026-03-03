import FullMapView from '../../../../../../screens/Feed/components/FullMapView';
import { type ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { fetchCompleteFeedData } from '../../lib/feed-data';

interface Props {
  params: Promise<{ feedDataType: string; feedId: string }>;
}

/**
 * Force dynamic rendering for authenticated route.
 * This allows cookie() and headers() access.
 */
export const dynamic = 'force-dynamic';

/**
 * Full map view page for AUTHENTICATED users.
 *
 * This route is reached via proxy rewrite when a session cookie exists.
 * Uses cookie-based auth to:
 * - Attach user identity to API calls
 * - Provide user session to FullMapView for user-specific features
 *
 * Pre-fetches feed data server-side (cached per-request via React cache())
 * before rendering. FullMapView uses Redux for client-side state management.
 */
export default async function AuthedFullMapViewPage({
  params,
}: Props): Promise<ReactElement> {
  const { feedId, feedDataType } = await params;

  const feedData = await fetchCompleteFeedData(feedDataType, feedId);

  if (feedData == null) {
    notFound();
  }

  return <FullMapView feedData={feedData} />;
}
