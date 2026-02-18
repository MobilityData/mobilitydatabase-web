import { NextResponse, type NextRequest } from 'next/server';
import {
  isFeedDetailPage,
  isAuthenticatedNotGuest,
  rewriteFeedRequest,
  hasLocaleInPathname,
  rewriteWithDefaultLocale,
  AUTHED_PROXY_HEADER,
  STATIC_PROXY_HEADER,
  DEFAULT_LOCALE,
} from './app/utils/proxy-helpers';

/**
 * IMPORTANT: The logic of this proxy will be tested once the [...slug] route is removed
 * Reasoning: [...slug] will catch all routes including those with wrong locale prefixes
 */

/**
 * Internationalization and auth-routing proxy following the Next.js i18n guide.
 * @see https://nextjs.org/docs/app/guides/internationalization
 *
 * Routing behavior (in order of precedence):
 * 1. SECURITY: Direct access to /authed/ routes without proxy header → layout calls notFound()
 * 2. Direct access to /static/ routes without proxy header → returns 404
 * 3. Feed detail pages with auth session → rewrite to /authed route (dynamic, non-cached)
 * 4. Feed detail pages without auth → rewrite to /static route (dynamic, ISR-cacheable)
 * 5. If supported locale exists in pathname → pass through unchanged
 * 6. Otherwise → internally rewrite to include default locale
 *
 * See src/app/utils/proxy-helpers.ts for routing helper functions.
 */
export default function proxy(request: NextRequest): NextResponse<unknown> {
  const { pathname } = request.nextUrl;

  // === Protected route checks ===

  // Allow /authed/ routes through - layout will validate proxy header and call notFound() if invalid
  if (pathname.includes('/authed')) {
    if (request.headers.get(AUTHED_PROXY_HEADER) !== '1') {
      console.log(
        'Direct access to /authed/ route (layout will handle):',
        pathname,
      );
    }
    return NextResponse.next();
  }

  // Block direct access to /static/ routes (static layout can't check headers due to ISR constraints)
  if (pathname.includes('/static')) {
    if (request.headers.get(STATIC_PROXY_HEADER) !== '1') {
      console.log('Blocked direct access to /static/ route:', pathname);
      return new NextResponse(null, { status: 404 });
    }
    return NextResponse.next();
  }

  // === Feed detail page auth routing ===

  const feedDetailPageInfo = isFeedDetailPage(pathname);
  if (
    feedDetailPageInfo.match &&
    feedDetailPageInfo.feedDataType != null &&
    feedDetailPageInfo.feedDataType !== '' &&
    feedDetailPageInfo.feedId != null &&
    feedDetailPageInfo.feedId !== ''
  ) {
    // NOTE: For extra performance gain we could set a cookie 'isGuest' so we don't need to parse and read the session
    const isAuthenticated = isAuthenticatedNotGuest(request);
    const locale = feedDetailPageInfo.locale ?? DEFAULT_LOCALE;
    const { feedDataType, feedId, subPath = '' } = feedDetailPageInfo;

    if (isAuthenticated) {
      // Authenticated: render dynamically with fresh data
      return rewriteFeedRequest(request, {
        locale,
        feedDataType,
        feedId,
        subPath,
        routeType: 'authed',
      });
    }

    // Guest: rewrite to static route for ISR caching
    return rewriteFeedRequest(request, {
      locale,
      feedDataType,
      feedId,
      subPath,
      routeType: 'static',
    });
  }

  // === Locale routing ===

  // If locale already in path, continue as-is
  if (hasLocaleInPathname(pathname)) {
    return NextResponse.next();
  }

  // No locale: internally rewrite to include default locale (URL stays unchanged for user)
  const url = request.nextUrl.clone();
  return rewriteWithDefaultLocale(url);
}

export const config = {
  // Match all pathnames except:
  // - API routes (/api)
  // - Next.js internals (/_next)
  // - Static files with extensions (.ico, .png, etc.)
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
