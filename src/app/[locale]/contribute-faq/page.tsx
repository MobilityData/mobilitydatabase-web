import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../i18n/routing';
import FeedSubmissionFAQ from '../../screens/FeedSubmissionFAQ';
import { type Metadata } from 'next';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Feed Submission FAQ | Mobility Database',
  description:
    'Frequently asked questions about submitting transit feeds to Mobility Database. Learn how to contribute GTFS, GTFS-RT, and GBFS feeds to our global catalog.',
  openGraph: {
    title: 'Feed Submission FAQ | Mobility Database',
    description:
      'Frequently asked questions about submitting transit feeds to Mobility Database. Learn how to contribute GTFS, GTFS-RT, and GBFS feeds to our global catalog.',
    url: 'https://mobilitydatabase.org/contribute-faq',
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

export default async function ContributeFAQPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;

  setRequestLocale(locale);

  return <FeedSubmissionFAQ />;
}
