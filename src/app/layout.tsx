import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';
import ThemeRegistry from './registry';
import { Providers } from './providers';
import { type ReactElement } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { getRemoteConfigValues } from '../lib/remote-config.server';
import { Mulish, IBM_Plex_Mono } from 'next/font/google';
import Footer from './components/Footer';
import Header from './components/Header';
import { Container } from '@mui/material';

export const metadata = {
  title: 'Mobility Database',
  description: 'Mobility Database',
  robots: process.env.VERCEL_ENV === 'production'
    ? 'index, follow'
    : 'noindex, nofollow',
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<ReactElement> {
  const [locale, messages, remoteConfig] = await Promise.all([
    getLocale(),
    getMessages(),
    getRemoteConfigValues(),
  ]);

  return (
    <html lang={locale}>
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
                /* 100vh - header margin - header - footer - footer padding */
                /* Not perfect, to revisit: for client loading state */
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
