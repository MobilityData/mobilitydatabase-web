import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { type Metadata } from 'next';
import { type Locale, routing } from '../../../../../i18n/routing';
import TripsV3Screen from '../../../../screens/GtfsDiffToolV2/components/trips-v3/TripsV3Screen';
import { sectionHighlights } from '../../../../screens/GtfsDiffToolV2/lib/global-highlights';
import {
  getDiffDataset,
  getHighlights,
  getReportSummary,
  getTripsCalendar,
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
      'Trips added, removed and modified between two GTFS feeds, by weekday and by date.',
  };
}

/** /gtfs-diff-tool-v2/<dataset>/trips-v3 (takes precedence over [entity]). */
export default async function TripsV3Page({
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
  const highlights = getHighlights(id);
  return (
    <TripsV3Screen
      dataset={dataset}
      report={report}
      calendar={getTripsCalendar(id)}
      highlights={highlights ? sectionHighlights(highlights, 'trips') : null}
    />
  );
}
