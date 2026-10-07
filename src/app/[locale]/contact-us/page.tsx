import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../i18n/routing';
import ContactUs from '../../screens/ContactUs';
import { type Metadata } from 'next';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Contact Us | Mobility Database',
  description:
    'Get in touch with the Mobility Database team. Reach out for support, data questions, or to report issues with GTFS, GTFS-RT, and GBFS transit feeds.',
  openGraph: {
    title: 'Contact Us | Mobility Database',
    description:
      'Get in touch with the Mobility Database team. Reach out for support, data questions, or to report issues with GTFS, GTFS-RT, and GBFS transit feeds.',
    url: 'https://mobilitydatabase.org/contact-us',
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

export default async function ContactUsPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;

  setRequestLocale(locale);

  return <ContactUs />;
}
