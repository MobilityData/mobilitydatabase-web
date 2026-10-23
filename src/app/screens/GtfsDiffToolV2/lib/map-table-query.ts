/**
 * SQL for the stops and routes maps' lists (DuckDB over maps/stops.parquet
 * and maps/routes.parquet, written by scripts/lib/map-tables.mjs). Pure, so
 * it is unit-tested; the filters mean the same as stops-utils / routes-utils
 * applied to the full lists.
 *
 * User input only goes in as bound parameters; numbers are checked finite
 * and view names against IDENT.
 */

import { decodePolyline } from './entity-diff-codec';
import type { LonLat, RouteFlag } from './entity-diff-types';
import { ROUTE_FLAGS, type RouteKind } from './routes-utils';
import { type StopFilters, type StopKind, normalizeText } from './stops-utils';

export interface SqlQuery {
  sql: string;
  params: unknown[];
}

const IDENT = /^[A-Za-z0-9_]+$/;

function view(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Bad view: ${name}`);
  return `"${name}"`;
}

function num(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Bad number: ${n}`);
  return String(n);
}

function page(offset: number, limit: number): string {
  const off = Math.max(0, Math.floor(offset));
  const lim = Math.max(1, Math.min(1000, Math.floor(limit)));
  return `LIMIT ${lim} OFFSET ${off}`;
}

/** Search clause on the table's normalised `search` column. */
function searchClause(query: string, parts: string[], params: unknown[]): void {
  const q = normalizeText(query);
  if (q === '') return;
  parts.push('contains(search, ?)');
  params.push(q);
}

function inList(
  column: string,
  values: string[],
  parts: string[],
  params: unknown[],
): void {
  if (values.length === 0) parts.push('FALSE');
  else {
    parts.push(`${column} IN (${values.map(() => '?').join(', ')})`);
    params.push(...values);
  }
}

function where(parts: string[]): string {
  return parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '';
}

// ── Stops ──────────────────────────────────────────────────────────

/** A changed stop as the list shows it. */
export interface StopListRow {
  stop_id: string;
  name: string;
  kind: StopKind;
  moved_m: number | null;
  /** Changed fields. */
  changed: string[];
}

/** A changed stop as the map draws it. */
export interface StopPoint {
  stop_id: string;
  kind: StopKind;
  coord: LonLat;
  base: LonLat | null;
  new: LonLat | null;
}

/** Rows with their display kind (stopKind) as `kind`. */
function stopsFrom(v: string, minMoveM: number): string {
  const m = num(minMoveM);
  return `(SELECT *, CASE WHEN status = 'added' THEN 'added' WHEN status = 'deleted' THEN 'removed'
    WHEN moved_m >= ${m} THEN 'moved' ELSE 'modified' END AS kind FROM ${view(v)})`;
}

/** WHERE for stop filters; `withKinds: false` for per-kind counts. */
export function stopsWhere(
  f: StopFilters,
  withKinds = true,
): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (withKinds) inList('kind', f.kinds, parts, params);
  // isPrecisionOnly: only coordinates changed, by less than the threshold.
  if (f.hidePrecisionOnly)
    parts.push("NOT (status = 'modified' AND coord_only AND kind <> 'moved')");
  searchClause(f.search, parts, params);
  return { sql: where(parts), params };
}

export function stopsPageQuery(
  v: string,
  f: StopFilters,
  offset: number,
  limit: number,
): SqlQuery {
  const w = stopsWhere(f);
  return {
    sql: `SELECT stop_id, name, kind, moved_m, changed FROM ${stopsFrom(v, f.minMoveM)} ${w.sql} ORDER BY ord ${page(offset, limit)}`,
    params: w.params,
  };
}

/** Stops per kind under every filter but the kind one. */
export function stopsKindCountsQuery(v: string, f: StopFilters): SqlQuery {
  const w = stopsWhere(f, false);
  return {
    sql: `SELECT kind, count(*)::INTEGER AS n FROM ${stopsFrom(v, f.minMoveM)} ${w.sql} GROUP BY kind`,
    params: w.params,
  };
}

/** Every matching stop with a position, for the map. */
export function stopsPointsQuery(v: string, f: StopFilters): SqlQuery {
  const w = stopsWhere(f);
  const located = w.sql
    ? `${w.sql} AND lon IS NOT NULL`
    : 'WHERE lon IS NOT NULL';
  return {
    sql: `SELECT stop_id, kind, lon, lat, base_lon, base_lat, new_lon, new_lat FROM ${stopsFrom(v, f.minMoveM)} ${located} ORDER BY ord`,
    params: w.params,
  };
}

