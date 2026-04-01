/**
 * Per-file raw diff engine — columnar optimised.
 *
 * Key-based row matching for any uploaded GTFS text file.
 * Operates on ColumnarTable data to avoid creating millions of row objects.
 * Only creates GtfsRawRow objects for rows that actually appear in the
 * diff output (capped).
 */

import { type ColumnarTable } from './columnar-table';
import {
  type BatchPattern,
  type ColumnIntensity,
  type FileDiffResult,
  type GtfsRawRow,
  GTFS_DEFAULT_KEYS,
  type RowDiff,
} from './gtfs-types';

// ── Helpers ────────────────────────────────────────────────────────

function buildCompositeKeyFromTable(
  table: ColumnarTable,
  keyColumns: string[],
  rowIndex: number,
): string {
  let key = table.getValue(keyColumns[0], rowIndex);
  for (let c = 1; c < keyColumns.length; c++) {
    key += '|' + table.getValue(keyColumns[c], rowIndex);
  }
  return key;
}

function findDuplicateKeysColumnar(
  table: ColumnarTable,
  keyColumns: string[],
): string[] {
  const seen = new Map<string, number>();
  for (let i = 0; i < table.rowCount; i++) {
    const key = buildCompositeKeyFromTable(table, keyColumns, i);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dupes: string[] = [];
  seen.forEach((count, key) => {
    if (count > 1) dupes.push(key);
  });
  return dupes;
}

/** Max rows to include in the diff output — prevents multi-GB transfers. */
const MAX_DIFF_ROWS = 5000;

// ── Batch pattern detection ────────────────────────────────────────

function detectBatchPatterns(
  changedColumnTracking: Map<string, number>,
  totalModified: number,
  valueTransformTracking: Map<string, number>,
): BatchPattern[] {
  if (totalModified === 0) return [];
  const patterns: BatchPattern[] = [];

  changedColumnTracking.forEach((count, patternKey) => {
    const pct = (count / totalModified) * 100;
    if (pct >= 80) {
      const columns = patternKey.split(',');
      // Find most common transformation
      let topDesc = '';
      let topCount = 0;
      valueTransformTracking.forEach((c, desc) => {
        if (desc.startsWith(patternKey + ':') && c > topCount) {
          topDesc = desc.substring(patternKey.length + 1);
          topCount = c;
        }
      });
      patterns.push({
        columns,
        description:
          topCount === count
            ? `${topDesc} across ${count.toLocaleString()} rows`
            : `${columns.join(', ')} changed in ${count.toLocaleString()} rows (${Math.round(pct)}%)`,
        affectedRowCount: count,
        percentage: Math.round(pct * 10) / 10,
      });
    }
  });

  return patterns;
}

// ── Column intensity computation ───────────────────────────────────

function computeColumnIntensity(
  columnCounts: Map<string, number>,
  totalModified: number,
  allColumns: string[],
): ColumnIntensity[] {
  if (totalModified === 0) return [];

  return allColumns
    .map((column) => ({
      column,
      changedCount: columnCounts.get(column) ?? 0,
      totalModified,
      percentage:
        Math.round(((columnCounts.get(column) ?? 0) / totalModified) * 1000) / 10,
    }))
    .filter((ci) => ci.changedCount > 0)
    .sort((a, b) => b.percentage - a.percentage);
}

// ── Row reconstruction helper ──────────────────────────────────────

function rowFromTable(
  table: ColumnarTable,
  index: number,
): GtfsRawRow {
  return table.getRow(index);
}

// ── Main file diff (columnar) ──────────────────────────────────────

export interface FileDiffOptions {
  fileName: string;
  keyColumns?: string[];
  /** Filter to rows matching a specific route_id */
  filterRouteId?: string;
}

/**
 * Compute a row-level diff for a single GTFS file between two feeds.
 * Operates on ColumnarTable data — never creates row objects for
 * unchanged rows or for rows beyond the output cap.
 */
export function computeFileDiff(
  tableA: ColumnarTable | null,
  tableB: ColumnarTable | null,
  options: FileDiffOptions,
): FileDiffResult {
  const keyColumns =
    options.keyColumns ??
    GTFS_DEFAULT_KEYS[options.fileName] ?? ['id'];

  // Collect ALL column names from both tables
  const allColumnsSet = new Set<string>();
  if (tableA) {
    for (const h of tableA.headers) allColumnsSet.add(h);
  }
  if (tableB) {
    for (const h of tableB.headers) allColumnsSet.add(h);
  }
  const allColumns = Array.from(allColumnsSet).sort();

  // Build keyed index: key → row index (first match wins for dupes)
  const indexA = new Map<string, number>();
  const filterCol = options.filterRouteId ? 'route_id' : null;

  if (tableA) {
    for (let i = 0; i < tableA.rowCount; i++) {
      if (filterCol && tableA.getValue(filterCol, i) !== options.filterRouteId) continue;
      const key = buildCompositeKeyFromTable(tableA, keyColumns, i);
      if (!indexA.has(key)) indexA.set(key, i);
    }
  }

  const indexB = new Map<string, number>();
  if (tableB) {
    for (let i = 0; i < tableB.rowCount; i++) {
      if (filterCol && tableB.getValue(filterCol, i) !== options.filterRouteId) continue;
      const key = buildCompositeKeyFromTable(tableB, keyColumns, i);
      if (!indexB.has(key)) indexB.set(key, i);
    }
  }

  // Check duplicate keys
  const duplicateKeys: string[] = [];
  if (tableA) {
    duplicateKeys.push(...findDuplicateKeysColumnar(tableA, keyColumns));
  }
  if (tableB) {
    duplicateKeys.push(...findDuplicateKeysColumnar(tableB, keyColumns));
  }
  const uniqueDuplicateKeys = Array.from(new Set(duplicateKeys));

  // ── Diff pass: compare by column values without creating row objects ──
  // Tracking for batch patterns & column intensity
  const columnChangeCounts = new Map<string, number>();
  const patternCounts = new Map<string, number>();
  const transformTracking = new Map<string, number>();

  const rows: RowDiff[] = [];
  let addedCount = 0;
  let deletedCount = 0;
  let modifiedCount = 0;
  let unchangedCount = 0;

  // Process all keys from A (deleted + modified + unchanged)
  indexA.forEach((idxA, key) => {
    const idxB = indexB.get(key);

    if (idxB === undefined) {
      // Deleted
      deletedCount++;
      if (rows.length < MAX_DIFF_ROWS && tableA) {
        rows.push({
          type: 'deleted',
          key,
          oldRow: rowFromTable(tableA, idxA),
          newRow: null,
          changedColumns: [],
        });
      }
      return;
    }

    // Both exist — compare column-by-column without creating row objects
    const changedCols: string[] = [];
    for (const col of allColumns) {
      const valA = tableA ? tableA.getValue(col, idxA) : '';
      const valB = tableB ? tableB.getValue(col, idxB) : '';
      if (valA !== valB) {
        changedCols.push(col);
        columnChangeCounts.set(col, (columnChangeCounts.get(col) ?? 0) + 1);
      }
    }

    if (changedCols.length > 0) {
      modifiedCount++;

      // Track pattern
      const patternKey = changedCols.slice().sort().join(',');
      patternCounts.set(patternKey, (patternCounts.get(patternKey) ?? 0) + 1);

      // Track value transforms (sample first few per pattern)
      if ((transformTracking.size < 10000) && tableA && tableB) {
        for (const col of changedCols) {
          const valA = tableA.getValue(col, idxA);
          const valB = tableB.getValue(col, idxB);
          const tKey = `${patternKey}:${col}: ${valA} → ${valB}`;
          transformTracking.set(tKey, (transformTracking.get(tKey) ?? 0) + 1);
        }
      }

      // Only create row objects for output-capped results
      if (rows.length < MAX_DIFF_ROWS && tableA && tableB) {
        rows.push({
          type: 'modified',
          key,
          oldRow: rowFromTable(tableA, idxA),
          newRow: rowFromTable(tableB, idxB),
          changedColumns: changedCols,
        });
      }
    } else {
      unchangedCount++;
      // Do NOT create RowDiff for unchanged rows — this is the big memory save
    }
  });

  // Process keys only in B (added)
  indexB.forEach((idxB, key) => {
    if (indexA.has(key)) return; // already handled above

    addedCount++;
    if (rows.length < MAX_DIFF_ROWS && tableB) {
      rows.push({
        type: 'added',
        key,
        oldRow: null,
        newRow: rowFromTable(tableB, idxB),
        changedColumns: [],
      });
    }
  });

  // Compute analytics from tracking data (no row objects needed)
  const batchPatterns = detectBatchPatterns(
    patternCounts,
    modifiedCount,
    transformTracking,
  );
  const columnIntensities = computeColumnIntensity(
    columnChangeCounts,
    modifiedCount,
    allColumns,
  );

  return {
    fileName: options.fileName,
    keyColumns,
    rows,
    addedCount,
    deletedCount,
    modifiedCount,
    unchangedCount,
    batchPatterns,
    columnIntensities,
    duplicateKeys: uniqueDuplicateKeys,
    allColumns,
  };
}
