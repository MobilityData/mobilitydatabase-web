import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../i18n/routing';
import SealOfReliabilityDescriptionPage from './components/SealOfReliabilityDescriptionPage';
import { type Metadata } from 'next';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Seal of Reliability | MobilityDatabase',
  description:
    'Learn about the Seal of Reliability, MobilityDatabase’s indicator of feed quality and consistency for GTFS feeds.',
  openGraph: {
    title: 'Seal of Reliability | MobilityDatabase',
    description:
      'Learn about the Seal of Reliability, MobilityDatabase’s indicator of feed quality and consistency for GTFS feeds.',
    url: 'https://mobilitydatabase.org/seal-of-reliability',
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

export default async function SealOfReliability({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;

  setRequestLocale(locale);

  return <SealOfReliabilityDescriptionPage />;
}
