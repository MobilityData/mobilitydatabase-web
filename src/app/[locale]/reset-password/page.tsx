import { type ReactElement } from 'react';
import { type Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import ResetPassword from './ResetPassword';

export const metadata: Metadata = {
  title: 'Reset Password | MobilityDatabase',
  description:
    'Choose a new password for your Mobility Database account using the link sent to your email.',
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
  searchParams: Promise<{ oobCode?: string }>;
}

/**
 * Completes a Firebase password reset. Reached from /auth/action, which is the
 * URL configured in the Firebase console for account emails.
 */
export default async function ResetPasswordPage({
  params,
  searchParams,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;
  const { oobCode } = await searchParams;

  setRequestLocale(locale);

  return <ResetPassword oobCode={oobCode} />;
}
