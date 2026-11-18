import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { type Metadata } from 'next';
import TripsV6RouteScreen from '../../../../../screens/GtfsDiffToolV2/components/trips-v6/TripsV6RouteScreen';
import { sectionHighlights } from '../../../../../screens/GtfsDiffToolV2/lib/global-highlights';
import {
  getDiffDataset,
  getHighlights,
  getReportSummary,
  getTripsCalendar,
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
      'How one route’s trips changed between two GTFS feeds over every compared date: a calendar of its trips added, removed and modified.',
  };
}

/** /gtfs-diff-tool-v2/<dataset>/trips-v6/<route_id>: the route's calendar. */
export default async function TripsV6RoutePage({
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
  const highlights = getHighlights(id);
  return (
    <TripsV6RouteScreen
      dataset={dataset}
      report={report}
      routeId={decodeURIComponent(route)}
      calendar={getTripsCalendar(id)}
      highlights={highlights ? sectionHighlights(highlights, 'trips') : null}
    />
  );
}
