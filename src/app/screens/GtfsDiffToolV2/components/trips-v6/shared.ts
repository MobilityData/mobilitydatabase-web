import type { ReportSummary } from '../../lib/report';

/** Section id and slug of the Trips v6 pages in the report header. */
export const TRIPS_V6_SECTION = 'trips_v6';
export const TRIPS_V6_SLUG = 'trips-v6';

/** The report with Trips v6 added, so the header titles it. */
export function withTripsV6(report: ReportSummary): ReportSummary {
  const trips = report.sections.find((s) => s.id === 'trips');
  return {
    ...report,
    sections: [
      ...report.sections,
      {
        id: TRIPS_V6_SECTION,
        slug: TRIPS_V6_SLUG,
        label: trips?.label ?? 'Trips',
        count: trips?.count ?? null,
        counts: trips?.counts ?? null,
        files: trips?.files ?? ['trips.txt', 'stop_times.txt'],
        present: true,
      },
    ],
  };
}

/** Shown when views/trips/day-routes.parquet is missing (older builds). */
export function dayRoutesHint(datasetId: string): string {
  return `node scripts/build-gtfs-diff-dataset.mjs ${datasetId} --only calendar`;
}
