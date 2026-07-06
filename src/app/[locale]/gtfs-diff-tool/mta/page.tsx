import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../../i18n/routing';
import { type Metadata } from 'next';
import GtfsDiffMtaView from '../../../screens/GtfsDiffTool/GtfsDiffMtaView';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'GTFS Change Tracker – MTA NYC Transit | MobilityDatabase',
  description:
    'Diff report for MTA New York City Transit, comparing the regular subway feed against the supplemented feed, showing all change types including added/deleted rows, column changes, and validation notices.',
};

export function generateStaticParams(): Array<{ locale: Locale }> {
  return routing.locales.map((locale) => ({ locale }));
}

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function GtfsDiffToolMtaPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  return <GtfsDiffMtaView />;
}
