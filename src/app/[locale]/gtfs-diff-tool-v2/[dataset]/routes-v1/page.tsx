import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { type Metadata } from 'next';
import { type Locale, routing } from '../../../../../i18n/routing';
import GtfsDiffToolV2 from '../../../../screens/GtfsDiffToolV2';
import type { ReportSummary } from '../../../../screens/GtfsDiffToolV2/lib/report';
import {
  getDiffDataset,
  getReportSummary,
  listDiffDatasets,
} from '../../../../../lib/gtfs-diff-datasets';

export const dynamic = 'force-static';
// Folders added after the build (or after `next dev` started) are served on
// demand; unknown or invalid params still 404 below.
export const dynamicParams = true;

function hasRoutes(report: ReportSummary | null): boolean {
  return report?.sections.some((s) => s.id === 'routes' && s.present) ?? false;
}

/** Every dataset folder with an entity-diff.json and a routes section. */
export function generateStaticParams(): Array<{
  locale: Locale;
  dataset: string;
}> {
  const datasets = listDiffDatasets().filter(
    (d) => d.files.entity && hasRoutes(getReportSummary(d.id)),
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
    title: `Routes (original) · ${d?.label ?? dataset} | GTFS diff | MobilityDatabase`,
    description:
      'Routes added, removed and changed between two GTFS feeds, on a map: paths, stops, trips and services.',
  };
}

/**
 * /gtfs-diff-tool-v2/<dataset>/routes-v1 (takes precedence over [entity]):
 * the original routes page, now that /routes is the map workspace.
 */
export default async function RoutesV1Page({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale, dataset: id } = await params;
  setRequestLocale(locale);
  const dataset = getDiffDataset(id);
  const report = getReportSummary(id);
  if (
    dataset == null ||
    report == null ||
    !dataset.files.entity ||
    !hasRoutes(report)
  )
    notFound();
  return <GtfsDiffToolV2 dataset={dataset} report={report} section='routes' />;
}
