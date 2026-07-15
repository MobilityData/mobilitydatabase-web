import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../../i18n/routing';
import { type Metadata } from 'next';
import GtfsDiffMetrobusMexicoView from '../../../screens/GtfsDiffTool/GtfsDiffMetrobusMexicoView';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'GTFS Change Tracker – CDMX Metrobús | MobilityDatabase',
  description:
    'Diff report for CDMX Metrobús (Mexico City), comparing the June 11 and June 18 2026 static feeds with validation notices and entity-level changes.',
};

export function generateStaticParams(): Array<{ locale: Locale }> {
  return routing.locales.map((locale) => ({ locale }));
}

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function GtfsDiffToolMetrobusMexicoPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  return <GtfsDiffMetrobusMexicoView />;
}
