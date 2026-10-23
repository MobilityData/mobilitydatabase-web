/**
 * Text search over raw file diffs: keeps the rows whose identifier, CSV
 * values or field changes contain the query, and drops files left with no
 * matching row. Case- and accent-insensitive ("berri" matches "Berri",
 * "montreal" matches "Montréal").
 */

import type { FileDiff, RowIdentifier } from './gtfs-diff-types';

export function normalizeSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function identifierText(id: RowIdentifier): string {
  return Object.values(id).join(' ');
}

/** One file with only the rows matching `query` (the file is always kept). */
export function searchFileDiff(diff: FileDiff, query: string): FileDiff {
  const q = normalizeSearch(query);
  const rc = diff.row_changes;
  if (q === '' || rc == null) return diff;
  const has = (...parts: string[]): boolean =>
    normalizeSearch(parts.join(' ')).includes(q);
  return {
    ...diff,
    row_changes: {
      ...rc,
      added: rc.added.filter((r) =>
        has(identifierText(r.identifier), r.raw_value),
      ),
      deleted: rc.deleted.filter((r) =>
        has(identifierText(r.identifier), r.raw_value),
      ),
      modified: rc.modified.filter((r) =>
        has(
          identifierText(r.identifier),
          r.raw_value,
          ...r.field_changes.flatMap((c) => [
            c.field,
            c.base_value,
            c.new_value,
          ]),
        ),
      ),
    },
  };
}

/** Files with only their matching rows; files left with none are dropped. */
export function searchFileDiffs(
  fileDiffs: FileDiff[],
  query: string,
): FileDiff[] {
  if (normalizeSearch(query) === '') return fileDiffs;
  return fileDiffs.flatMap((diff) => {
    if (diff.row_changes == null) {
      return normalizeSearch(diff.file_name).includes(normalizeSearch(query))
        ? [diff]
        : [];
    }
    const found = searchFileDiff(diff, query);
    return countRows([found]) > 0 ? [found] : [];
  });
}

/** Rows left after a search, for the result count. */
export function countRows(fileDiffs: FileDiff[]): number {
  return fileDiffs.reduce((n, d) => {
    const rc = d.row_changes;
    return (
      n + (rc ? rc.added.length + rc.deleted.length + rc.modified.length : 0)
    );
  }, 0);
}
