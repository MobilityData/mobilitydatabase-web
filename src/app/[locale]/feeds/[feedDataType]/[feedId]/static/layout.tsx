import { type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { fetchGuestFeedData } from '../lib/guest-feed-data';

/**
 * ISR caching: revalidate cached HTML every 14 days.
 * This enables static generation for feed detail pages without generateStaticParams.
 * The revalidation logic will happen through the revalidation API when feed data is updated (triggered from GCP).
 */
export const dynamic = 'force-static';
export const revalidate = 1209600; // 14 days in seconds

interface Props {
  children: ReactNode;
  params: Promise<{ locale: string; feedDataType: string; feedId: string }>;
}

/**
 * Shared layout for GUEST (ISR-cacheable) feed pages.
 *
 * IMPORTANT: This layout must NOT call cookies() or headers() to remain
 * ISR-compatible. Uses fetchGuestFeedData which uses a cache-friendly token.
 *
 * SECURITY: Direct access to /static/ routes is blocked at the proxy level
 * (middleware returns 404). This route is only accessible via proxy rewrite
 * from the clean URLs like /feeds/gtfs/mdb-123.
 * NOTE: In the future we will use private route `_static` but due to our legacy handler `[...slug]` catching all routes, we need to use a public route and block access at the proxy for now.
 *
 */
export default async function StaticFeedLayout({
  children,
  params,
}: Props): Promise<React.ReactElement> {
  const { feedId, feedDataType } = await params;

  let feedData;
  try {
    feedData = await fetchGuestFeedData(feedDataType, feedId);
  } catch {
    notFound();
  }

  if (feedData == null) {
    notFound();
  }

  return <>{children}</>;
}
