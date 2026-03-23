import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../i18n/routing';
import GbfsValidator from '../../screens/GbfsValidator';
import { GbfsAuthProvider } from '../../context/GbfsAuthProvider';
import { type Metadata } from 'next';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'GBFS Validator | Mobility Database',
  description:
    'Validate your GBFS (General Bikeshare Feed Specification) feeds with the Mobility Database GBFS Validator. Check compliance and identify errors in your bikeshare or micromobility data.',
  alternates: {
    canonical: '/gbfs-validator',
  },
  openGraph: {
    title: 'GBFS Validator | Mobility Database',
    description:
      'Validate your GBFS (General Bikeshare Feed Specification) feeds with the Mobility Database GBFS Validator. Check compliance and identify errors in your bikeshare or micromobility data.',
    url: 'https://mobilitydatabase.org/gbfs-validator',
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

export default async function GbfsValidatorPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;

  setRequestLocale(locale);

  return (
    <GbfsAuthProvider>
      <GbfsValidator />
    </GbfsAuthProvider>
  );
}
