/**
 * The routes, shapes and stops analysis tables as typed Parquet columns:
 * no JSON-in-a-column. The single contract between the build
 * (scripts/lib/map-tables.mjs writes them from these column lists) and the
 * pages (DuckDB-WASM queries in lib/map-table-query.ts, assembled into a
 * RouteDetail by lib/useMapTable.ts).
 *
 * analysis/routes.parquet  one row per route, sorted by `ord`
 * analysis/shapes.parquet  one row per shape_id (both feeds, unused ones
 *                          too), main shapes first (`main` true), then by
 *                          shape_id, small row groups so the overview reads
 *                          main shapes only
 * analysis/stops.parquet   one row per stop that changed in stops.txt or
 *                          whose served (route, direction) pairs differ
 *                          between feeds, sorted by stop_id
 *
 * Their paths are lib/diff-layout's ROUTES_TABLE, SHAPES_TABLE, STOPS_TABLE.
 *
 * Lines are encoded polylines (lib/entity-diff-codec encodePolyline, 1e-5).
 * A route's GTFS rows and field changes come from raw/routes.parquet, its
 * stops' names and positions from raw/stops.parquet (lib/stop-info).
 *
 * Pure; type-only imports.
 */

/** DuckDB column name and type, in table order. */
export type ColumnSpec = readonly [name: string, type: string];

/** Row group size of analysis/shapes.parquet: the overview prunes to main shapes. */
export const SHAPES_ROW_GROUP_SIZE = 2048;

/** A (route, direction) pair: direction_id is '' when trips have none. */
export const ROUTE_DIR_TYPE = 'STRUCT(route_id VARCHAR, direction_id VARCHAR)';
/** A (route, direction) pair with the trips of it using a shape. */
export const SHAPE_USE_TYPE =
  'STRUCT(route_id VARCHAR, direction_id VARCHAR, trips INTEGER)';
/** One direction of a route, on its routes row. */
export const ROUTE_DIRECTION_TYPE =
  'STRUCT(direction_id VARCHAR, headsign_base VARCHAR, headsign_new VARCHAR, ' +
  'shape_base VARCHAR, shape_new VARCHAR, path_change_m DOUBLE, ' +
  'diverge_added VARCHAR[], diverge_removed VARCHAR[])';

const ROUTE_FLAG_COLUMNS: ColumnSpec[] = [
  'path',
  'stops',
  'trips',
  'services',
  'attributes',
  'network',
].map((f) => [`f_${f}`, 'BOOLEAN'] as const);

export const ROUTES_COLUMNS: ColumnSpec[] = [
  ['ord', 'INTEGER'],
  ['route_id', 'VARCHAR'],
  ['status', 'VARCHAR'], // added, deleted, modified, unchanged
  ['kind', 'VARCHAR'], // status with deleted as "removed"
  ['agency_id', 'VARCHAR'],
  ['short_name', 'VARCHAR'],
  ['long_name', 'VARCHAR'],
  ['route_type', 'VARCHAR'],
  ['color', 'VARCHAR'],
  ['text_color', 'VARCHAR'],
  ['sort_order', 'DOUBLE'], // routes.route_sort_order, null if not numeric
  ['search', 'VARCHAR'], // normalised id + names joined by U+001F
  ...ROUTE_FLAG_COLUMNS,
  ['summary', 'VARCHAR'],
  ['network_base', 'VARCHAR'],
  ['network_new', 'VARCHAR'],
  ['stops_base', 'INTEGER'], // stops served, all trips
  ['stops_new', 'INTEGER'],
  ['min_lon', 'DOUBLE'],
  ['min_lat', 'DOUBLE'],
  ['max_lon', 'DOUBLE'],
  ['max_lat', 'DOUBLE'],
  ['directions', `${ROUTE_DIRECTION_TYPE}[]`],
];

