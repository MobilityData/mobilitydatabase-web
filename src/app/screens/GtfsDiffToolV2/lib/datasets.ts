/**
 * Diff datasets: one generated diff per feed pair, laid out the way the
 * future backend will store it in object storage (lib/diff-layout, the
 * single source of every path):
 *
 *   <base URL>/<id>/manifest.json        what the diff holds (always first)
 *   <base URL>/<id>/report.json          feeds, one entry per GTFS file, the
 *                                        analyses (file and counts), top highlights
 *   <base URL>/<id>/raw/<file>.parquet   row diffs
 *   <base URL>/<id>/analysis/            the stops, routes, services and
 *                                        pathways analyses
 *   <base URL>/<id>/highlights/          every section's highlights
 *   <base URL>/<id>/views/               copies shaped for one viewer (Trips)
 *
 * Every file is read through diffFileUrl(), so moving the files from this
 * app's API (local folders under src/app/screens/GtfsDiffTool/data/v2/) to a
 * bucket or CDN is a matter of NEXT_PUBLIC_GTFS_DIFF_BASE_URL. Parquet files
 * are read with HTTP range requests, which both the local API and object
 * storage support.
 */

import { getEnvConfig } from '../../../utils/config';
import {
  ANALYSIS_FILES,
  REPORT_FILE,
  ROUTES_TABLE,
  SERVICES_TABLE,
  SERVICE_DATES_TABLE,
  SHAPES_TABLE,
  STOPS_TABLE,
  TRIPS_DAY_ROUTES_FILE,
  TRIPS_INDEX_FILE,
} from './diff-layout';
import type { ReportFeed } from './report';

/** Well-known JSON files of a diff, by kind. */
export const DIFF_FILES = {
  entity: REPORT_FILE,
  trips: TRIPS_INDEX_FILE,
  pathways: ANALYSIS_FILES.pathways,
} as const;

export type DiffFileKind = keyof typeof DIFF_FILES;

/**
 * Analysis tables a page ends up reading most of (overview, map, detail):
 * downloaded whole whatever their size (lib/duckdb-client parquetView), as
 * range reads would cost more requests and bytes than one GET. The raw and
 * trips tables are read a page or a day at a time, by ranges once large.
 */
export const WHOLE_DOWNLOAD_FILES: readonly string[] = [
  ROUTES_TABLE,
  SHAPES_TABLE,
  STOPS_TABLE,
  SERVICE_DATES_TABLE,
  SERVICES_TABLE,
  // Trips v6 sums every row (lib/trips-day-routes).
  TRIPS_DAY_ROUTES_FILE,
];

/** Whether a diff file URL is one of WHOLE_DOWNLOAD_FILES. */
export function isWholeDownloadFile(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return WHOLE_DOWNLOAD_FILES.some((f) => path.endsWith(`/${f}`));
}

/** Builds every diff file of a dataset folder from its two GTFS zips. */
export const DATASET_BUILDER = 'scripts/build-gtfs-diff-dataset.mjs';

/** Written last by the builder; a diff without one isn't ready. */
export interface DiffManifest {
  schema: 1;
  id: string;
  /** "direxis · mdb-2775" */
  label: string;
  generated_at: string;
  feeds: { base: ReportFeed | null; new: ReportFeed | null };
  /** Every file of the diff, by path relative to the diff's base URL. */
  files: Record<string, { bytes: number }>;
}

export interface DiffDataset {
  /** Diff id, also the route segment. */
  id: string;
  /** "direxis · mdb-2775" */
  label: string;
  files: Record<DiffFileKind, boolean>;
  /** Input feed zips, by name. */
  feeds: string[];
}

export function datasetFromManifest(m: DiffManifest): DiffDataset {
  const has = (path: string): boolean => m.files[path] != null;
  return {
    id: m.id,
    label: m.label,
    files: {
      entity: has(DIFF_FILES.entity),
      trips: has(DIFF_FILES.trips),
      pathways: has(DIFF_FILES.pathways),
    },
    feeds: [m.feeds.base?.file, m.feeds.new?.file].filter(
      (f): f is string => f != null,
    ),
  };
}

/** Where diffs are served from: this app's API unless configured. */
export function diffBaseUrl(): string {
  const configured = getEnvConfig('NEXT_PUBLIC_GTFS_DIFF_BASE_URL');
  return (configured || '/api/gtfs-diff-v2').replace(/\/+$/, '');
}

/** URL of one file of a diff, e.g. diffFileUrl('mbta', 'raw/trips.parquet'). */
export function diffFileUrl(datasetId: string, path: string): string {
  const parts = path.split('/').map(encodeURIComponent).join('/');
  return `${diffBaseUrl()}/${encodeURIComponent(datasetId)}/${parts}`;
}

export function diffDataUrl(datasetId: string, kind: DiffFileKind): string {
  return diffFileUrl(datasetId, DIFF_FILES[kind]);
}

/** "direxis" + ["base-mdb-2775-….zip"] -> "direxis · mdb-2775" */
export function datasetLabel(id: string, feeds: string[]): string {
  const mdb = feeds
    .map((f) => /mdb-\d+/.exec(f)?.[0])
    .find((m): m is string => m != null);
  return mdb ? `${id} · ${mdb}` : id;
}
