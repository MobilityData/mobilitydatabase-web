import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type AVAILABLE_LOCALES, routing } from '../../i18n/routing';
import HomePage from './components/HomePage';
import HomeStructuredData from './components/HomeStructuredData';
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

/** 1200x630 card: the mark, the wordmark and the three formats. */
const OG_IMAGE = {
  url: '/assets/og-image.png',
  width: 1200,
  height: 630,
  alt: 'Mobility Database — the global catalog of open transit data',
};

const DESCRIPTION =
  'Search 6000+ GTFS, GTFS-Realtime and GBFS feeds from 100+ countries in one open catalog of public transit data for developers, cities and agencies.';

export const metadata: Metadata = {
  title:
    'Mobility Database | The Global Catalog of GTFS, GTFS-Realtime & GBFS Feeds',
  description: DESCRIPTION,
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
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    // Without this the card falls back to `summary`, which crops the image
    // to a small square thumbnail.
    card: 'summary_large_image',
    title: 'Mobility Database',
    description: DESCRIPTION,
    images: [OG_IMAGE],
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

  return (
    <>
      <HomeStructuredData />
      <HomePage />
    </>
  );
}
