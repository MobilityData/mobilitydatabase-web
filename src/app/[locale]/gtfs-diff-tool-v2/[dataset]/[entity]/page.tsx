import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { type Metadata } from 'next';
import { type Locale, routing } from '../../../../../i18n/routing';
import { redirect } from '../../../../../i18n/navigation';
import GtfsDiffToolV2 from '../../../../screens/GtfsDiffToolV2';
import RoutesV2Screen from '../../../../screens/GtfsDiffToolV2/components/routes-v2/RoutesV2Screen';
import {
  PATHWAYS_SECTION,
  type ReportSection,
  type ReportSummary,
} from '../../../../screens/GtfsDiffToolV2/lib/report';
import {
  getDiffDataset,
  getReportSummary,
  listDiffDatasets,
} from '../../../../../lib/gtfs-diff-datasets';

export const dynamic = 'force-static';
// Datasets added after the build are served on demand; unknown ones 404.
export const dynamicParams = true;

/** Sections that were merged into another one: old links land on the new page. */
const MERGED_SECTIONS: Record<string, string> = {
  // Shapes are analysed per route since the routes page shows them.
  shapes: 'routes',
};

/** Entity sections with a page here (pathways has its own route). */
function entitySections(report: ReportSummary): ReportSection[] {
  return report.sections.filter((s) => s.present && s.id !== PATHWAYS_SECTION);
}

/** One page per entity of every dataset: calendar, stops, routes, trips, … */
export function generateStaticParams(): Array<{
  locale: Locale;
  dataset: string;
  entity: string;
}> {
  return listDiffDatasets().flatMap((d) => {
    const report = getReportSummary(d.id);
    if (report == null || !d.files.entity) return [];
    return routing.locales.flatMap((locale) =>
      entitySections(report).map((s) => ({
        locale,
        dataset: d.id,
        entity: s.slug,
      })),
    );
  });
}

interface PageProps {
  params: Promise<{ locale: string; dataset: string; entity: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { dataset: id, entity } = await params;
  const dataset = getDiffDataset(id);
  const report = getReportSummary(id);
  const section = report?.sections.find((s) => s.slug === entity);
  return {
    title: `${section?.label ?? entity} · ${dataset?.label ?? id} | GTFS diff | MobilityDatabase`,
    description:
      'Entity-level GTFS diff: compare services, routes, trips and stops between two GTFS feeds.',
  };
}

export default async function GtfsDiffEntityPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale, dataset: id, entity } = await params;
  setRequestLocale(locale);
  const dataset = getDiffDataset(id);
  const report = getReportSummary(id);
  if (dataset == null || report == null || !dataset.files.entity) notFound();
  const section = entitySections(report).find((s) => s.slug === entity);
  if (section == null) {
    const merged = MERGED_SECTIONS[entity];
    if (merged && entitySections(report).some((s) => s.slug === merged)) {
      redirect({ href: `/gtfs-diff-tool-v2/${id}/${merged}`, locale });
    }
    notFound();
  }
  // Routes is the map workspace; the original page is at routes-v1.
  if (section.id === 'routes')
    return <RoutesV2Screen dataset={dataset} report={report} />;
  return (
    <GtfsDiffToolV2 dataset={dataset} report={report} section={section.id} />
  );
}
