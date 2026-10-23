import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { type Metadata } from 'next';
import TripsV2Screen from '../../../../../screens/GtfsDiffToolV2/components/trips-v2/TripsV2Screen';
import {
  getDiffDataset,
  getReportSummary,
} from '../../../../../../lib/gtfs-diff-datasets';

export const dynamic = 'force-static';
// One page per route of every dataset would be thousands (MBTA alone has
// hundreds of routes): they are rendered on first request instead.
export const dynamicParams = true;

export function generateStaticParams(): Array<Record<string, string>> {
  return [];
}

interface PageProps {
  params: Promise<{ locale: string; dataset: string; route: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { dataset, route } = await params;
  const d = getDiffDataset(dataset);
  return {
    title: `Route ${decodeURIComponent(route)} · Trips · ${d?.label ?? dataset} | GTFS diff | MobilityDatabase`,
    description:
      'How one route’s trips changed between two GTFS feeds, day by day: service profile, stop patterns, timetable and the trip_id mapping behind it.',
  };
}

/** /gtfs-diff-tool-v2/<dataset>/trips-v2/<route_id> */
export default async function TripsV2RoutePage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale, dataset: id, route } = await params;
  setRequestLocale(locale);
  const dataset = getDiffDataset(id);
  const report = getReportSummary(id);
  if (
    dataset == null ||
    report == null ||
    !dataset.files.trips ||
    !dataset.files.entity
  )
    notFound();
  return (
    <TripsV2Screen
      dataset={dataset}
      report={report}
      routeId={decodeURIComponent(route)}
    />
  );
}
