import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Metadata } from 'next';
import { type Locale, routing } from '../../../i18n/routing';
import EmailVerificationContent from './EmailVerificationContent';

export const metadata: Metadata = {
  title: 'Email Verification | MobilityDatabase',
  description:
    'Verify your Mobility Database account email address through Firebase authentication.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      'max-image-preview': 'none',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export function generateStaticParams(): Array<{
  locale: Locale;
}> {
  return routing.locales.map((locale) => ({ locale }));
}

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    mode?: string;
    oobCode?: string;
  }>;
}

export default async function EmailVerificationPage({
  params,
  searchParams,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;
  const { mode, oobCode } = await searchParams;

  setRequestLocale(locale);

  return <EmailVerificationContent mode={mode} oobCode={oobCode} />;
}
