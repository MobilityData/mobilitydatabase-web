import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { type Metadata } from 'next';
import { type Locale, routing } from '../../../../../i18n/routing';
import PathwaysDatasetScreen from '../../../../screens/GtfsDiffToolV2/components/pathways/PathwaysDatasetScreen';
import {
  getDiffDataset,
  getReportSummary,
  listDiffDatasets,
} from '../../../../../lib/gtfs-diff-datasets';

export const dynamic = 'force-static';
// Folders added after the build (or after `next dev` started) are served on
// demand; unknown or invalid params still 404 below.
export const dynamicParams = true;

/** Every dataset folder that has a pathways-diff.json. */
export function generateStaticParams(): Array<{
  locale: Locale;
  dataset: string;
}> {
  const datasets = listDiffDatasets().filter((d) => d.files.pathways);
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
    title: `Pathways and levels · ${d?.label ?? dataset} | MobilityDatabase`,
    description:
      'Station-level GTFS diff of pathways.txt and levels.txt: step-free access, entrance-to-platform routes and a level-by-level schematic.',
  };
}

export default async function PathwaysDiffPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale, dataset: id } = await params;
  setRequestLocale(locale);
  const dataset = getDiffDataset(id);
  const report = getReportSummary(id);
  if (dataset == null || report == null || !dataset.files.pathways) notFound();
  return <PathwaysDatasetScreen dataset={dataset} report={report} />;
}
