import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { type Metadata } from 'next';
import { type Locale, routing } from '../../../../i18n/routing';
import { MissingDiff } from '../../../screens/GtfsDiffToolV2';
import ReportSummaryView from '../../../screens/GtfsDiffToolV2/components/report/ReportSummaryView';
import {
  getDiffDataset,
  getReportSummary,
  listDiffDatasets,
} from '../../../../lib/gtfs-diff-datasets';

export const dynamic = 'force-static';
// Folders added after the build (or after `next dev` started) are served on
// demand; unknown or invalid params still 404 below.
export const dynamicParams = true;

/** One report per folder in src/app/screens/GtfsDiffTool/data/v2. */
export function generateStaticParams(): Array<{
  locale: Locale;
  dataset: string;
}> {
  const datasets = listDiffDatasets();
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
  return {
    title: `${getDiffDataset(dataset)?.label ?? dataset} | GTFS diff summary | MobilityDatabase`,
    description:
      'Summary of the changes between two GTFS feeds: services, routes, trips, stops and pathways.',
  };
}

/** /gtfs-diff-tool-v2/<dataset>: the report's summary, linking to each entity. */
export default async function GtfsDiffDatasetPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale, dataset: id } = await params;
  setRequestLocale(locale);
  const dataset = getDiffDataset(id);
  const report = getReportSummary(id);
  if (dataset == null || report == null) notFound();
  if (!report.sections.some((s) => s.present)) {
    return <MissingDiff dataset={dataset} />;
  }
  return <ReportSummaryView dataset={dataset} report={report} />;
}
