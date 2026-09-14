import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../../i18n/routing';
import HowItIsCalculatedPage from './components/HowItIsCalculatedPage';
import { type Metadata } from 'next';

export const dynamic = 'force-static';

const description =
  'How the Seal of Reliability is calculated: the six criteria, the exact rules behind each one, what triggers a violation, and how grace periods work.';

export const metadata: Metadata = {
  title: 'How the Seal of Reliability is calculated | MobilityDatabase',
  description,
  openGraph: {
    title: 'How the Seal of Reliability is calculated | MobilityDatabase',
    description,
    url: 'https://mobilitydatabase.org/seal-of-reliability/how-it-is-calculated',
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

export default async function SealOfReliabilityHowItIsCalculated({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;

  setRequestLocale(locale);

  return <HowItIsCalculatedPage />;
}
