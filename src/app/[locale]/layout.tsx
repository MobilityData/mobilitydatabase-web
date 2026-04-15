import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';
import { GoogleAnalytics } from '@next/third-parties/google';
import ThemeRegistry from '../registry';
import { Providers } from '../providers';
import { type ReactElement } from 'react';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getRemoteConfigValues } from '../../lib/remote-config.server';
import { Mulish, IBM_Plex_Mono } from 'next/font/google';
import Footer from '../components/Footer';
import Header from '../components/Header';
import { Container } from '@mui/material';
import { type Locale, routing } from '../../i18n/routing';
import { getEnvConfig } from '../utils/config';

export const metadata = {
  title:
    'MobilityDatabase | The Global Catalog of GTFS, GTFS-Realtime & GBFS Feeds',
  description:
    "Access GTFS, GTFS Realtime, GBFS transit data with over 6,000 feeds from 99+ countries on the web's leading transit data platform.",
  robots:
    process.env.VERCEL_ENV === 'production'
      ? 'index, follow'
      : 'noindex, nofollow',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/apple-touch-icon.png' }],
  },
  manifest: '/site.webmanifest',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

const mulish = Mulish({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mulish',
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ibm-plex-mono',
});

const vercelInsightsEnabled =
  process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production';

/**
 * Generate static params for all locales.
 * This enables static generation for locale-prefixed routes.
 */
export function generateStaticParams(): Array<{ locale: Locale }> {
  return routing.locales.map((locale) => ({ locale }));
}

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

/**
 * Root layout for all locale-based pages.
 * Provides i18n context, theme, and app shell (header/footer).
 */
export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps): Promise<ReactElement> {
  const { locale } = await params;

  // Validate the locale and narrow the type
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // At this point, locale is guaranteed to be a valid Locale type
  const validLocale = locale as Locale;

  // Enable static rendering for this locale
  setRequestLocale(validLocale);

  const [messages, remoteConfig] = await Promise.all([
    getMessages(),
    getRemoteConfigValues(),
  ]);

  return (
    <html lang={validLocale}>
      <head>
        <link rel='preconnect' href='https://firebaseapp.com' />
        <link rel='dns-prefetch' href='https://firebaseapp.com' />
      </head>
      <body className={`${mulish.variable} ${ibmPlexMono.variable}`}>
        <ThemeRegistry>
          <NextIntlClientProvider messages={messages}>
            <Providers remoteConfig={remoteConfig}>
              <Header />
              <Container
                maxWidth={false}
                disableGutters
                component={'main'}
                id='next'
                sx={{
                  minHeight: 'calc(100vh - 32px - 64px - 302px - 48px)',
                }}
              >
                {children}
                {vercelInsightsEnabled && (
                  <>
                    <SpeedInsights />
                    <Analytics />
                  </>
                )}
              </Container>
              <Footer />
            </Providers>
          </NextIntlClientProvider>
        </ThemeRegistry>
      </body>
      {getEnvConfig('NEXT_PUBLIC_GOOGLE_ANALYTICS_ID') !== '' && (
        <GoogleAnalytics
          gaId={getEnvConfig('NEXT_PUBLIC_GOOGLE_ANALYTICS_ID')}
        />
      )}
    </html>
  );
}
