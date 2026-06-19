import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../../i18n/routing';
import { type Metadata } from 'next';
import GtfsDiffFliuView from '../../../screens/GtfsDiffTool/GtfsDiffFliuView';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'GTFS Change Tracker – FlixBus | MobilityDatabase',
  description:
    'Diff report for FlixBus / Distribusion (agency FLIU), showing all change types including added/deleted rows, column changes, and validation notices.',
};

export function generateStaticParams(): Array<{ locale: Locale }> {
  return routing.locales.map((locale) => ({ locale }));
}

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function GtfsDiffToolFliuPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  return <GtfsDiffFliuView />;
}
