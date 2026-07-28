import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../../i18n/routing';
import { type Metadata } from 'next';
import GtfsDiffSingaporeView from '../../../screens/GtfsDiffTool/GtfsDiffSingaporeView';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'GTFS Change Tracker – Singapore | MobilityDatabase',
  description:
    'Diff report for Singapore (MapKing), comparing the June 30 and July 24 2026 static feeds with validation notices and entity-level changes.',
};

export function generateStaticParams(): Array<{ locale: Locale }> {
  return routing.locales.map((locale) => ({ locale }));
}

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function GtfsDiffToolSingaporePage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  return <GtfsDiffSingaporeView />;
}