/** One stop's StopChange JSON. */
export function stopDetailQuery(v: string, stopId: string): SqlQuery {
  return {
    sql: `SELECT detail FROM ${view(v)} WHERE stop_id = ? LIMIT 1`,
    params: [stopId],
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

function pair(lon: unknown, lat: unknown): LonLat | null {
  return lon == null || lat == null ? null : [Number(lon), Number(lat)];
}

export function toStopListRow(r: Record<string, unknown>): StopListRow {
  const changed = str(r.changed);
  return {
    stop_id: str(r.stop_id),
    name: str(r.name),
    kind: str(r.kind) as StopKind,
    moved_m: numOrNull(r.moved_m),
    changed: changed ? changed.split(',') : [],
  };
}

export function toStopPoint(r: Record<string, unknown>): StopPoint {
  return {
    stop_id: str(r.stop_id),
    kind: str(r.kind) as StopKind,
    coord: [Number(r.lon), Number(r.lat)],
    base: pair(r.base_lon, r.base_lat),
    new: pair(r.new_lon, r.new_lat),
  };
}

// ── Routes ─────────────────────────────────────────────────────────

export interface RouteTableFilters {
  /** Kinds to show (unchanged included when shown). */
  kinds: RouteKind[];
  /** Routes having any of these changes; empty = no restriction. */
  flags: RouteFlag[];
  search: string;
}

/** A route as the list shows it. */
export interface RouteListRow {
  route_id: string;
  kind: RouteKind;
  short_name: string;
  long_name: string;
  color: string;
  text_color: string;
  summary: string;
}

function flagColumn(f: RouteFlag): string {
  if (!ROUTE_FLAGS.includes(f)) throw new Error(`Bad flag: ${f}`);
  return `f_${f}`;
}

export function routesWhere(
  f: RouteTableFilters,
  { kinds = true, flags = true }: { kinds?: boolean; flags?: boolean } = {},
): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (kinds) inList('kind', f.kinds, parts, params);
  if (flags && f.flags.length > 0)
    parts.push(`(${f.flags.map(flagColumn).join(' OR ')})`);
  searchClause(f.search, parts, params);
  return { sql: where(parts), params };
}

export function routesPageQuery(
  v: string,
  f: RouteTableFilters,
  offset: number,
  limit: number,
): SqlQuery {
  const w = routesWhere(f);
  return {
    sql: `SELECT route_id, kind, short_name, long_name, color, text_color, summary FROM ${view(v)} ${w.sql} ORDER BY ord ${page(offset, limit)}`,
    params: w.params,
  };
}

/** Routes per kind under the flag and search filters (every kind). */
export function routesKindCountsQuery(
  v: string,
  f: RouteTableFilters,
): SqlQuery {
  const w = routesWhere(f, { kinds: false });
  return {
    sql: `SELECT kind, count(*)::INTEGER AS n FROM ${view(v)} ${w.sql} GROUP BY kind`,
    params: w.params,
  };
}

/** Routes having each change, under the kind and search filters. */
export function routesFlagCountsQuery(
  v: string,
  f: RouteTableFilters,
): SqlQuery {
  const w = routesWhere(f, { flags: false });
  const sums = ROUTE_FLAGS.map(
    (fl) => `coalesce(sum(${flagColumn(fl)}::INTEGER), 0)::INTEGER AS ${fl}`,
  ).join(', ');
  return { sql: `SELECT ${sums} FROM ${view(v)} ${w.sql}`, params: w.params };
}

/** Matching routes' overview lines (geom JSON), for the map. */
export function routesOverviewQuery(v: string, f: RouteTableFilters): SqlQuery {
  const w = routesWhere(f);
  return {
    sql: `SELECT route_id, kind, geom, min_lon, min_lat, max_lon, max_lat FROM ${view(v)} ${w.sql} ORDER BY ord`,
    params: w.params,
  };
}

/** One route's RouteDetail JSON (deep-encoded). */
export function routeDetailQuery(v: string, routeId: string): SqlQuery {
  return {
    sql: `SELECT detail FROM ${view(v)} WHERE route_id = ? LIMIT 1`,
    params: [routeId],
  };
}

/**
 * The route a shape belongs to: the first one whose new trips use it, else
 * the first one that has it (or had it, renamed).
 */
export function routeOfShapeQuery(v: string, shapeId: string): SqlQuery {
  const token = `\u001f${shapeId}\u001f`;
  return {
    sql: `SELECT route_id, kind FROM ${view(v)} WHERE contains(shapes_all, ?) ORDER BY contains(shapes_new, ?) DESC, ord LIMIT 1`,
    params: [token, token],
  };
}

export function toRouteListRow(r: Record<string, unknown>): RouteListRow {
  return {
    route_id: str(r.route_id),
    kind: str(r.kind) as RouteKind,
    short_name: str(r.short_name),
    long_name: str(r.long_name),
    color: str(r.color),
    text_color: str(r.text_color),
    summary: str(r.summary),
  };
}

/** A route as the overview map draws it (no route selected). */
export interface RouteOverview {
  route_id: string;
  kind: RouteKind;
  /** Each direction's line (new, else old). */
  lines: LonLat[][];
  /** Sections onto new road / off old road. */
  added: LonLat[][];
  removed: LonLat[][];
  bounds: [LonLat, LonLat] | null;
}

function lines(v: unknown): LonLat[][] {
  return Array.isArray(v)
    ? v.map((s) => decodePolyline(String(s)) as LonLat[])
    : [];
}

export function toRouteOverview(r: Record<string, unknown>): RouteOverview {
  const geom = JSON.parse(str(r.geom) || '{}') as {
    l?: unknown;
    a?: unknown;
    r?: unknown;
  };
  const min = pair(r.min_lon, r.min_lat);
  const max = pair(r.max_lon, r.max_lat);
  return {
    route_id: str(r.route_id),
    kind: str(r.kind) as RouteKind,
    lines: lines(geom.l),
    added: lines(geom.a),
    removed: lines(geom.r),
    bounds: min && max ? [min, max] : null,
  };
}

/** Union of the routes' bounds. */
export function overviewBounds(
  routes: RouteOverview[],
): [LonLat, LonLat] | null {
  let out: [LonLat, LonLat] | null = null;
  for (const r of routes) {
    if (r.bounds == null) continue;
    const [[a, b], [c, d]] = r.bounds;
    out =
      out == null
        ? [
            [a, b],
            [c, d],
          ]
        : [
            [Math.min(out[0][0], a), Math.min(out[0][1], b)],
            [Math.max(out[1][0], c), Math.max(out[1][1], d)],
          ];
  }
  return out;
}
