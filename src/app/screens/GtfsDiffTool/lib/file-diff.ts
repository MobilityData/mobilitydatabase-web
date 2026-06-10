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
import {
  type ColumnEntry,
  type ColumnStat,
  type FieldChange,
  type FileDiff,
  type FileStats,
  type RowAdded,
  type RowDeleted,
  type RowModified,
} from './gtfs-diff-types';

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

// ── Schema-compliant diff (GTFS Diff v2) ──────────────────────────

/** CSV-escape a single field value per RFC 4180. */
function csvEscapeField(value: string): string {
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/** Build a comma-separated CSV row string in the given column order. */
function buildRawValue(
  table: ColumnarTable,
  rowIndex: number,
  columns: string[],
): string {
  return columns
    .map((col) => csvEscapeField(table.getValue(col, rowIndex)))
    .join(',');
}

/** Build a primary-key identifier object from the given table row. */
function buildIdentifier(
  table: ColumnarTable,
  rowIndex: number,
  keyColumns: string[],
): Record<string, string> {
  const id: Record<string, string> = {};
  for (const k of keyColumns) {
    id[k] = table.getValue(k, rowIndex);
  }
  return id;
}

/** Build a composite key string for indexing. */
function buildKey(
  table: ColumnarTable,
  rowIndex: number,
  keyColumns: string[],
): string {
  let key = table.getValue(keyColumns[0], rowIndex);
  for (let c = 1; c < keyColumns.length; c++) {
    key += '|' + table.getValue(keyColumns[c], rowIndex);
  }
  return key;
}

/**
 * Compute a schema-compliant FileDiff for a single GTFS file.
 *
 * @param tableA       Parsed columnar table for the base feed (null if file absent).
 * @param tableB       Parsed columnar table for the new feed (null if file absent).
 * @param fileName     GTFS file name (e.g. "routes.txt").
 * @param rowChangesCap Max row changes to include; null = uncapped.
 */
export function computeFileDiffSchema(
  tableA: ColumnarTable | null,
  tableB: ColumnarTable | null,
  fileName: string,
  rowChangesCap: number | null,
): FileDiff {
  const headersA = tableA?.headers ?? [];
  const headersB = tableB?.headers ?? [];
  const setA = new Set(headersA);
  const setB = new Set(headersB);

  // columns_added: present in B but not A, in B's header order
  const columns_added: ColumnEntry[] = headersB
    .filter((h) => !setA.has(h))
    .map((name) => ({ name, position: headersB.indexOf(name) + 1 }));

  // columns_deleted: present in A but not B, in A's header order
  const columns_deleted: ColumnEntry[] = headersA
    .filter((h) => !setB.has(h))
    .map((name) => ({ name, position: headersA.indexOf(name) + 1 }));

  const fileAction: 'added' | 'deleted' | 'modified' = !tableA
    ? 'added'
    : !tableB
      ? 'deleted'
      : 'modified';

  // columns: base feed column order, then new-feed-only columns appended
  const columns: string[] = [
    ...headersA,
    ...headersB.filter((h) => !setA.has(h)),
  ];

  // Resolve effective key columns (must exist in the union columns list)
  const defaultKeys = GTFS_DEFAULT_KEYS[fileName];
  const candidateKeys =
    defaultKeys ??
    (headersA.length > 0 ? [headersA[0]] : headersB.length > 0 ? [headersB[0]] : []);
  const effectiveKeyColumns = candidateKeys.filter((k) => columns.includes(k));
  const keyColumns =
    effectiveKeyColumns.length > 0
      ? effectiveKeyColumns
      : columns.length > 0
        ? [columns[0]]
        : [];

  // Build key → row-index maps
  const indexA = new Map<string, number>();
  if (tableA && keyColumns.length > 0) {
    for (let i = 0; i < tableA.rowCount; i++) {
      const key = buildKey(tableA, i, keyColumns);
      if (!indexA.has(key)) indexA.set(key, i);
    }
  }

  const indexB = new Map<string, number>();
  if (tableB && keyColumns.length > 0) {
    for (let i = 0; i < tableB.rowCount; i++) {
      const key = buildKey(tableB, i, keyColumns);
      if (!indexB.has(key)) indexB.set(key, i);
    }
  }

  const added: RowAdded[] = [];
  const deleted: RowDeleted[] = [];
  const modified: RowModified[] = [];

  let trueAddedCount = 0;
  let trueDeletedCount = 0;
  let trueModifiedCount = 0;

  // Per-column modification tracking (modified rows only) for column_stats.
  const columnModificationCounts = new Map<string, number>();

  // Distribute the cap evenly across the three change types so one type
  // (e.g. thousands of deletes) cannot crowd out the others in the output.
  const capPerType =
    rowChangesCap !== null ? Math.floor(rowChangesCap / 3) : Number.MAX_SAFE_INTEGER;

  // Process rows present in A (deleted + modified)
  indexA.forEach((idxA, key) => {
    const idxB = indexB.get(key);

    if (idxB === undefined) {
      trueDeletedCount++;
      if (deleted.length < capPerType && tableA) {
        deleted.push({
          identifier: buildIdentifier(tableA, idxA, keyColumns),
          raw_value: buildRawValue(tableA, idxA, columns),
          base_line_number: idxA + 2, // header = line 1
        });
      }
    } else {
      // Compare columns
      const fieldChanges: FieldChange[] = [];
      for (const col of columns) {
        const baseVal = tableA ? tableA.getValue(col, idxA) : '';
        const newVal = tableB ? tableB.getValue(col, idxB) : '';
        if (baseVal !== newVal) {
          fieldChanges.push({ field: col, base_value: baseVal, new_value: newVal });
          columnModificationCounts.set(
            col,
            (columnModificationCounts.get(col) ?? 0) + 1,
          );
        }
      }
      if (fieldChanges.length > 0) {
        trueModifiedCount++;
        if (modified.length < capPerType && tableA && tableB) {
          modified.push({
            identifier: buildIdentifier(tableA, idxA, keyColumns),
            raw_value: buildRawValue(tableA, idxA, columns),
            base_line_number: idxA + 2,
            new_line_number: idxB + 2,
            field_changes: fieldChanges,
          });
        }
      }
    }
  });

  // Process rows only in B (added)
  indexB.forEach((idxB, key) => {
    if (indexA.has(key)) return;
    trueAddedCount++;
    if (added.length < capPerType && tableB) {
      added.push({
        identifier: buildIdentifier(tableB, idxB, keyColumns),
        raw_value: buildRawValue(tableB, idxB, columns),
        new_line_number: idxB + 2,
      });
    }
  });

  const totalTrue = trueAddedCount + trueDeletedCount + trueModifiedCount;
  const totalCapped = added.length + deleted.length + modified.length;
  const omitted = totalTrue - totalCapped;

  // Per-column modification stats (relative to total modified rows).
  const column_stats: ColumnStat[] = Array.from(columnModificationCounts.entries())
    .map(([column, count]) => ({
      column,
      modifications_count: count,
      modifications_percentage:
        trueModifiedCount > 0
          ? Math.round((count / trueModifiedCount) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.modifications_count - a.modifications_count);

  const totalRowsBase = tableA?.rowCount ?? 0;
  const totalRowsNew = tableB?.rowCount ?? 0;
  const largerRowCount = Math.max(totalRowsBase, totalRowsNew);
  const rowsChangedPercentage =
    largerRowCount > 0
      ? Math.round((totalTrue / largerRowCount) * 1000) / 10
      : 0;

  const stats: FileStats = {
    total_rows_base: totalRowsBase,
    total_rows_new: totalRowsNew,
    columns_added_count: columns_added.length,
    columns_deleted_count: columns_deleted.length,
    rows_added_count: trueAddedCount,
    rows_deleted_count: trueDeletedCount,
    rows_modified_count: trueModifiedCount,
    rows_changed_percentage: rowsChangedPercentage,
    column_stats,
  };

  const fileDiff: FileDiff = {
    file_name: fileName,
    file_action: fileAction,
    columns_added,
    columns_deleted,
    stats,
  };

  if (columns.length > 0) {
    fileDiff.row_changes = {
      primary_key: keyColumns,
      columns,
      added,
      deleted,
      modified,
    };
  }

  if (omitted > 0 && rowChangesCap !== null) {
    fileDiff.truncated = {
      is_truncated: true,
      omitted_count: omitted,
    };
  }

  return fileDiff;
}
