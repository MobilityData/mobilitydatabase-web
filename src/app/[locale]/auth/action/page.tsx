import { type ReactElement } from 'react';
import { type Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '../../../../i18n/navigation';
import AuthActionError from './AuthActionError';
import {
  resolveAuthAction,
  toLocale,
  type AuthActionSearchParams,
} from './lib/auth-actions';

export const metadata: Metadata = {
  title: 'Account Action | MobilityDatabase',
  description:
    'Handles account email actions sent by Mobility Database, such as email verification and password resets.',
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

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<AuthActionSearchParams>;
}

/**
 * Single entry point for Firebase account emails.
 *
 * The Firebase console holds one action URL for every email template, so this
 * page reads the `mode` Firebase appends and forwards to the page that handles
 * it. It renders only when the action is one we don't support.
 */
export default async function AuthActionPage({
  params,
  searchParams,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;
  const { mode, oobCode, lang } = await searchParams;

  setRequestLocale(locale);

  const resolution = resolveAuthAction(
    { mode, oobCode, lang },
    toLocale(locale),
  );

  if (resolution.status === 'error') {
    return <AuthActionError reason={resolution.reason} />;
  }

  return redirect({
    href: { pathname: resolution.pathname, query: resolution.query },
    locale: resolution.locale,
  });
}
