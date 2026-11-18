import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { type Metadata } from 'next';
import ServiceDetailScreen from '../../../../../screens/GtfsDiffToolV2/components/calendar/ServiceDetailScreen';
import { sectionHighlights } from '../../../../../screens/GtfsDiffToolV2/lib/global-highlights';
import { sectionSlug } from '../../../../../screens/GtfsDiffToolV2/lib/report';
import { SERVICES_PAGE } from '../../../../../screens/GtfsDiffToolV2/lib/sections';
import {
  getDiffDataset,
  getHighlights,
  getReportSummary,
} from '../../../../../../lib/gtfs-diff-datasets';

export const dynamic = 'force-static';
// One page per service of every dataset would be thousands (IDFM alone has
// over ten thousand): they are rendered on first request instead.
export const dynamicParams = true;

export function generateStaticParams(): Array<Record<string, string>> {
  return [];
}

interface PageProps {
  params: Promise<{
    locale: string;
    dataset: string;
    entity: string;
    id: string;
  }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { dataset, id } = await params;
  const d = getDiffDataset(dataset);
  return {
    title: `Service ${decodeURIComponent(id)} · Service Dates · ${d?.label ?? dataset} | GTFS diff | MobilityDatabase`,
    description:
      'How one service changed between two GTFS feeds: the dates it runs, its weekly pattern and exceptions, and the routes using it.',
  };
}

/** /gtfs-diff-tool-v2/<dataset>/calendar/<service_id>; other entities have no item pages yet. */
export default async function GtfsDiffItemPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale, dataset: datasetId, entity, id } = await params;
  setRequestLocale(locale);
  if (entity !== sectionSlug(SERVICES_PAGE)) notFound();
  const dataset = getDiffDataset(datasetId);
  const report = getReportSummary(datasetId);
  if (dataset == null || report == null || !dataset.files.entity) notFound();
  const highlights = getHighlights(datasetId);
  return (
    <ServiceDetailScreen
      dataset={dataset}
      report={report}
      serviceId={decodeURIComponent(id)}
      highlights={highlights ? sectionHighlights(highlights, 'services') : null}
    />
  );
}
