import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Metadata } from 'next';
import { type Locale, routing } from '../../../i18n/routing';
import { redirect } from '../../../i18n/navigation';
import { resolveAuthAction, toLocale } from '../auth/action/lib/auth-actions';
import EmailVerificationContent from './EmailVerificationContent';

export const metadata: Metadata = {
  title: 'Email Verification | Mobility Database',
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
    lang?: string;
  }>;
}

export default async function EmailVerificationPage({
  params,
  searchParams,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;
  const { mode, oobCode, lang } = await searchParams;

  setRequestLocale(locale);

  // Back-compat: this route used to be the Firebase console's action URL for
  // every template, so emails already in inboxes point other actions here.
  // Forward those to the page that handles them; /auth/action covers new mail.
  if (mode !== undefined && mode !== 'verifyEmail') {
    const resolution = resolveAuthAction(
      { mode, oobCode, lang },
      toLocale(locale),
    );
    if (resolution.status === 'redirect') {
      redirect({
        href: { pathname: resolution.pathname, query: resolution.query },
        locale: resolution.locale,
      });
    }
  }

  return <EmailVerificationContent mode={mode} oobCode={oobCode} />;
}
