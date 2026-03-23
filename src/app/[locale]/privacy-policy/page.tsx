import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../i18n/routing';
import PrivacyPolicy from '../../screens/PrivacyPolicy';
import { type Metadata } from 'next';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Privacy Policy | Mobility Database',
  description:
    'Read the Mobility Database privacy policy to understand how we collect, use, and protect your personal information when you use our transit data platform.',
  openGraph: {
    title: 'Privacy Policy | Mobility Database',
    description:
      'Read the Mobility Database privacy policy to understand how we collect, use, and protect your personal information when you use our transit data platform.',
    url: 'https://mobilitydatabase.org/privacy-policy',
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

export default async function PrivacyPolicyPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;

  setRequestLocale(locale);

  return <PrivacyPolicy />;
}
