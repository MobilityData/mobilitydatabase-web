import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../i18n/routing';
import TermsAndConditions from '../../screens/TermsAndConditions';
import { type Metadata } from 'next';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Terms and Conditions | Mobility Database',
  description:
    'Read the Mobility Database terms and conditions governing the use of our platform and access to our global catalog of GTFS, GTFS-RT, and GBFS transit feeds.',
  openGraph: {
    title: 'Terms and Conditions | Mobility Database',
    description:
      'Read the Mobility Database terms and conditions governing the use of our platform and access to our global catalog of GTFS, GTFS-RT, and GBFS transit feeds.',
    url: 'https://mobilitydatabase.org/terms-and-conditions',
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

export default async function TermsAndConditionsPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;

  setRequestLocale(locale);

  return <TermsAndConditions />;
}
