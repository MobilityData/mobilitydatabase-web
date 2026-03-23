import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../i18n/routing';
import AboutPage from './components/AboutPage';
import { type Metadata } from 'next';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'About | MobilityDatabase',
  description:
    'Learn about MobilityDatabase, the open-source catalog of public transit feeds. Discover our mission to make GTFS, GTFS-RT, and GBFS data accessible to everyone.',
  openGraph: {
    title: 'About | MobilityDatabase',
    description:
      'Learn about MobilityDatabase, the open-source catalog of public transit feeds. Discover our mission to make GTFS, GTFS-RT, and GBFS data accessible to everyone.',
    url: 'https://mobilitydatabase.org/about',
    siteName: 'MobilityDatabase',
    type: 'website',
  },
};

export function generateStaticParams(): Array<{
  locale: Locale;
}> {
  return routing.locales.map((locale) => ({ locale }));
}

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function About({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;

  setRequestLocale(locale);

  return <AboutPage />;
}
