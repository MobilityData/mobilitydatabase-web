import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '../../i18n/routing';
import { verifySessionToken } from './session-jwt';

/**
 * Default locale for the application.
 */
export const DEFAULT_LOCALE = routing.defaultLocale;

/**
 * Headers used to mark requests that were rewritten by the proxy.
 * The respective layouts check for these headers to prevent direct access.
 */
export const AUTHED_PROXY_HEADER = 'x-mdb-authed-proxy';
export const STATIC_PROXY_HEADER = 'x-mdb-static-proxy';

// ============================================================================
// Feed Detail Page Detection
// ============================================================================

export interface FeedDetailPageInfo {
  match: boolean;
  locale?: string;
  feedDataType?: string;
  feedId?: string;
  subPath?: string;
}

/**
 * Check if the request is for a feed detail page.
 * Match: /feeds/gtfs/mdb-123, /feeds/gtfs_rt/mdb-456/map, etc.
 * Also matches with locale prefix: /en/feeds/gtfs/mdb-123
 */
export function isFeedDetailPage(pathname: string): FeedDetailPageInfo {
  const feedDetailRegex =
    /^\/(en|fr)?\/?(feeds)\/(gtfs|gtfs_rt|gbfs)\/([^/?]+)(\/[^?]*)?$/;
  const match = pathname.match(feedDetailRegex);
  if (match == null) {
    return { match: false };
  }
  return {
    match: true,
    locale: match[1],
    feedDataType: match[3],
    feedId: match[4],
    subPath: match[5] ?? '',
  };
}

// ============================================================================
// Auth State Detection
// ============================================================================

/**
 * Check if the request is from an authenticated user (not a guest).
 */
export function isAuthenticatedNotGuest(request: NextRequest): boolean {
  const sessionCookie = request.cookies.get('md_session');
  const userData = verifySessionToken(sessionCookie?.value ?? '');
  const isAuthenticated = userData != null ? !userData.isGuest : false;

  return isAuthenticated;
}

// ============================================================================
// Request Rewriting
// ============================================================================

/**
 * Create a new Headers object with a custom header set to '1'.
 */
function createRequestWithHeader(
  request: NextRequest,
  headerName: string,
): Headers {
  const headers = new Headers(request.headers);
  headers.set(headerName, '1');
  return headers;
}

export interface RewriteFeedRequestParams {
  locale: string;
  feedDataType: string;
  feedId: string;
  subPath: string;
  routeType: 'authed' | 'static';
}

/**
 * Rewrite a feed detail request to either /authed or /static route based on auth status.
 */
export function rewriteFeedRequest(
  request: NextRequest,
  { locale, feedDataType, feedId, subPath, routeType }: RewriteFeedRequestParams,
): NextResponse {
  const url = request.nextUrl.clone();
  const headerName = routeType === 'authed' ? AUTHED_PROXY_HEADER : STATIC_PROXY_HEADER;
  url.pathname = `/${locale}/feeds/${feedDataType}/${feedId}/${routeType}${subPath}`;

  const headers = createRequestWithHeader(request, headerName);

  return NextResponse.rewrite(url, {
    request: { headers },
  });
}

// ============================================================================
// Locale Routing
// ============================================================================

/**
 * Check if the pathname already contains a supported locale.
 */
export function hasLocaleInPathname(pathname: string): boolean {
  return routing.locales.some(
    (locale: string) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  );
}

/**
 * Internally rewrite a URL to include the default locale.
 * Browser URL remains unchanged, but server routes with the locale segment.
 */
export function rewriteWithDefaultLocale(url: URL): NextResponse {
  url.pathname = `/${routing.defaultLocale}${url.pathname}`;
  return NextResponse.rewrite(url);
}
