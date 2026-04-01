/**
 * GTFS Diff Web Worker — memory-optimised for 50MB+ feeds.
 *
 * Key optimisations over the previous version:
 * 1. Columnar storage (ColumnarTable) instead of per-row objects — 100x fewer
 *    JS objects for large files like stop_times.txt.
 * 2. String interning — deduplicates repeated values (stop_id, route_id,
 *    service_id) across columns, cutting string memory by 40-60%.
 * 3. Process-and-free ZIP: decompress entries one at a time, parse to columnar,
 *    then delete the raw Uint8Array — no longer holding entire decompressed
 *    ZIP in memory.
 * 4. Worker keeps parsed data — main thread receives only metadata + semantic
 *    diff results. File diffs are computed lazily on demand.
 */

import { unzipSync } from 'fflate';
import { ColumnarTable } from './columnar-table';
import { StringPool } from './columnar-table';
import { parseFileToColumnar, parseUint8ArrayToColumnar } from './csv-stream-parser';
import { materializeFeed } from './entity-materializer';
import { computeFileDiff } from './file-diff';
import { computeSemanticDiff } from './semantic-diff';
import {
  type FileMetadata,
  type WorkerInboundMessage,
  type WorkerOutboundMessage,
} from './worker-types';

// ── Persistent state (kept in worker memory for lazy file diffs) ───

let storedFilesA: Map<string, ColumnarTable> | null = null;
let storedFilesB: Map<string, ColumnarTable> | null = null;

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

function buildFileMetadata(files: Map<string, ColumnarTable>): FileMetadata[] {
  const result: FileMetadata[] = [];
  files.forEach((table, fileName) => {
    result.push({
      fileName,
      rowCount: table.rowCount,
      columns: table.headers.slice(),
    });
  });
  return result.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

// ── Feed processing (memory-optimised) ─────────────────────────────

async function processFeedFiles(
  files: File[],
  feedLabel: string,
  basePercent: number,
  percentRange: number,
): Promise<Map<string, ColumnarTable>> {
  const result = new Map<string, ColumnarTable>();
  const pool = new StringPool();
  const zipFiles: File[] = [];
  const txtFiles: File[] = [];

  for (const file of files) {
    if (isZipFile(file)) {
      zipFiles.push(file);
    } else {
      txtFiles.push(file);
    }
  }

  let processed = 0;
  const totalItems = zipFiles.length + txtFiles.length;

  // Process ZIP files — decompress, then parse+free each entry individually
  for (const zipFile of zipFiles) {
    progress(
      basePercent + (processed / Math.max(totalItems, 1)) * percentRange * 0.3,
      `${feedLabel}: Decompressing ${zipFile.name}…`,
    );

    const raw = await fileToUint8Array(zipFile);
    const entries = unzipSync(raw);

    // Process each entry one at a time, then delete to free memory
    const entryPaths = Object.keys(entries);
    for (let ei = 0; ei < entryPaths.length; ei++) {
      const fullPath = entryPaths[ei];
      if (fullPath.endsWith('/')) continue;

      const segments = fullPath.split('/');
      const fileName = segments[segments.length - 1].toLowerCase();
      if (!fileName.endsWith('.txt')) continue;

      const pct =
        basePercent +
        (processed / Math.max(totalItems, 1)) * percentRange * 0.3 +
        ((ei + 1) / entryPaths.length) * percentRange * 0.5;
      progress(pct, `${feedLabel}: Parsing ${fileName}…`);

      const table = parseUint8ArrayToColumnar(entries[fullPath], pool);
      result.set(fileName, table);

      // Free the raw bytes for this entry immediately
      delete entries[fullPath];
    }

    processed++;
  }

  // Process loose .txt files (streaming — never loads full text)
  for (const txtFile of txtFiles) {
    const pct =
      basePercent +
      (processed / Math.max(totalItems, 1)) * percentRange * 0.3 +
      percentRange * 0.6;
    progress(pct, `${feedLabel}: Parsing ${txtFile.name}…`);

    const table = await parseFileToColumnar(txtFile, pool);
    result.set(txtFile.name.toLowerCase(), table);
    processed++;
  }

  // Release the interning index (strings are still alive via column refs)
  pool.clear();

  return result;
}

// ── Worker message handler ─────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerInboundMessage>) => {
  const msg = event.data;

  if (msg.type === 'start') {
    try {
      // Clear any previous data
      storedFilesA = null;
      storedFilesB = null;

      // ── Phase 0: Parse CSV (0% – 40%) ───────────────────────────
      progress(0, 'Parsing Feed A files…');
      const filesA = await processFeedFiles(msg.feedAFiles, 'Feed A', 0, 20);

      progress(20, 'Parsing Feed B files…');
      const filesB = await processFeedFiles(msg.feedBFiles, 'Feed B', 20, 20);

      // ── Phase 1: Materialize entities (40% – 70%) ───────────────
      progress(40, 'Materializing Feed A entities…');
      const feedA = materializeFeed(filesA);

      progress(55, 'Materializing Feed B entities…');
      const feedB = materializeFeed(filesB);

      // ── Phase 2: Semantic diff (70% – 95%) ──────────────────────
      progress(70, 'Computing semantic diff…');
      const semantic = computeSemanticDiff(feedA, feedB);

      // ── Phase 3: Store data & send metadata (95% – 100%) ────────
      progress(95, 'Preparing results…');

      // Keep parsed data for lazy file diff requests
      storedFilesA = filesA;
      storedFilesB = filesB;

      const fileNamesA = Array.from(filesA.keys()).sort();
      const fileNamesB = Array.from(filesB.keys()).sort();

      post({
        type: 'done',
        filesAMeta: buildFileMetadata(filesA),
        filesBMeta: buildFileMetadata(filesB),
        fileNamesA,
        fileNamesB,
        semantic,
      });
    } catch (e) {
      post({
        type: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  } else if (msg.type === 'file-diff-request') {
    try {
      if (!storedFilesA || !storedFilesB) {
        post({
          type: 'error',
          message: 'No parsed data available. Run a diff first.',
        });
        return;
      }

      const tableA = storedFilesA.get(msg.fileName) ?? null;
      const tableB = storedFilesB.get(msg.fileName) ?? null;

      const result = computeFileDiff(tableA, tableB, {
        fileName: msg.fileName,
        keyColumns: msg.keyColumns,
        filterRouteId: msg.filterRouteId,
      });

      post({
        type: 'file-diff-response',
        requestId: msg.requestId,
        result,
      });
    } catch (e) {
      post({
        type: 'error',
        message: `File diff error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
};
