import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { type Metadata } from 'next';
import { type Locale, routing } from '../../../../../i18n/routing';
import TripsV2Screen from '../../../../screens/GtfsDiffToolV2/components/trips-v2/TripsV2Screen';
import {
  getDiffDataset,
  getReportSummary,
  listDiffDatasets,
} from '../../../../../lib/gtfs-diff-datasets';

export const dynamic = 'force-static';
// Folders added after the build (or after `next dev` started) are served on
// demand; unknown or invalid params still 404 below.
export const dynamicParams = true;

/** Every dataset folder with both a trips-diff.json and an entity-diff.json. */
export function generateStaticParams(): Array<{
  locale: Locale;
  dataset: string;
}> {
  const datasets = listDiffDatasets().filter(
    (d) => d.files.trips && d.files.entity,
  );
  return routing.locales.flatMap((locale) =>
    datasets.map((d) => ({ locale, dataset: d.id })),
  );
}

interface PageProps {
  params: Promise<{ locale: string; dataset: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { dataset } = await params;
  const d = getDiffDataset(dataset);
  return {
    title: `Trips · ${d?.label ?? dataset} | GTFS diff | MobilityDatabase`,
    description:
      'Day-by-day GTFS trips diff: which routes changed, when their trips run, how stop patterns and running times moved, and the trip_id mapping behind it.',
  };
}

/** /gtfs-diff-tool-v2/<dataset>/trips-v2 (takes precedence over [entity]). */
export default async function TripsV2Page({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale, dataset: id } = await params;
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
  return <TripsV2Screen dataset={dataset} report={report} />;
}
