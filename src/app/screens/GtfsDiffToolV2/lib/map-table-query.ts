/**
 * SQL for the stops and routes maps' lists. Routes: DuckDB over
 * analysis/routes.parquet and analysis/shapes.parquet (lib/route-tables; a route's
 * detail is assembled by lib/route-detail). Stops: a table the page
 * builds once (stopsTableQuery) from raw/stops.parquet and the stops
 * analysis (analysis/stops.parquet). Pure, so
 * it is unit-tested; the filters mean the same as stops-utils / routes-utils
 * applied to the full lists.
 *
 * User input only goes in as bound parameters; numbers are checked finite
 * and view names against IDENT.
 */

import { decodePolyline } from './entity-diff-codec';
import type { LonLat, RouteFlag, StopChange } from './entity-diff-types';
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

/** stops.txt's columns a raw column list holds; others read as NULL. */
function rawColumn(
  rawColumns: string[],
  side: 'b' | 'n',
  column: 'stop_name' | 'stop_lat' | 'stop_lon',
): string {
  return rawColumns.includes(column)
    ? `r."${side}_${column}"`
    : 'NULL::VARCHAR';
}

/** Lower case, accents and surrounding spaces removed (normalizeText). */
function normalizedSql(expr: string): string {
  return `trim(lower(strip_accents(coalesce(${expr}, ''))))`;
}

/**
 * Distinct route_ids, sorted, of a served (route, direction) pairs column
 * (lib/route-tables ROUTE_DIR_TYPE[]); [] when NULL.
 */
function servedRoutesSql(expr: string): string {
  return `coalesce(list_sort(list_distinct(list_transform(${expr}, x -> x.route_id))), []::VARCHAR[])`;
}

/**
 * The stops page's table, created once per page load: one row per stop
 * changed in stops.txt, from its raw/stops.parquet row (action, changed
 * columns, base / new stops.txt values) and its stops analysis row
 * (analysis/stops.parquet: moved_m, served_base, served_new), plus what the
 * list, filters and map read:
 *   ord          list order: modified, added, deleted, then stop_id (case-insensitive)
 *   name         new stop_name, else the base one
 *   base_lon/lat, new_lon/lat   each feed's coordinates (NULL unless both
 *                parse), rounded to 6 decimals; lon/lat the new ones, else
 *                the base ones (where the map draws the stop)
 *   search       normalised stop_id and both names, U+001F-separated
 *   coord_only   only stop_lat / stop_lon changed
 *   base_routes, new_routes   distinct route_ids serving the stop in each
 *                feed, from the served (route, direction) pairs
 * The raw table holds every stop and the analysis table also the stops
 * whose only change is the routes serving them: rows come from the raw
 * table's added / deleted / modified rows, so those (raw action unchanged)
 * are not changed stops here.
 * `rawView` is null when stops.txt did not change (no raw table): the table
 * is then empty. `rawColumns` are the raw table's GTFS columns.
 */
