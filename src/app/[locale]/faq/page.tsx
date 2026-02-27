import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../i18n/routing';
import FAQ from '../../screens/FAQ';

export const dynamic = 'force-static';

export function generateStaticParams(): Array<{
  locale: Locale;
}> {
  return routing.locales.map((locale) => ({ locale }));
}

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function FAQPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;

  setRequestLocale(locale);

  return <FAQ />;
}
