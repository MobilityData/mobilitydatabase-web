import { type ReactElement } from 'react';
import { type Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../../i18n/routing';
import { ReduxGateWrapper } from '../../../components/ReduxGateWrapper';
import UnsubscribeContent from './UnsubscribeContent';

export const metadata: Metadata = {
  title: 'Unsubscribe | MobilityDatabase',
  description: 'Manage the Mobility Database notifications sent to your email.',
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
}

/**
 * Landing page for the unsubscribe link in notification emails
 * (`/notifications/unsubscribe?id=<subscription ID>`).
 *
 * Statically rendered: the `id` is read and the subscription looked up on
 * the client, with the visitor's Firebase user (anonymous when signed out).
 * Nothing is unsubscribed on load, because email link scanners open these
 * URLs too.
 */
export default async function UnsubscribePage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;

  setRequestLocale(locale);

  return (
    <ReduxGateWrapper>
      <UnsubscribeContent />
    </ReduxGateWrapper>
  );
}
