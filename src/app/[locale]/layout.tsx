import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';
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
import { routing } from '../../i18n/routing';

export const metadata = {
  title: 'Mobility Database',
  description: 'Mobility Database',
  robots:
    process.env.VERCEL_ENV === 'production'
      ? 'index, follow'
      : 'noindex, nofollow',
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

/**
 * Generate static params for all locales.
 * This enables static generation for locale-prefixed routes.
 */
export function generateStaticParams() {
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

  // Validate the locale
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering for this locale
  setRequestLocale(locale);

  const [messages, remoteConfig] = await Promise.all([
    getMessages(),
    getRemoteConfigValues(),
  ]);

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://firebaseapp.com" />
        <link rel="dns-prefetch" href="https://firebaseapp.com" />
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
                  minHeight: 'calc(100vh - 32px - 64px - 232px - 20px)',
                }}
              >
                {children}
                <SpeedInsights />
                <Analytics />
              </Container>
              <Footer />
            </Providers>
          </NextIntlClientProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}

