import 'server-only';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  type DiffDataset,
  type DiffManifest,
  MANIFEST_FILE,
  datasetFromManifest,
} from '../app/screens/GtfsDiffToolV2/lib/datasets';
import {
  REPORT_FILE,
  type ReportSummary,
} from '../app/screens/GtfsDiffToolV2/lib/report';
import {
  HIGHLIGHTS_FILE,
  type HighlightsDoc,
} from '../app/screens/GtfsDiffToolV2/lib/global-highlights';
import {
  TRIPS_CALENDAR_FILE,
  type TripsCalendarDoc,
} from '../app/screens/GtfsDiffToolV2/lib/trips-calendar';

/**
 * Local stand-in for the diff store: one folder per diff, holding the files
 * listed in its manifest.json (see lib/datasets.ts). A folder without a
 * manifest is not a finished diff and is ignored, the way the backend will
 * only publish a diff once its job has written every file.
 */
export const DIFF_DATA_DIR = path.join(
  process.cwd(),
  'src/app/screens/GtfsDiffTool/data/v2',
);

const DATASET_ID = /^[a-z0-9][a-z0-9-]*$/i;

/** Manifests, cached by file mtime (the builder rewrites them). */
const manifestCache = new Map<string, { mtime: number; m: DiffManifest }>();

export function getDiffManifest(id: string): DiffManifest | null {
  if (!DATASET_ID.test(id)) return null;
  const p = path.join(DIFF_DATA_DIR, id, MANIFEST_FILE);
  if (!existsSync(p)) return null;
  const mtime = statSync(p).mtimeMs;
  const cached = manifestCache.get(id);
  if (cached?.mtime === mtime) return cached.m;
  const m = JSON.parse(readFileSync(p, 'utf8')) as DiffManifest;
  manifestCache.set(id, { mtime, m });
  return m;
}

/** Every finished diff, sorted by id. Read at build time for static routes. */
export function listDiffDatasets(): DiffDataset[] {
  if (!existsSync(DIFF_DATA_DIR)) return [];
  return readdirSync(DIFF_DATA_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => getDiffManifest(d.name))
    .filter((m): m is DiffManifest => m != null)
    .map(datasetFromManifest)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getDiffDataset(id: string): DiffDataset | null {
  const m = getDiffManifest(id);
  return m ? datasetFromManifest(m) : null;
}

/**
 * Absolute path of one file of a diff, or null unless the manifest lists it
 * (which also rules out paths escaping the folder).
 */
export function diffFilePath(id: string, file: string): string | null {
  const m = getDiffManifest(id);
  if (m == null || (m.files[file] == null && file !== MANIFEST_FILE))
    return null;
  return path.join(DIFF_DATA_DIR, id, file);
}

/** report.json of a diff: feeds and per-section change counts. */
export function getReportSummary(id: string): ReportSummary | null {
  const p = diffFilePath(id, REPORT_FILE);
  return p ? (JSON.parse(readFileSync(p, 'utf8')) as ReportSummary) : null;
}

/** trips-calendar.json: trip changes per date (Trips v3); null if not built. */
export function getTripsCalendar(id: string): TripsCalendarDoc | null {
  const p = diffFilePath(id, TRIPS_CALENDAR_FILE);
  return p ? (JSON.parse(readFileSync(p, 'utf8')) as TripsCalendarDoc) : null;
}

/** highlights.json of a diff: every notable highlight, ranked; null if not built. */
export function getHighlights(id: string): HighlightsDoc | null {
  const p = diffFilePath(id, HIGHLIGHTS_FILE);
  return p ? (JSON.parse(readFileSync(p, 'utf8')) as HighlightsDoc) : null;
}
