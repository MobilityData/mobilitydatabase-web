import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../../i18n/routing';
import { type Metadata } from 'next';
import GtfsDiffMbtaView from '../../../screens/GtfsDiffTool/GtfsDiffMbtaView';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'GTFS Change Tracker – MBTA | MobilityDatabase',
  description:
    'Diff report for MBTA, comparing the July 15 and July 21 2026 static feeds with validation notices and entity-level changes.',
};

export function generateStaticParams(): Array<{ locale: Locale }> {
  return routing.locales.map((locale) => ({ locale }));
}

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function GtfsDiffToolMbtaPage({ params }: PageProps): Promise<ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  return <GtfsDiffMbtaView />;
}
