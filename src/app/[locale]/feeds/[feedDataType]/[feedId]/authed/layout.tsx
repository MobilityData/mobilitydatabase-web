import { type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { AUTHED_PROXY_HEADER } from '../../../../../utils/proxy-helpers';

/**
 * Force dynamic rendering for authenticated route.
 * This allows cookie() and headers() access.
 */
export const dynamic = 'force-dynamic';

interface Props {
  children: ReactNode;
}

/**
 * Shared layout for AUTHENTICATED feed pages.
 *
 * This route is reached via proxy rewrite when a session cookie exists.
 * It uses cookie-based auth to attach user identity to API calls.
 *
 * SECURITY: This route is protected from direct access by checking for a
 * custom header that only the proxy sets. Direct navigation to /authed/...
 * will return 404.
 *
 */
export default async function AuthedFeedLayout({
  children,
}: Props): Promise<React.ReactElement> {
  // Block direct access - only allow requests that came through the proxy
  const headersList = await headers();
  if (headersList.get(AUTHED_PROXY_HEADER) !== '1') {
    notFound();
  }

  return <>{children}</>;
}
