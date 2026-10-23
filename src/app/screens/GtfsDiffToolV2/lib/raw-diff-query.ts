/**
 * SQL for the raw diff table (DuckDB over the Parquet files written by
 * scripts/lib/raw-diff-parquet.mjs). Pure, so it is unit-tested.
 *
 * User input only ever goes in as bound parameters; column names come from
 * the table's own schema and are checked against IDENT before use.
 */

import type { RawAction } from './entity-diff-types';

export type { RawAction };

export const RAW_ACTIONS: RawAction[] = [
  'added',
  'deleted',
  'modified',
  'id_only',
  'unchanged',
];

export const RAW_ACTION_LABELS: Record<RawAction, string> = {
  added: 'Added',
  deleted: 'Deleted',
  modified: 'Modified',
  id_only: 'ID only',
  unchanged: 'Unchanged',
};

/** Real changes; ID-only and unchanged rows are opt-in. */
export const DEFAULT_ACTIONS: RawAction[] = ['added', 'deleted', 'modified'];

export interface RawDiffFilters {
  actions: RawAction[];
  routeId?: string | null;
  /** Matches the base or new trip_id (substring, case-insensitive). */
  tripId?: string;
  /** Exact stop_id, base or new (stop_times only). */
  stopId?: string;
  /** Rows where this column changed. */
  changedColumn?: string | null;
  /** Any value, base or new (substring, case-insensitive). */
  search?: string;
  /** A named rider-facing regression (fixed SQL, see RAW_PREDICATES). */
  predicate?: RawPredicate | null;
}

/**
 * Value tests on one side of a column; `$` stands for its b_ or n_ column.
 * Shared by the overview's counts and the rows they open, so both agree.
 */
export const VALUE_TESTS = {
  /** 1 = accessible / bikes allowed; anything else is not. */
  one: "coalesce($, '') = '1'",
  /** Regular pickup / drop-off (0 or empty). */
  regularBoarding: "coalesce($, '') IN ('', '0')",
  /** No pickup / drop-off. */
  noBoarding: "coalesce($, '') = '1'",
} as const;

function test(t: string, side: 'b' | 'n', column: string): string {
  return t.replace(/\$/g, q(`${side}_${column}`));
}

/** Value regular in the base feed and not in the new one. */
export function lostSql(
  column: string,
  regular: string,
  regularAfter: string,
): string {
  return `(${test(regular, 'b', column)} AND NOT ${test(regularAfter, 'n', column)})`;
}

export type RawPredicate = 'wheelchair_lost' | 'bikes_lost' | 'boarding_lost';

/** Fixed row conditions (never built from user input); null when a column is missing. */
export function predicateSql(
  p: RawPredicate,
  columns: string[],
): string | null {
  const has = (c: string): boolean => columns.includes(c);
  if (p === 'wheelchair_lost')
    return has('wheelchair_accessible')
      ? lostSql('wheelchair_accessible', VALUE_TESTS.one, VALUE_TESTS.one)
      : null;
  if (p === 'bikes_lost')
    return has('bikes_allowed')
      ? lostSql('bikes_allowed', VALUE_TESTS.one, VALUE_TESTS.one)
      : null;
  const parts = ['pickup_type', 'drop_off_type']
    .filter(has)
    .map(
      (c) =>
        `(${test(VALUE_TESTS.regularBoarding, 'b', c)} AND ${test(VALUE_TESTS.noBoarding, 'n', c)})`,
    );
  return parts.length > 0 ? `(${parts.join(' OR ')})` : null;
}

export interface RawDiffSort {
  /** A GTFS column, or 'route_id' / 'trip_key' / 'action'. */
  column: string;
  desc: boolean;
}

export interface RawDiffRow {
  action: RawAction;
  route_id: string | null;
  service_id: string | null;
  base_trip_id: string | null;
  new_trip_id: string | null;
  seq: number | null;
  base_line: number | null;
  new_line: number | null;
  changed: string[];
  /** GTFS values of the base row, null when the row is added. */
  base: Record<string, string> | null;
  /** GTFS values of the new row, null when the row is deleted. */
  new: Record<string, string> | null;
}

export interface SqlQuery {
  sql: string;
  params: string[];
}

const IDENT = /^[A-Za-z0-9_]+$/;
const META_SORT = new Set(['route_id', 'trip_key', 'action', 'service_id']);

