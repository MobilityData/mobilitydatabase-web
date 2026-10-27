import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { type Metadata } from 'next';
import { type Locale, routing } from '../../../../../i18n/routing';
import HighlightsScreen from '../../../../screens/GtfsDiffToolV2/components/highlights/HighlightsScreen';
import { HIGHLIGHTS_FILE } from '../../../../screens/GtfsDiffToolV2/lib/global-highlights';
import {
  getDiffDataset,
  getDiffManifest,
  getHighlights,
  getReportSummary,
  listDiffDatasets,
} from '../../../../../lib/gtfs-diff-datasets';

export const dynamic = 'force-static';
// Folders added after the build (or after `next dev` started) are served on
// demand; unknown or invalid params still 404 below.
export const dynamicParams = true;

/** Every dataset folder whose diff has a highlights.json. */
export function generateStaticParams(): Array<{
  locale: Locale;
  dataset: string;
}> {
  const datasets = listDiffDatasets().filter(
    (d) => getDiffManifest(d.id)?.files[HIGHLIGHTS_FILE] != null,
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
    title: `Notable highlights · ${d?.label ?? dataset} | GTFS diff | MobilityDatabase`,
    description:
      'Every notable change between two GTFS feeds, ranked across trips, routes, stops and service dates.',
  };
}

/** /gtfs-diff-tool-v2/<dataset>/highlights (takes precedence over [entity]). */
export default async function HighlightsPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale, dataset: id } = await params;
  setRequestLocale(locale);
  const dataset = getDiffDataset(id);
  const report = getReportSummary(id);
  const doc = getHighlights(id);
  if (dataset == null || report == null || doc == null) notFound();
  return <HighlightsScreen dataset={dataset} report={report} doc={doc} />;
}
