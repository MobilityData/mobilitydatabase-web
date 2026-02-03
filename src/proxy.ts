import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

/**
 * IMPORTANT: The logic of this proxy will be tested once the [...slug] route is removed
 * Reasoning: [...slug] will catch all routes including those with wrong locale prefixes
 */

/**
 * Internationalization proxy following the Next.js i18n guide.
 * @see https://nextjs.org/docs/app/guides/internationalization
 *
 * Behavior:
 * - If a supported locale already exists in the pathname, continue without redirect
 * - If no locale in pathname, internally rewrite to default locale path
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if any supported locale already exists in the pathname
  const pathnameHasLocale = routing.locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  // If locale exists in path, let it through
  if (pathnameHasLocale) {
    return NextResponse.next();
  }

  // No locale in pathname - rewrite to include default locale internally
  // This allows the [locale] segment to receive the default locale
  // without changing the URL the user sees
  const url = request.nextUrl.clone();
  url.pathname = `/${routing.defaultLocale}${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Match all pathnames except:
  // - API routes (/api)
  // - Next.js internals (/_next)
  // - Static files with extensions (.ico, .png, etc.)
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};