function q(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Bad column name: ${name}`);
  return `"${name}"`;
}

/** GTFS columns of a table, from its b_<col> / n_<col> pairs. */
export function gtfsColumns(schema: string[]): string[] {
  return schema
    .filter((c) => c.startsWith('b_') && schema.includes(`n_${c.slice(2)}`))
    .map((c) => c.slice(2));
}

/** WHERE clause; `withActions: false` leaves the action filter out (for per-action counts). */
export function buildWhere(
  f: RawDiffFilters,
  columns: string[],
  withActions = true,
): SqlQuery {
  const parts: string[] = [];
  const params: string[] = [];
  if (withActions) {
    if (f.actions.length === 0) parts.push('FALSE');
    else {
      parts.push(`action IN (${f.actions.map(() => '?').join(', ')})`);
      params.push(...f.actions);
    }
  }
  if (f.routeId) {
    parts.push('route_id = ?');
    params.push(f.routeId);
  }
  const trip = f.tripId?.trim();
  if (trip) {
    parts.push('(base_trip_id ILIKE ? OR new_trip_id ILIKE ?)');
    params.push(`%${trip}%`, `%${trip}%`);
  }
  const stop = f.stopId?.trim();
  if (stop && columns.includes('stop_id')) {
    parts.push('(b_stop_id = ? OR n_stop_id = ?)');
    params.push(stop, stop);
  }
  if (f.changedColumn && columns.includes(f.changedColumn)) {
    parts.push("list_contains(string_split(changed, ','), ?)");
    params.push(f.changedColumn);
  }
  if (f.predicate) parts.push(predicateSql(f.predicate, columns) ?? 'FALSE');
  const search = f.search?.trim();
  if (search && columns.length > 0) {
    const all = columns.flatMap((c) => [q(`b_${c}`), q(`n_${c}`)]).join(', ');
    parts.push(`concat_ws('|', ${all}) ILIKE ?`);
    params.push(`%${search}%`);
  }
  return { sql: parts.length > 0 ? parts.join(' AND ') : 'TRUE', params };
}

function orderBy(sort: RawDiffSort | null, columns: string[]): string {
  const fileOrder = 'route_id NULLS LAST, trip_key, seq';
  if (sort == null) return fileOrder;
  const dir = sort.desc ? 'DESC' : 'ASC';
  if (META_SORT.has(sort.column))
    return `${q(sort.column)} ${dir} NULLS LAST, ${fileOrder}`;
  if (!columns.includes(sort.column)) return fileOrder;
  const c = sort.column;
  return `coalesce(${q(`n_${c}`)}, ${q(`b_${c}`)}) ${dir} NULLS LAST, ${fileOrder}`;
}

export function pageQuery(
  view: string,
  f: RawDiffFilters,
  columns: string[],
  sort: RawDiffSort | null,
  offset: number,
  limit: number,
): SqlQuery {
  const where = buildWhere(f, columns);
  const off = Math.max(0, Math.floor(offset));
  const lim = Math.max(1, Math.min(1000, Math.floor(limit)));
  return {
    sql: `SELECT * FROM ${q(view)} WHERE ${where.sql} ORDER BY ${orderBy(sort, columns)} LIMIT ${lim} OFFSET ${off}`,
    params: where.params,
  };
}

/** Rows per action under every filter but the action one. */
export function countsQuery(
  view: string,
  f: RawDiffFilters,
  columns: string[],
): SqlQuery {
  const where = buildWhere(f, columns, false);
  return {
    sql: `SELECT action, count(*)::INTEGER AS n FROM ${q(view)} WHERE ${where.sql} GROUP BY action`,
    params: where.params,
  };
}

/**
 * How many modified rows changed each column, under every filter but the
 * action one (the "Column change intensity" bars).
 */
export function columnStatsQuery(
  view: string,
  f: RawDiffFilters,
  columns: string[],
): SqlQuery {
  const where = buildWhere(f, columns, false);
  return {
    sql: `SELECT col, count(*)::INTEGER AS n FROM (SELECT unnest(string_split(changed, ',')) AS col FROM ${q(view)} WHERE ${where.sql} AND action = 'modified') GROUP BY col ORDER BY n DESC, col`,
    params: where.params,
  };
}

export function routesQuery(view: string): string {
  return `SELECT DISTINCT route_id FROM ${q(view)} WHERE route_id IS NOT NULL ORDER BY route_id`;
}

/** A Parquet row as returned by DuckDB -> RawDiffRow. */
export function toRawDiffRow(
  r: Record<string, unknown>,
  columns: string[],
): RawDiffRow {
  // DuckDB returns VARCHAR as string and INTEGER as number.
  const str = (v: unknown): string | null =>
    typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null;
  const num = (v: unknown): number | null => (v == null ? null : Number(v));
  const side = (prefix: 'b_' | 'n_'): Record<string, string> | null => {
    if (columns.every((c) => r[`${prefix}${c}`] == null)) return null;
    return Object.fromEntries(
      columns.map((c) => [c, str(r[`${prefix}${c}`]) ?? '']),
    );
  };
  const changed = str(r.changed);
  return {
    action: (str(r.action) ?? 'unchanged') as RawAction,
    route_id: str(r.route_id),
    service_id: str(r.service_id),
    base_trip_id: str(r.base_trip_id),
    new_trip_id: str(r.new_trip_id),
    seq: num(r.seq),
    base_line: num(r.base_line),
    new_line: num(r.new_line),
    changed: changed ? changed.split(',') : [],
    base: side('b_'),
    new: side('n_'),
  };
}
