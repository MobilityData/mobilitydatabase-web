/**
 * Diff datasets: one generated diff per feed pair, laid out the way the
 * future backend will store it in object storage:
 *
 *   <base URL>/<id>/manifest.json        what the diff holds (always first)
 *   <base URL>/<id>/report.json          header and summary counts
 *   <base URL>/<id>/entity-diff.json     per-entity summaries and maps
 *   <base URL>/<id>/trips-diff.json      day index for the Trips view
 *   <base URL>/<id>/trips/<side>.parquet each feed's trips, by service
 *   <base URL>/<id>/raw/<file>.parquet   full row diffs
 *   <base URL>/<id>/entities/<file>.parquet  long entity change lists
 *
 * Every file is read through diffFileUrl(), so moving the files from this
 * app's API (local folders under src/app/screens/GtfsDiffTool/data/v2/) to a
 * bucket or CDN is a matter of NEXT_PUBLIC_GTFS_DIFF_BASE_URL. Parquet files
 * are read with HTTP range requests, which both the local API and object
 * storage support.
 */

import { getEnvConfig } from '../../../utils/config';
import type { ReportFeed } from './report';

export const MANIFEST_FILE = 'manifest.json';

/** Well-known JSON files of a diff, by kind. */
export const DIFF_FILES = {
  entity: 'entity-diff.json',
  trips: 'trips-diff.json',
  pathways: 'pathways-diff.json',
} as const;

export type DiffFileKind = keyof typeof DIFF_FILES;

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
