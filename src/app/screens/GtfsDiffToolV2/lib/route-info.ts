/**
 * Every route's name, colours and feeds for the pages' route chips, read in
 * one query from raw/routes.parquet: the routes.txt raw table holds every
 * route of either feed (unchanged ones compact: base values NULL where equal
 * to the new ones), so no separate lookup file is written. Shared by the app
 * (DuckDB-WASM) and the build scripts (DuckDB in Node).
 *
 * Pure; type-only imports besides lib/diff-layout.
 */

import { rawTablePath } from './diff-layout';
import type { RouteInfo } from './entity-diff-types';

/** What a document's `route_info_file` points to: the routes.txt raw table. */
export const ROUTE_INFO_TABLE = rawTablePath('routes.txt');

/**
 * The lookup's columns from the routes.txt raw table registered as `view`:
 * only the name and colour columns, so a ranged read fetches nothing else.
 */
export function routeInfoSql(view: string): string {
  return `SELECT trip_key AS route_id, action AS status,
    COLUMNS('^[bn]_route_(short_name|long_name|color|text_color)$') FROM ${view}`;
}

/** Feeds a route is in, from its status (routes map) or action (raw table). */
export function presenceOf(status: string): RouteInfo['presence'] {
  return status === 'deleted' ? 'base' : status === 'added' ? 'new' : 'both';
}

const text = (v: unknown): string =>
  typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'bigint'
      ? v.toString()
      : '';

/** A column's value: the new feed's, else the base one's (raw rows). */
function field(r: Record<string, unknown>, column: string): string {
  if (column in r) return text(r[column]);
  const n = r[`n_route_${column}`];
  return text(n ?? r[`b_route_${column}`]);
}

/** route_id -> RouteInfo from the rows of routeInfoSql. */
export function routeInfoFromRows(
  rows: Array<Record<string, unknown>>,
): Record<string, RouteInfo> {
  const out: Record<string, RouteInfo> = {};
  for (const r of rows) {
    out[text(r.route_id)] = {
      short_name: field(r, 'short_name'),
      long_name: field(r, 'long_name'),
      color: field(r, 'color'),
      text_color: field(r, 'text_color'),
      presence: presenceOf(text(r.status)),
    };
  }
  return out;
}
