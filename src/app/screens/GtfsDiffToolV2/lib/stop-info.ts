/**
 * Stops looked up by stop_id in raw/stops.parquet, the stops.txt raw table:
 * it holds every stop of either feed once (unchanged ones compact: base
 * values NULL where equal to the new ones), so the route detail, the Trips
 * index and the pathways diff only store stop ids. Documents point to it
 * with `stop_info_file`.
 *
 * The queries name only the columns they need, so a ranged read of the
 * table (lib/duckdb-client parquetView with read `ranged`) fetches nothing else.
 * Shared by the app (DuckDB-WASM) and the build scripts (DuckDB in Node).
 *
 * Pure; type-only imports besides lib/diff-layout.
 */

import { rawTablePath } from './diff-layout';
import type { FieldChange, RouteStopInfo } from './entity-diff-types';
import type {
  PathwaysDiff,
  SparseRow,
  StationPathwaysDiff,
} from './pathways-types';

/** What a document's `stop_info_file` points to: the stops.txt raw table. */
export const STOP_INFO_TABLE = rawTablePath('stops.txt');

const IDENT = /^[A-Za-z0-9_]+$/;

function view(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Bad view: ${name}`);
  return `"${name}"`;
}

const text = (v: unknown): string =>
  typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'bigint'
      ? v.toString()
      : '';

/** Every stop's name: the new feed's, else the base one's. */
export function stopNamesSql(rawView: string): string {
  return `SELECT trip_key AS stop_id, COLUMNS('^[bn]_stop_name$') FROM ${view(rawView)}`;
}

/** stop_id -> name from the rows of stopNamesSql. */
export function stopNamesFromRows(
  rows: Array<Record<string, unknown>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows)
    out[text(r.stop_id)] = text(r.n_stop_name ?? r.b_stop_name);
  return out;
}

/**
 * Every stop's name, position and change for the route maps: the raw
 * table's names and coordinates, its action as the status, and how far the
 * stop moved from the stops analysis (analysis/stops.parquet: stops changed in
 * stops.txt or in the routes serving them, one row each; `analysisView`
 * null when there is none). Only its stop_id and moved_m are read, so its
 * served (route, direction) lists are not fetched.
 */
export function stopInfoSql(
  rawView: string,
  analysisView: string | null,
): string {
  const moved = analysisView
    ? `LEFT JOIN (SELECT stop_id AS moved_id, moved_m FROM ${view(analysisView)}) a ON a.moved_id = r.trip_key`
    : '';
  return `SELECT r.trip_key AS stop_id, r.action, ${analysisView ? 'a.moved_m' : 'NULL::DOUBLE AS moved_m'},
    COLUMNS('^[bn]_stop_(name|lat|lon)$') FROM ${view(rawView)} r ${moved}`;
}

/** A coordinate pair, or null unless both parse. */
function coord(lon: unknown, lat: unknown): [number, number] | null {
  const x = Number.parseFloat(text(lon));
  const y = Number.parseFloat(text(lat));
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

/** 6 decimals, as the build rounds coordinates. */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** stop_id -> RouteStopInfo from the rows of stopInfoSql. */
export function stopInfoFromRows(
  rows: Array<Record<string, unknown>>,
): Record<string, RouteStopInfo> {
  const out: Record<string, RouteStopInfo> = {};
  for (const r of rows) {
    const action = text(r.action);
    // Compact unchanged rows: a NULL base value is the new one.
    const base = (c: string): unknown => r[`b_stop_${c}`] ?? r[`n_stop_${c}`];
    const next = (c: string): unknown => r[`n_stop_${c}`];
    const c =
      action === 'deleted'
        ? coord(base('lon'), base('lat'))
        : coord(next('lon'), next('lat'));
    if (c == null) continue;
    out[text(r.stop_id)] = {
      name: text(action === 'deleted' ? base('name') : next('name')),
      coord: [round6(c[0]), round6(c[1])],
      status: (action === 'id_only'
        ? 'unchanged'
        : action) as RouteStopInfo['status'],
      moved_m: r.moved_m == null ? 0 : Math.round(Number(r.moved_m) * 10) / 10,
    };
  }
  return out;
}

/**
 * The full raw rows of some stops (pathways station nodes); `ids` are bound
 * as one U+001F-joined string.
 */
export function stopRowsQuery(
  rawView: string,
  ids: string[],
): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT * FROM ${view(rawView)} WHERE list_contains(string_split(?, chr(31)), trip_key)`,
    params: [ids.join('\u001f')],
  };
}

/** One feed's side of a raw stops row, empty values dropped; null if absent. */
export interface StopRowSides {
  base: SparseRow | null;
  new: SparseRow | null;
  field_changes: FieldChange[];
}

/**
 * A raw stops row as its base and new stops.txt rows (sparse, as the
 * pathways diff stores rows) and its field changes. A compact unchanged
 * row's NULL base values are the new ones.
 */
export function stopRowSides(r: Record<string, unknown>): StopRowSides {
  const action = text(r.action);
  const columns = Object.keys(r)
    .filter((k) => k.startsWith('n_'))
    .map((k) => k.slice(2));
  const side = (prefix: 'b' | 'n'): SparseRow | null => {
    if (prefix === 'b' && action === 'added') return null;
    if (prefix === 'n' && action === 'deleted') return null;
    const row: SparseRow = {};
    for (const c of columns) {
      const v =
        prefix === 'b' && action === 'unchanged'
          ? (r[`b_${c}`] ?? r[`n_${c}`])
          : r[`${prefix}_${c}`];
      const t = text(v);
      if (t !== '') row[c] = t;
    }
    return row;
  };
  const base = side('b');
  const next = side('n');
  const changed = text(r.changed).split(',').filter(Boolean);
  return {
    base,
    new: next,
    field_changes: changed.map((field) => ({
      field,
      base_value: base?.[field] ?? '',
      new_value: next?.[field] ?? '',
    })),
  };
}

/** Stop ids whose rows a pathways diff needs: every station and node. */
export function pathwaysStopIds(doc: PathwaysDiff): string[] {
  const ids = new Set<string>();
  for (const s of doc.stations) {
    ids.add(s.station_id);
    for (const n of s.nodes) ids.add(n.stop_id);
  }
  return [...ids];
}

/**
 * A pathways diff with its station and node stops.txt rows put back from
 * `rows` (stopRowSides of the stops.txt raw table, by stop_id).
 */
export function withPathwaysStopRows(
  doc: PathwaysDiff,
  rows: ReadonlyMap<string, StopRowSides>,
): PathwaysDiff {
  const none: StopRowSides = { base: null, new: null, field_changes: [] };
  const stations: StationPathwaysDiff[] = doc.stations.map((s) => {
    const st = rows.get(s.station_id) ?? none;
    return {
      ...s,
      station: { base: st.base, new: st.new },
      nodes: s.nodes.map((n) => ({ ...n, ...(rows.get(n.stop_id) ?? none) })),
    };
  });
  return { ...doc, stations };
}
