/**
 * GTFS Diff Web Worker — outputs a schema-compliant GtfsDiff v2 document.
 *
 * Processing pipeline:
 * 1. Parse both feeds from uploaded File objects (ZIP or loose .txt).
 * 2. Compute a FileDiff for every GTFS file present in either feed.
 * 3. Assemble the GtfsDiff v2 document (metadata + summary + file_diffs).
 * 4. Post the complete document back to the main thread.
 *
 * Memory optimisations:
 * - Columnar storage (ColumnarTable) avoids per-row JS objects.
 * - String interning (StringPool) deduplicates repeated values.
 * - ZIP entries are decompressed and freed one at a time.
 */

import { unzipSync } from 'fflate';
import { ColumnarTable, StringPool } from './columnar-table';
import { parseFileToColumnar, parseUint8ArrayToColumnar } from './csv-stream-parser';
import { computeFileDiffSchema } from './file-diff';
import type {
  FileDiff,
  FileSummary,
  GtfsDiff,
  GtfsDiffMetadata,
  GtfsDiffSummary,
  UnsupportedFile,
} from './gtfs-diff-types';
import type { WorkerInboundMessage, WorkerOutboundMessage } from './worker-types';

// ── Constants ──────────────────────────────────────────────────────

const ROW_CHANGES_CAP = 5000;
const SCHEMA_VERSION = '2.0';

// ── Helpers ────────────────────────────────────────────────────────

function post(msg: WorkerOutboundMessage): void {
  (self as unknown as { postMessage: (msg: WorkerOutboundMessage) => void }).postMessage(msg);
}

function progress(percent: number, label: string): void {
  post({ type: 'progress', percent, label });
}

function isZipFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.zip') || name.endsWith('.gtfs');
}