export const SHAPES_COLUMNS: ColumnSpec[] = [
  ['shape_id', 'VARCHAR'],
  ['main', 'BOOLEAN'], // the main shape of some route direction, in either feed
  ['status', 'VARCHAR'], // ShapeStatus
  ['renamed_from', 'VARCHAR'],
  ['deviation_m', 'DOUBLE'],
  ['points_base', 'INTEGER'],
  ['points_new', 'INTEGER'],
  ['unused_base', 'BOOLEAN'], // in shapes.txt, used by no trip
  ['unused_new', 'BOOLEAN'],
  // null when not in that feed; geom_base also null when equal to geom_new
  ['geom_base', 'VARCHAR'],
  ['geom_new', 'VARCHAR'],
  ['diverge_added', 'VARCHAR[]'],
  ['diverge_removed', 'VARCHAR[]'],
  ['uses_base', `${SHAPE_USE_TYPE}[]`],
  ['uses_new', `${SHAPE_USE_TYPE}[]`],
  ['main_base', `${ROUTE_DIR_TYPE}[]`], // where it is the direction's main shape
  ['main_new', `${ROUTE_DIR_TYPE}[]`],
];

export const STOPS_COLUMNS: ColumnSpec[] = [
  ['stop_id', 'VARCHAR'],
  ['moved_m', 'DOUBLE'], // null when either position is missing
  ['served_base', `${ROUTE_DIR_TYPE}[]`], // every trip, not only main patterns
  ['served_new', `${ROUTE_DIR_TYPE}[]`],
];

// ── Row types (as DuckDB returns them, after toJSON-like conversion) ──

export interface RouteDir {
  route_id: string;
  direction_id: string;
}

export interface ShapeUse extends RouteDir {
  trips: number;
}

export interface RouteDirectionRow {
  direction_id: string;
  headsign_base: string | null;
  headsign_new: string | null;
  /** Main shape of the direction in each feed. */
  shape_base: string | null;
  shape_new: string | null;
  path_change_m: number | null;
  /** Encoded polylines where the direction's main line diverges. */
  diverge_added: string[];
  diverge_removed: string[];
}

export interface ShapeRow {
  shape_id: string;
  main: boolean;
  status: string;
  renamed_from: string | null;
  deviation_m: number | null;
  points_base: number;
  points_new: number;
  unused_base: boolean;
  unused_new: boolean;
  geom_base: string | null;
  geom_new: string | null;
  diverge_added: string[];
  diverge_removed: string[];
  uses_base: ShapeUse[];
  uses_new: ShapeUse[];
  main_base: RouteDir[];
  main_new: RouteDir[];
}

export interface StopServedRow {
  stop_id: string;
  moved_m: number | null;
  served_base: RouteDir[];
  served_new: RouteDir[];
}

/** A direction's stops as the route detail lists them. */
export interface DirectionStops {
  added: string[];
  removed: string[];
  /** Served in both feeds and moved at least STOP_MOVED_M. */
  moved: string[];
}

/** The generator's move threshold (scripts/generate-gtfs-entity-diff.mjs). */
export const STOP_MOVED_M = 1;

/**
 * A direction's added / removed / moved stops from the stops table rows of
 * one route (pairs compared on route_id and direction_id).
 */
export function directionStops(
  rows: StopServedRow[],
  routeId: string,
  directionId: string,
): DirectionStops {
  const has = (pairs: RouteDir[]): boolean =>
    pairs.some((p) => p.route_id === routeId && p.direction_id === directionId);
  const out: DirectionStops = { added: [], removed: [], moved: [] };
  for (const r of rows) {
    const b = has(r.served_base);
    const n = has(r.served_new);
    if (n && !b) out.added.push(r.stop_id);
    else if (b && !n) out.removed.push(r.stop_id);
    else if (b && n && (r.moved_m ?? 0) >= STOP_MOVED_M)
      out.moved.push(r.stop_id);
  }
  const byId = (a: string, z: string): number =>
    a.localeCompare(z, undefined, { numeric: true });
  out.added.sort(byId);
  out.removed.sort(byId);
  out.moved.sort(byId);
  return out;
}
