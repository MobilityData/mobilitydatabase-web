import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../../i18n/routing';
import { type Metadata } from 'next';
import GtfsDiffExampleView from '../../../screens/GtfsDiffTool/GtfsDiffExampleView';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'GTFS Diff Tool – Example Report | MobilityDatabase',
  description:
    'A pre-rendered example of the GTFS Diff v2 report, showing all change types including added/deleted rows, column changes, and truncated files.',
};

export function generateStaticParams(): Array<{ locale: Locale }> {
  return routing.locales.map((locale) => ({ locale }));
}

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function GtfsDiffToolExamplePage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  return <GtfsDiffExampleView />;
}
