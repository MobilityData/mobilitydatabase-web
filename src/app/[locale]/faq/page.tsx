import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../i18n/routing';
import FAQ from '../../screens/FAQ';
import { type Metadata } from 'next';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'FAQ | Mobility Database',
  description:
    'Find answers to frequently asked questions about Mobility Database. Learn about GTFS, GTFS-RT, and GBFS transit feeds, data access, and how to use the platform.',
  openGraph: {
    title: 'FAQ | Mobility Database',
    description:
      'Find answers to frequently asked questions about Mobility Database. Learn about GTFS, GTFS-RT, and GBFS transit feeds, data access, and how to use the platform.',
    url: 'https://mobilitydatabase.org/faq',
    siteName: 'Mobility Database',
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

export default async function FAQPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;

  setRequestLocale(locale);

  return <FAQ />;
}