export function stopsTableQuery(
  table: string,
  analysisView: string,
  rawView: string | null,
  rawColumns: string[],
): SqlQuery {
  const cols = rawView ? rawColumns : [];
  const raw = rawView
    ? view(rawView)
    : '(SELECT NULL::VARCHAR AS trip_key, NULL::VARCHAR AS action, NULL::VARCHAR AS changed WHERE FALSE)';
  const coord = (side: 'b' | 'n', axis: 'lon' | 'lat'): string =>
    `TRY_CAST(${rawColumn(cols, side, `stop_${axis}`)} AS DOUBLE)`;
  const located = (p: string): string =>
    `isfinite(${p}_lon_raw) AND isfinite(${p}_lat_raw)`;
  const rounded = (p: string, axis: 'lon' | 'lat'): string =>
    `CASE WHEN ${located(p)} THEN round(${p}_${axis}_raw, 6) END`;
  return {
    sql: `CREATE OR REPLACE TABLE ${view(table)} AS
      WITH s AS (
        SELECT r.trip_key AS stop_id, r.action AS status, r.changed,
          ${rawColumn(cols, 'b', 'stop_name')} AS b_name, ${rawColumn(cols, 'n', 'stop_name')} AS n_name,
          ${coord('b', 'lon')} AS base_lon_raw, ${coord('b', 'lat')} AS base_lat_raw,
          ${coord('n', 'lon')} AS new_lon_raw, ${coord('n', 'lat')} AS new_lat_raw,
          a.moved_m, ${servedRoutesSql('a.served_base')} AS base_routes,
          ${servedRoutesSql('a.served_new')} AS new_routes
        FROM ${raw} r LEFT JOIN ${view(analysisView)} a ON a.stop_id = r.trip_key
        WHERE r.action IN ('added', 'deleted', 'modified')
      ), p AS (
        SELECT *, ${rounded('base', 'lon')} AS base_lon, ${rounded('base', 'lat')} AS base_lat,
          ${rounded('new', 'lon')} AS new_lon, ${rounded('new', 'lat')} AS new_lat
        FROM s
      )
      SELECT
        (row_number() OVER (ORDER BY CASE status WHEN 'modified' THEN 0 WHEN 'added' THEN 1 ELSE 2 END, lower(stop_id), stop_id) - 1)::INTEGER AS ord,
        stop_id, status, coalesce(n_name, b_name, '') AS name,
        concat_ws(chr(31), ${normalizedSql('stop_id')}, ${normalizedSql('b_name')}, ${normalizedSql('n_name')}) AS search,
        coalesce(new_lon, base_lon) AS lon, CASE WHEN new_lon IS NOT NULL THEN new_lat ELSE base_lat END AS lat,
        base_lon, base_lat, new_lon, new_lat, moved_m,
        coalesce(changed, '') <> '' AND len(list_filter(string_split(changed, ','), x -> x NOT IN ('stop_lat', 'stop_lon'))) = 0 AS coord_only,
        changed, base_routes, new_routes
      FROM p ORDER BY ord`,
    params: [],
  };
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

/**
 * One changed stop: its stopsTableQuery row joined to its raw/stops.parquet
 * row (the base and new stops.txt rows, as b_<column> / n_<column>). Read
 * with toStopChange; no row when the stop didn't change.
 */
export function stopChangeQuery(
  stopsView: string,
  rawView: string,
  stopId: string,
): SqlQuery {
  // COLUMNS('^[bn]_') only matches the raw table's b_ / n_ columns.
  return {
    sql: `SELECT s.stop_id, s.status, s.name, s.changed, s.base_lon, s.base_lat, s.new_lon, s.new_lat, s.moved_m,
        to_json(s.base_routes)::VARCHAR AS base_routes, to_json(s.new_routes)::VARCHAR AS new_routes,
        COLUMNS('^[bn]_')
      FROM ${view(stopsView)} s LEFT JOIN ${view(rawView)} r ON r.trip_key = s.stop_id
      WHERE s.stop_id = ? LIMIT 1`,
    params: [stopId],
  };
}

/** Distance (m) from which a stop counts as moved (the build's MOVE_THRESHOLD_M). */
const MOVE_THRESHOLD_M = 1;

/**
 * A stopChangeQuery row as a StopChange; `columns` are the stops map's
 * stops.txt columns. Values a feed doesn't have read as ''. The field
 * changes are the raw table's changed columns (columns only one feed has
 * are column changes, not stop changes).
 */
export function toStopChange(
  r: Record<string, unknown>,
  columns: string[],
): StopChange {
  const status = str(r.status) as StopChange['status'];
  const side = (prefix: 'b' | 'n'): Record<string, string> =>
    Object.fromEntries(columns.map((c) => [c, str(r[`${prefix}_${c}`])]));
  const base = status === 'added' ? null : side('b');
  const next = status === 'deleted' ? null : side('n');
  const changed = new Set(str(r.changed).split(',').filter(Boolean));
  const movedM = numOrNull(r.moved_m);
  return {
    stop_id: str(r.stop_id),
    status,
    name: str(r.name),
    base,
    new: next,
    base_coord: pair(r.base_lon, r.base_lat),
    new_coord: pair(r.new_lon, r.new_lat),
    field_changes:
      base && next
        ? columns
            .filter((c) => changed.has(c))
            .map((c) => ({ field: c, base_value: base[c], new_value: next[c] }))
        : [],
    moved_m: movedM,
    moved: movedM != null && movedM >= MOVE_THRESHOLD_M,
    route_ids: { base: strList(r.base_routes), new: strList(r.new_routes) },
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

/** A list column read as JSON text (to_json), else []. */
function strList(v: unknown): string[] {
  if (typeof v !== 'string' || v === '') return [];
  const parsed: unknown = JSON.parse(v);
  return Array.isArray(parsed) ? parsed.map(String) : [];
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
  /** One agency's routes; null for every agency. */
  agencyId?: string | null;
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
  if (f.agencyId != null) {
    parts.push('agency_id = ?');
    params.push(f.agencyId);
  }
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

/**
 * The overview rows of the routes `from` (a routes table or routesV2From)
 * selects, in `orderBy` order: `columns`, the bounds and, as JSON text
 * (to_json; read by toRouteOverview):
 *   lines    each direction's main line: the new main shape's geom_new;
 *            for a removed route, or a direction without a new main shape,
 *            the base main shape's line (geom_base, else geom_new when
 *            equal), found by its base id (renamed_from of a renamed shape)
 *   added, removed   the directions' diverge_added / diverge_removed
 * Main shapes only (`main`: the shapes table's first row groups).
 */
function routeOverviewSql(
  from: string,
  shapesView: string,
  columns: string,
  whereSql: string,
  orderBy: string,
): string {
  return `WITH r AS (
      SELECT ${columns}, directions, min_lon, min_lat, max_lon, max_lat,
        row_number() OVER (ORDER BY ${orderBy}) AS _o
      FROM ${from} ${whereSql}
    ), s AS (
      SELECT shape_id, renamed_from, status, geom_base, geom_new
      FROM ${view(shapesView)} WHERE main
    ), d AS (
      SELECT _o, kind, unnest(directions) AS dir,
        generate_subscripts(directions, 1) AS i
      FROM r
    ), dl AS (
      SELECT d._o, d.i, coalesce(
          CASE WHEN d.kind <> 'removed' THEN sn.geom_new END,
          CASE WHEN sr.shape_id IS NOT NULL
            THEN coalesce(sr.geom_base, sr.geom_new)
            ELSE coalesce(sb.geom_base, sb.geom_new) END) AS line
      FROM d
      LEFT JOIN s sn ON sn.shape_id = d.dir.shape_new AND sn.status <> 'deleted'
      LEFT JOIN s sr ON sr.renamed_from = d.dir.shape_base
      LEFT JOIN s sb ON sb.shape_id = d.dir.shape_base
        AND sb.status NOT IN ('added', 'renamed')
    ), l AS (
      SELECT _o, list(line ORDER BY i) AS lines FROM dl
      WHERE line IS NOT NULL GROUP BY _o
    )
    SELECT r.* EXCLUDE (directions, _o),
      to_json(coalesce(l.lines, []::VARCHAR[]))::VARCHAR AS lines,
      to_json(flatten(list_transform(r.directions, x -> x.diverge_added)))::VARCHAR AS added,
      to_json(flatten(list_transform(r.directions, x -> x.diverge_removed)))::VARCHAR AS removed
    FROM r LEFT JOIN l ON l._o = r._o
    ORDER BY r._o`;
}

/**
 * Matching routes' overview lines, for the map: `v` the routes table,
 * `shapesView` the shapes table (lib/route-tables). Read with
 * toRouteOverview.
 */
export function routesOverviewQuery(
  v: string,
  shapesView: string,
  f: RouteTableFilters,
): SqlQuery {
  const w = routesWhere(f);
  return {
    sql: routeOverviewSql(view(v), shapesView, 'route_id, kind', w.sql, 'ord'),
    params: w.params,
  };
}

/** The routes table's columns routeDetailQuery reads (toRouteRow). */
const ROUTE_DETAIL_COLUMNS = [
  'route_id',
  'status',
  'agency_id',
  'short_name',
  'long_name',
  'route_type',
  'color',
  'text_color',
  'sort_order',
  ...ROUTE_FLAGS.map(flagColumn),
  'network_base',
  'network_new',
  'stops_base',
  'stops_new',
];

/**
 * One route's routes table row (lib/route-detail toRouteRow; `directions`
 * as JSON text), with its raw/routes.parquet row (b_<column> / n_<column>,
 * changed: lib/route-detail rawFieldChanges) when `rawView` is given (the
 * routes.txt raw table, absent when routes.txt didn't change).
 */
export function routeDetailQuery(
  v: string,
  routeId: string,
  rawView: string | null = null,
): SqlQuery {
  const cols = ROUTE_DETAIL_COLUMNS.map((c) => `d.${c}`).join(', ');
  const directions = 'to_json(d.directions)::VARCHAR AS directions';
  if (rawView == null)
    return {
      sql: `SELECT ${cols}, ${directions} FROM ${view(v)} d WHERE d.route_id = ? LIMIT 1`,
      params: [routeId],
    };
  // COLUMNS('^[bn]_') only matches the raw table's b_ / n_ columns.
  return {
    sql: `SELECT ${cols}, ${directions}, r.changed, COLUMNS('^[bn]_')
      FROM ${view(v)} d LEFT JOIN ${view(rawView)} r ON r.trip_key = d.route_id
      WHERE d.route_id = ? LIMIT 1`,
    params: [routeId],
  };
}

/** Route ids of a (route, direction) pairs list column. */
function pairRoutes(column: string): string {
  return `list_transform(${column}, x -> x.route_id)`;
}

const SHAPE_DETAIL_COLUMNS = `shape_id, main, status, renamed_from, deviation_m,
  points_base, points_new, unused_base, unused_new, geom_base, geom_new,
  ${[
    'diverge_added',
    'diverge_removed',
    'uses_base',
    'uses_new',
    'main_base',
    'main_new',
  ]
    .map((c) => `to_json(${c})::VARCHAR AS ${c}`)
    .join(', ')}`;

/**
 * The shapes table rows a route uses (uses_base / uses_new) or has as a
 * direction's main shape (main_base / main_new), in either feed (read with
 * lib/route-detail toShapeRow; list columns as JSON text). The rows are
 * found on the list columns first, so the lines are read for those only.
 */
export function routeShapesQuery(
  shapesView: string,
  routeId: string,
): SqlQuery {
  const v = view(shapesView);
  const has = ['uses_base', 'uses_new', 'main_base', 'main_new']
    .map((c) => `list_contains(${pairRoutes(c)}, ?)`)
    .join(' OR ');
  return {
    sql: `SELECT ${SHAPE_DETAIL_COLUMNS} FROM ${v}
      WHERE shape_id IN (SELECT shape_id FROM ${v} WHERE ${has})
      ORDER BY shape_id`,
    params: [routeId, routeId, routeId, routeId],
  };
}

/**
 * The stops table rows (analysis/stops.parquet) of the stops a route serves in
 * either feed (read with lib/route-detail toStopServedRow; served pairs as
 * JSON text).
 */
export function routeServedStopsQuery(
  stopsView: string,
  routeId: string,
): SqlQuery {
  return {
    sql: `SELECT stop_id, moved_m,
        to_json(served_base)::VARCHAR AS served_base,
        to_json(served_new)::VARCHAR AS served_new
      FROM ${view(stopsView)}
      WHERE list_contains(${pairRoutes('served_base')}, ?)
        OR list_contains(${pairRoutes('served_new')}, ?)
      ORDER BY stop_id`,
    params: [routeId, routeId],
  };
}

/**
 * Shapes no trip uses in either feed (in shapes.txt, unused): lib/route-detail
 * toUnusedShape. Their lines aren't read.
 */
export function unusedShapesQuery(shapesView: string): SqlQuery {
  return {
    sql: `SELECT shape_id, status, renamed_from, deviation_m, points_base,
        points_new, unused_base, unused_new
      FROM ${view(shapesView)}
      WHERE coalesce(len(uses_base), 0) = 0 AND coalesce(len(uses_new), 0) = 0
        AND (unused_base OR unused_new)
      ORDER BY shape_id`,
    params: [],
  };
}

/**
 * The route a shape belongs to (`shapeId` its new or base id, renamed or
 * not): the first one (routes table order) whose new trips use it or have it
 * as a main shape, else the first one that used it or had it as a main
 * shape in the base feed. Columns route_id, kind.
 */
export function routeOfShapeQuery(
  routesView: string,
  shapesView: string,
  shapeId: string,
): SqlQuery {
  const ids = (a: string, b: string): string =>
    `list_concat(${pairRoutes(`flatten(list(${a}))`)}, ${pairRoutes(`flatten(list(${b}))`)})`;
  return {
    sql: `WITH s AS (
        SELECT ${ids('uses_new', 'main_new')} AS n, ${ids('uses_base', 'main_base')} AS b
        FROM ${view(shapesView)} WHERE shape_id = ? OR renamed_from = ?
      )
      SELECT r.route_id, r.kind FROM ${view(routesView)} r, s
      WHERE list_contains(s.n, r.route_id) OR list_contains(s.b, r.route_id)
      ORDER BY list_contains(s.n, r.route_id) DESC, r.ord LIMIT 1`,
    params: [shapeId, shapeId],
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

/** Encoded polylines as JSON text (to_json), decoded; one-point lines dropped. */
function lines(v: unknown): LonLat[][] {
  const list: unknown =
    typeof v === 'string' && v !== '' ? JSON.parse(v) : null;
  return Array.isArray(list)
    ? list
        .filter((s): s is string => typeof s === 'string' && s !== '')
        .map((s) => decodePolyline(s) as LonLat[])
        .filter((l) => l.length > 1)
    : [];
}

/** A routesOverviewQuery / routesV2OverviewQuery row. */
export function toRouteOverview(r: Record<string, unknown>): RouteOverview {
  const min = pair(r.min_lon, r.min_lat);
  const max = pair(r.max_lon, r.max_lat);
  return {
    route_id: str(r.route_id),
    kind: str(r.kind) as RouteKind,
    lines: lines(r.lines),
    added: lines(r.added),
    removed: lines(r.removed),
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

// ── Routes v2 ──────────────────────────────────────────────────────

/**
 * Flags of the route itself, the ones Routes v2 reports. Trips and services
 * changes are the Trips and Service Dates pages' to show: a route whose only
 * changes are those counts as unchanged here.
 */
export type RouteV2Flag = Exclude<RouteFlag, 'trips' | 'services'>;

export const ROUTE_V2_FLAGS: RouteV2Flag[] = [
  'path',
  'stops',
  'attributes',
  'network',
];

/** A "What changed" chip: a flag of a modified route, or an added / removed route. */
export type RouteChange = RouteV2Flag | 'added' | 'removed';

export const ROUTE_CHANGES: RouteChange[] = [
  ...ROUTE_V2_FLAGS,
  'added',
  'removed',
];

/**
 * The routes table with `kind` as Routes v2 sees it: a modified route
 * without any ROUTE_V2_FLAGS is unchanged.
 */
function routesV2From(v: string): string {
  const routeChanged = ROUTE_V2_FLAGS.map(flagColumn).join(' OR ');
  return `(SELECT * REPLACE (CASE WHEN kind = 'modified' AND NOT (${routeChanged}) THEN 'unchanged' ELSE kind END AS kind) FROM ${view(v)})`;
}

export type RouteSort = 'severity' | 'sort_order' | 'name';

export interface RouteV2Filters {
  /** Routes with any of these changes; empty = no restriction. */
  changes: RouteChange[];
  /** Change types (added / removed / modified); empty = every changed route. */
  kinds: RouteKind[];
  showUnchanged: boolean;
  agencyId: string | null;
  search: string;
  /** Only these routes (a highlight preset); null = no restriction. */
  routeIds: string[] | null;
}

const CHANGED_KINDS: RouteKind[] = ['added', 'removed', 'modified'];

function changeClause(c: RouteChange): string {
  if (c === 'added' || c === 'removed') return `kind = '${c}'`;
  return `(kind = 'modified' AND ${flagColumn(c)})`;
}

export function routesV2Where(
  f: RouteV2Filters,
  { kinds = true, changes = true }: { kinds?: boolean; changes?: boolean } = {},
): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (kinds) {
    const k = f.kinds.length > 0 ? f.kinds : CHANGED_KINDS;
    inList('kind', f.showUnchanged ? [...k, 'unchanged'] : k, parts, params);
  }
  if (changes && f.changes.length > 0)
    parts.push(`(${f.changes.map(changeClause).join(' OR ')})`);
  if (f.agencyId != null) {
    parts.push('agency_id = ?');
    params.push(f.agencyId);
  }
  if (f.routeIds != null) inList('route_id', f.routeIds, parts, params);
  searchClause(f.search, parts, params);
  return { sql: where(parts), params };
}

/**
 * Severity: removed, added, then modified routes by their most serious
 * change (path, stops, attributes, network).
 */
const SEVERITY_SQL = `CASE WHEN kind = 'removed' THEN 0 WHEN kind = 'added' THEN 1
  WHEN kind = 'unchanged' THEN 6 WHEN f_path THEN 2 WHEN f_stops THEN 3
  WHEN f_attributes THEN 4 WHEN f_network THEN 5 ELSE 6 END`;

export function routesOrderBy(sort: RouteSort): string {
  if (sort === 'severity') return `${SEVERITY_SQL}, ord`;
  if (sort === 'sort_order') return 'sort_order ASC NULLS LAST, ord';
  return 'ord';
}

const ROUTE_V2_COLUMNS = `route_id, kind, short_name, long_name, color, text_color, ${ROUTE_FLAGS.map(flagColumn).join(', ')}`;

/** A route as the v2 list shows it. */
export interface RouteV2Row {
  route_id: string;
  kind: RouteKind;
  short_name: string;
  long_name: string;
  color: string;
  text_color: string;
  flags: Record<RouteFlag, boolean>;
}

export function routesV2PageQuery(
  v: string,
  f: RouteV2Filters,
  sort: RouteSort,
  offset: number,
  limit: number,
): SqlQuery {
  const w = routesV2Where(f);
  return {
    sql: `SELECT ${ROUTE_V2_COLUMNS} FROM ${routesV2From(v)} ${w.sql} ORDER BY ${routesOrderBy(sort)} ${page(offset, limit)}`,
    params: w.params,
  };
}

/**
 * Every matching route in list order, with its overview lines (the map,
 * prev / next): `v` the routes table, `shapesView` the shapes table
 * (lib/route-tables). Read with toRouteV2Overview.
 */
export function routesV2OverviewQuery(
  v: string,
  shapesView: string,
  f: RouteV2Filters,
  sort: RouteSort,
): SqlQuery {
  const w = routesV2Where(f);
  return {
    sql: routeOverviewSql(
      routesV2From(v),
      shapesView,
      ROUTE_V2_COLUMNS,
      w.sql,
      routesOrderBy(sort),
    ),
    params: w.params,
  };
}

/** Routes having each change, under the other filters. */
export function routesChangeCountsQuery(
  v: string,
  f: RouteV2Filters,
): SqlQuery {
  const w = routesV2Where(f, { changes: false });
  const counts = ROUTE_CHANGES.map(
    (c) => `count(*) FILTER (WHERE ${changeClause(c)})::INTEGER AS ${c}`,
  ).join(', ');
  return {
    sql: `SELECT ${counts} FROM ${routesV2From(v)} ${w.sql}`,
    params: w.params,
  };
}

/** Routes per kind under the other filters (every kind). */
export function routesV2KindCountsQuery(
  v: string,
  f: RouteV2Filters,
): SqlQuery {
  const w = routesV2Where(f, { kinds: false });
  return {
    sql: `SELECT kind, count(*)::INTEGER AS n FROM ${routesV2From(v)} ${w.sql} GROUP BY kind`,
    params: w.params,
  };
}

export function toRouteV2Row(r: Record<string, unknown>): RouteV2Row {
  return {
    route_id: str(r.route_id),
    kind: str(r.kind) as RouteKind,
    short_name: str(r.short_name),
    long_name: str(r.long_name),
    color: str(r.color),
    text_color: str(r.text_color),
    flags: Object.fromEntries(
      ROUTE_FLAGS.map((fl) => [fl, r[flagColumn(fl)] === true]),
    ) as Record<RouteFlag, boolean>,
  };
}

/** A route of the v2 overview: its list row and its lines. */
export type RouteV2Overview = RouteV2Row & RouteOverview;

export function toRouteV2Overview(r: Record<string, unknown>): RouteV2Overview {
  return { ...toRouteOverview(r), ...toRouteV2Row(r) };
}