async function fileToUint8Array(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

// ── Feed processing ────────────────────────────────────────────────

interface ProcessedFeed {
  tables: Map<string, ColumnarTable>;
  source: string;
  downloadedAt: string;
  unsupportedFileNames: string[];
}

async function processFeedFiles(
  files: File[],
  feedLabel: string,
  basePercent: number,
  percentRange: number,
): Promise<ProcessedFeed> {
  const tables = new Map<string, ColumnarTable>();
  const pool = new StringPool();
  const unsupportedFileNames: string[] = [];
  const downloadedAt = new Date().toISOString();
  const source = files.map((f) => f.name).join(', ');

  const zipFiles: File[] = [];
  const txtFiles: File[] = [];
  for (const file of files) {
    if (isZipFile(file)) zipFiles.push(file);
    else txtFiles.push(file);
  }

  let processed = 0;
  const totalItems = zipFiles.length + txtFiles.length;

  for (const zipFile of zipFiles) {
    progress(
      basePercent + (processed / Math.max(totalItems, 1)) * percentRange * 0.3,
      `${feedLabel}: Decompressing ${zipFile.name}…`,
    );

    const raw = await fileToUint8Array(zipFile);
    const entries = unzipSync(raw);
    const entryPaths = Object.keys(entries);

    for (let ei = 0; ei < entryPaths.length; ei++) {
      const fullPath = entryPaths[ei];
      if (fullPath.endsWith('/')) continue;

      const segments = fullPath.split('/');
      const fileName = segments[segments.length - 1].toLowerCase();

      const pct =
        basePercent +
        (processed / Math.max(totalItems, 1)) * percentRange * 0.3 +
        ((ei + 1) / entryPaths.length) * percentRange * 0.5;

      if (!fileName.endsWith('.txt')) {
        unsupportedFileNames.push(fileName);
        delete entries[fullPath];
        continue;
      }

      progress(pct, `${feedLabel}: Parsing ${fileName}…`);
      const table = parseUint8ArrayToColumnar(entries[fullPath], pool);
      tables.set(fileName, table);
      delete entries[fullPath];
    }

    processed++;
  }

  for (const txtFile of txtFiles) {
    const pct =
      basePercent +
      (processed / Math.max(totalItems, 1)) * percentRange * 0.3 +
      percentRange * 0.6;
    progress(pct, `${feedLabel}: Parsing ${txtFile.name}…`);
    const table = await parseFileToColumnar(txtFile, pool);
    tables.set(txtFile.name.toLowerCase(), table);
    processed++;
  }

  pool.clear();
  return { tables, source, downloadedAt, unsupportedFileNames };
}

// ── GtfsDiff document assembly ─────────────────────────────────────

function buildUnsupportedFiles(
  namesA: string[],
  namesB: string[],
): UnsupportedFile[] {
  const setA = new Set(namesA);
  const setB = new Set(namesB);
  const all = new Set([...Array.from(namesA), ...Array.from(namesB)]);
  return Array.from(all).map((name) => ({
    file_name: name,
    present_in: setA.has(name) && setB.has(name) ? 'both' : setA.has(name) ? 'base' : 'new',
  }));
}

function buildFileSummary(diff: FileDiff): FileSummary {
  return {
    file_name: diff.file_name,
    status: diff.file_action,
  };
}

function buildGtfsDiff(
  feedA: ProcessedFeed,
  feedB: ProcessedFeed,
  allFileDiffs: FileDiff[],
): GtfsDiff {
  // Only include files that actually changed
  const changedDiffs = allFileDiffs.filter((d) => {
    if (d.file_action !== 'modified') return true;
    const rc = d.row_changes;
    const hasColumnChanges =
      (d.columns_added?.length ?? 0) > 0 || (d.columns_deleted?.length ?? 0) > 0;
    const hasRowChanges = rc
      ? rc.added.length + rc.deleted.length + rc.modified.length > 0 ||
        (d.truncated?.omitted_count ?? 0) > 0
      : false;
    return hasColumnChanges || hasRowChanges;
  });

  const files = changedDiffs.map(buildFileSummary);

  let totalChanges = 0;
  for (const d of changedDiffs) {
    const s = d.stats;
    totalChanges +=
      (s?.rows_added_count ?? 0) +
      (s?.rows_deleted_count ?? 0) +
      (s?.rows_modified_count ?? 0) +
      (s?.columns_added_count ?? 0) +
      (s?.columns_deleted_count ?? 0);
  }

  const metadata: GtfsDiffMetadata = {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    row_changes_cap_per_file: ROW_CHANGES_CAP,
    base_feed: { source: feedA.source, downloaded_at: feedA.downloadedAt },
    new_feed: { source: feedB.source, downloaded_at: feedB.downloadedAt },
    unsupported_files: buildUnsupportedFiles(
      feedA.unsupportedFileNames,
      feedB.unsupportedFileNames,
    ),
  };

  const summary: GtfsDiffSummary = {
    total_changes: totalChanges,
    files_added_count: files.filter((f) => f.status === 'added').length,
    files_deleted_count: files.filter((f) => f.status === 'deleted').length,
    files_modified_count: files.filter((f) => f.status === 'modified').length,
    files_not_compared_count: files.filter((f) => f.status === 'not_compared').length,
    files,
  };

  return { metadata, summary, file_diffs: changedDiffs };
}

// ── Worker message handler ─────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerInboundMessage>) => {
  const msg = event.data;
  if (msg.type !== 'start') return;

  try {
    // ── Phase 0: Parse both feeds (0% – 40%) ──────────────────────
    progress(0, 'Parsing base feed files…');
    const feedA = await processFeedFiles(msg.feedAFiles, 'Base', 0, 20);

    progress(20, 'Parsing new feed files…');
    const feedB = await processFeedFiles(msg.feedBFiles, 'New', 20, 20);

    // ── Phase 1: Compute file diffs (40% – 90%) ───────────────────
    const allFileNames = Array.from(
      new Set([
        ...Array.from(feedA.tables.keys()),
        ...Array.from(feedB.tables.keys()),
      ]),
    ).sort();

    const fileDiffs: FileDiff[] = [];
    for (let i = 0; i < allFileNames.length; i++) {
      const fileName = allFileNames[i];
      const pct = 40 + ((i + 1) / Math.max(allFileNames.length, 1)) * 50;
      progress(pct, `Diffing ${fileName}…`);

      const tableA = feedA.tables.get(fileName) ?? null;
      const tableB = feedB.tables.get(fileName) ?? null;
      fileDiffs.push(computeFileDiffSchema(tableA, tableB, fileName, ROW_CHANGES_CAP));
    }

    // ── Phase 2: Assemble document (90% – 100%) ───────────────────
    progress(90, 'Assembling diff document…');
    const gtfsDiff = buildGtfsDiff(feedA, feedB, fileDiffs);

    progress(100, 'Complete');
    post({ type: 'done', gtfsDiff });
  } catch (e) {
    post({
      type: 'error',
      message: e instanceof Error ? e.message : String(e),
    });
  }
};
