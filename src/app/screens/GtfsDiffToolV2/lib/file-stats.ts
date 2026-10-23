/**
 * Rows of the overview's per-file table, from either source the generator
 * writes: entity counts (entity_types) or raw Parquet row counts (raw_tables).
 */

import type { EntityTypeDiff, FileDiff, RawTable } from './entity-diff-types';
import type { FileStatRow } from '../components/overview/FileStatsTable';

export function entityTypeRow(et: EntityTypeDiff): FileStatRow {
  return {
    file: et.file,
    before: et.total.base,
    after: et.total.new,
    added: et.counts.added,
    removed: et.counts.deleted,
    modified: et.counts.modified,
  };
}

/** Row-level file diff (v1 FileDiff with stats), e.g. calendar.txt. */
export function fileDiffRow(fd: FileDiff): FileStatRow {
  const st = fd.stats ?? {};
  return {
    file: fd.file_name,
    before: st.total_rows_base ?? 0,
    after: st.total_rows_new ?? 0,
    added: st.rows_added_count ?? 0,
    removed: st.rows_deleted_count ?? 0,
    modified: st.rows_modified_count ?? 0,
  };
}

/** Raw table rows; ID-only and unchanged rows count in before / after only. */
export function rawTableRow(t: RawTable): FileStatRow {
  const c = t.counts;
  return {
    file: t.file,
    before: c.deleted + c.modified + c.id_only + c.unchanged,
    after: c.added + c.modified + c.id_only + c.unchanged,
    added: c.added,
    removed: c.deleted,
    modified: c.modified,
  };
}

/**
 * One row per file of a category: a file's raw table when there is one
 * (row counts), else its entity counts. `primary` (e.g. routes.txt) leads.
 */
export function categoryFileRows(
  entityTypes: EntityTypeDiff[],
  rawTables: RawTable[] = [],
  primary?: string,
): FileStatRow[] {
  const raw = new Map(rawTables.map((t) => [t.file, t]));
  const rows = entityTypes.map((et) => {
    const t = raw.get(et.file);
    return t ? rawTableRow(t) : entityTypeRow(et);
  });
  for (const t of rawTables) {
    if (!entityTypes.some((et) => et.file === t.file))
      rows.push(rawTableRow(t));
  }
  if (primary) {
    const i = rows.findIndex((r) => r.file === primary);
    if (i > 0) rows.unshift(...rows.splice(i, 1));
  }
  return rows;
}
