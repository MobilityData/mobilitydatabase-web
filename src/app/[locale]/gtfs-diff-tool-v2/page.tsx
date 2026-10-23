import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../i18n/routing';
import { type Metadata } from 'next';
import DatasetIndex from '../../screens/GtfsDiffToolV2/components/DatasetIndex';
import { listDiffDatasets } from '../../../lib/gtfs-diff-datasets';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'GTFS Change Tracker v2 | MobilityDatabase',
  description:
    'Entity-level GTFS diff: compare services, routes, trips and stops between two GTFS feeds, with a calendar view of service changes.',
};

export function generateStaticParams(): Array<{ locale: Locale }> {
  return routing.locales.map((locale) => ({ locale }));
}

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function GtfsDiffToolV2Page({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  return <DatasetIndex datasets={listDiffDatasets()} />;
}
