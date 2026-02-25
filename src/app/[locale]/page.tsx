import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type AVAILABLE_LOCALES, routing } from '../../i18n/routing';
import HomePage from './components/HomePage';
import { type Metadata } from 'next';

export const dynamic = 'force-static';

export function generateStaticParams(): Array<{
  locale: (typeof AVAILABLE_LOCALES)[number];
}> {
  return routing.locales.map((locale) => ({ locale }));
}

interface PageProps {
  params: Promise<{ locale: (typeof AVAILABLE_LOCALES)[number] }>;
}

export const metadata: Metadata = {
  title:
    'MobilityDatabase | The Global Catalog of GTFS, GTFS-Realtime & GBFS Feeds',
  description:
    'Discover open public transit data worldwide. Mobility Database provides GTFS, GTFS-RT, and GBFS feeds to help developers, cities, and agencies build better mobility tools.',
  applicationName: 'Mobility Database',

  metadataBase: new URL('https://mobilitydatabase.org'),

  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: 'https://mobilitydatabase.org',
    siteName: 'Mobility Database',
    title: 'Mobility Database',
    description:
      'Discover open public transit data worldwide. Find GTFS, GTFS-RT, and GBFS feeds to build better mobility applications.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export default async function Home({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;

  setRequestLocale(locale);

  return <HomePage />;
}
