/**
 * A route's RouteDetail assembled from the typed tables (lib/route-tables):
 * its analysis/routes.parquet row, the analysis/shapes.parquet rows it uses or has
 * as a direction's main shape, the analysis/stops.parquet rows it serves, its
 * routes.txt field changes (raw/routes.parquet) and its stops' names and
 * positions (raw/stops.parquet, lib/stop-info). The queries are in
 * lib/map-table-query.ts, the loading in lib/useMapTable.ts.
 *
 * Pure, so it is unit-tested.
 */

import { decodePolyline } from './entity-diff-codec';
import type {
  DiffType,
  FieldChange,
  LonLat,
  RouteDetail,
  RouteDirectionDiff,
  RouteFlag,
  RouteShapeDiff,
  RouteStopInfo,
  ShapeStatus,
  UnusedShapeDiff,
} from './entity-diff-types';
import {
  type DirectionStops,
  type RouteDir,
  type RouteDirectionRow,
  type ShapeRow,
  type ShapeUse,
  type StopServedRow,
  directionStops,
} from './route-tables';
import { ROUTE_FLAGS } from './routes-utils';

/** A analysis/routes.parquet row as routeDetailQuery reads it. */
export interface RouteRow {
  route_id: string;
  status: DiffType;
  agency_id: string;
  short_name: string;
  long_name: string;
  route_type: string;
  color: string;
  text_color: string;
  sort_order: number | null;
  flags: Record<RouteFlag, boolean>;
  network_base: string | null;
  network_new: string | null;
  stops_base: number;
  stops_new: number;
  directions: RouteDirectionRow[];
}

// ── Reading query rows ─────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

function strOrNull(v: unknown): string | null {
  return v == null ? null : str(v);
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A list column read as JSON text (to_json); [] when NULL. */
function jsonList<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v !== 'string' || v === '') return [];
  const parsed: unknown = JSON.parse(v);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

function strings(v: unknown): string[] {
  return jsonList<unknown>(v).map(str);
}

function routeDirs(v: unknown): RouteDir[] {
  return jsonList<Record<string, unknown>>(v).map((p) => ({
    route_id: str(p.route_id),
    direction_id: str(p.direction_id),
  }));
}

function shapeUses(v: unknown): ShapeUse[] {
  return jsonList<Record<string, unknown>>(v).map((p) => ({
    route_id: str(p.route_id),
    direction_id: str(p.direction_id),
    trips: Number(p.trips ?? 0),
  }));
}

export function toRouteRow(r: Record<string, unknown>): RouteRow {
  return {
    route_id: str(r.route_id),
    status: str(r.status) as DiffType,
    agency_id: str(r.agency_id),
    short_name: str(r.short_name),
    long_name: str(r.long_name),
    route_type: str(r.route_type),
    color: str(r.color),
    text_color: str(r.text_color),
    sort_order: numOrNull(r.sort_order),
    flags: Object.fromEntries(
      ROUTE_FLAGS.map((f) => [f, r[`f_${f}`] === true]),
    ) as Record<RouteFlag, boolean>,
    network_base: strOrNull(r.network_base),
    network_new: strOrNull(r.network_new),
    stops_base: Number(r.stops_base ?? 0),
    stops_new: Number(r.stops_new ?? 0),
    directions: jsonList<Record<string, unknown>>(r.directions).map((d) => ({
      direction_id: str(d.direction_id),
      headsign_base: strOrNull(d.headsign_base),
      headsign_new: strOrNull(d.headsign_new),
      shape_base: strOrNull(d.shape_base),
      shape_new: strOrNull(d.shape_new),
      path_change_m: numOrNull(d.path_change_m),
      diverge_added: strings(d.diverge_added),
      diverge_removed: strings(d.diverge_removed),
    })),
  };
}

export function toShapeRow(r: Record<string, unknown>): ShapeRow {
  return {
    shape_id: str(r.shape_id),
    main: r.main === true,
    status: str(r.status),
    renamed_from: strOrNull(r.renamed_from),
    deviation_m: numOrNull(r.deviation_m),
    points_base: Number(r.points_base ?? 0),
    points_new: Number(r.points_new ?? 0),
    unused_base: r.unused_base === true,
    unused_new: r.unused_new === true,
    geom_base: strOrNull(r.geom_base),
    geom_new: strOrNull(r.geom_new),
    diverge_added: strings(r.diverge_added),
    diverge_removed: strings(r.diverge_removed),
    uses_base: shapeUses(r.uses_base),
    uses_new: shapeUses(r.uses_new),
    main_base: routeDirs(r.main_base),
    main_new: routeDirs(r.main_new),
  };
}

export function toStopServedRow(r: Record<string, unknown>): StopServedRow {
  return {
    stop_id: str(r.stop_id),
    moved_m: numOrNull(r.moved_m),
    served_base: routeDirs(r.served_base),
    served_new: routeDirs(r.served_new),
  };
}

/** An unusedShapesQuery row; its lines are not read (the list draws none). */
export function toUnusedShape(r: Record<string, unknown>): UnusedShapeDiff {
  const renamed = strOrNull(r.renamed_from);
  return {
    shape_id: str(r.shape_id),
    status: str(r.status) as ShapeStatus,
    ...(renamed != null ? { renamed_from: renamed } : {}),
    deviation_m: numOrNull(r.deviation_m),
    points: {
      base: Number(r.points_base ?? 0),
      new: Number(r.points_new ?? 0),
    },
    unused: { base: r.unused_base === true, new: r.unused_new === true },
    geometry: { base: null, new: null },
  };
}

/**
 * A raw table row's changed columns with their base and new values; none
 * when the row is missing (NULL columns) or not modified.
 */
export function rawFieldChanges(row: Record<string, unknown>): FieldChange[] {
  return str(row.changed)
    .split(',')
    .filter(Boolean)
    .map((field) => ({
      field,
      base_value: str(row[`b_${field}`]),
      new_value: str(row[`n_${field}`]),
    }));
}

// ── Assembly ───────────────────────────────────────────────────────

function line(encoded: string | null): LonLat[] | null {
  return encoded == null || encoded === ''
    ? null
    : (decodePolyline(encoded) as LonLat[]);
}

function lines(encoded: string[]): LonLat[][] {
  return encoded.map((s) => decodePolyline(s) as LonLat[]);
}

/** The order the build lists a route's shapes in (then by shape_id). */
const SHAPE_ORDER: ShapeStatus[] = [
  'rerouted',
  'redrawn',
  'points',
  'added',
  'deleted',
  'renamed',
  'unchanged',
];

/** Statuses whose two versions are drawn; the others draw their current line. */
const BOTH_LINES: ShapeStatus[] = ['rerouted', 'redrawn', 'added', 'deleted'];

const byId = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true });

function sorted(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort(byId);
}

/** The shape's line in the base feed (geom_base is null when equal to geom_new). */
function baseLine(sh: ShapeRow): LonLat[] | null {
  return line(sh.geom_base ?? sh.geom_new);
}

/** Shape rows by the id each feed knows them by. */
function shapeLookup(shapes: ShapeRow[]): {
  base: (id: string | null) => ShapeRow | undefined;
  next: (id: string | null) => ShapeRow | undefined;
} {
  const renamed = new Map<string, ShapeRow>();
  const inBase = new Map<string, ShapeRow>();
  const inNew = new Map<string, ShapeRow>();
  for (const sh of shapes) {
    if (sh.renamed_from != null) renamed.set(sh.renamed_from, sh);
    if (sh.status !== 'added' && sh.status !== 'renamed')
      inBase.set(sh.shape_id, sh);
    if (sh.status !== 'deleted') inNew.set(sh.shape_id, sh);
  }
  return {
    base: (id) =>
      id == null ? undefined : (renamed.get(id) ?? inBase.get(id)),
    next: (id) => (id == null ? undefined : inNew.get(id)),
  };
}

function shapeDiff(sh: ShapeRow, routeId: string): RouteShapeDiff {
  const status = sh.status as ShapeStatus;
  const mine = (u: RouteDir): boolean => u.route_id === routeId;
  const trips = (uses: ShapeUse[]): number =>
    uses.filter(mine).reduce((n, u) => n + u.trips, 0);
  const others = (uses: ShapeUse[]): string[] =>
    sorted(uses.filter((u) => !mine(u)).map((u) => u.route_id));
  const geometry = BOTH_LINES.includes(status)
    ? {
        base: status === 'added' ? null : baseLine(sh),
        new: line(sh.geom_new),
      }
    : { base: null, new: line(sh.geom_new) ?? baseLine(sh) };
  return {
    shape_id: sh.shape_id,
    status,
    ...(sh.renamed_from != null ? { renamed_from: sh.renamed_from } : {}),
    deviation_m: sh.deviation_m,
    points: { base: sh.points_base, new: sh.points_new },
    trips: { base: trips(sh.uses_base), new: trips(sh.uses_new) },
    directions: sorted(
      [...sh.uses_base, ...sh.uses_new].filter(mine).map((u) => u.direction_id),
    ),
    other_routes: { base: others(sh.uses_base), new: others(sh.uses_new) },
    unused: { base: sh.unused_base, new: sh.unused_new },
    geometry,
    diverge: {
      added: lines(sh.diverge_added),
      removed: lines(sh.diverge_removed),
    },
  };
}

/** Whether a shape row belongs to the route: used by it, or a main shape of it. */
export function shapeOfRoute(sh: ShapeRow, routeId: string): boolean {
  return [sh.uses_base, sh.uses_new, sh.main_base, sh.main_new].some((l) =>
    l.some((u) => u.route_id === routeId),
  );
}

export interface RouteDetailParts {
  route: RouteRow;
  /** Shapes table rows; the ones not of this route are ignored. */
  shapes: ShapeRow[];
  /** Stops table rows; the ones this route doesn't serve are ignored. */
  stops: StopServedRow[];
  /** The routes.txt field changes (rawFieldChanges). */
  fieldChanges: FieldChange[];
  /** Stop names and positions by stop_id (at least the route's stops). */
  stopInfo: Record<string, RouteStopInfo>;
}

/**
 * The RouteDetail of a route's table rows. Fields the tables don't hold
 * are empty (entity-diff-types RouteDetail): services, trips, typical
 * trips and each direction's trips, pattern counts and pattern diff.
 */
export function assembleRouteDetail({
  route,
  shapes,
  stops,
  fieldChanges,
  stopInfo,
}: RouteDetailParts): RouteDetail {
  const id = route.route_id;
  const own = shapes.filter((sh) => shapeOfRoute(sh, id));
  const find = shapeLookup(own);

  const directions: RouteDirectionDiff[] = route.directions.map((d) => {
    const b = find.base(d.shape_base);
    const n = find.next(d.shape_new);
    return {
      direction_id: d.direction_id,
      headsign: { base: d.headsign_base, new: d.headsign_new },
      trips: { base: 0, new: 0 },
      pattern_count: { base: 0, new: 0 },
      shape_id: { base: d.shape_base, new: d.shape_new },
      pattern_diff: [],
      geometry: {
        base: b ? baseLine(b) : null,
        new: n ? line(n.geom_new) : null,
      },
      path_change_m: d.path_change_m,
      diverge: {
        added: lines(d.diverge_added),
        removed: lines(d.diverge_removed),
      },
    };
  });

  const serves = (pairs: RouteDir[]): boolean =>
    pairs.some((p) => p.route_id === id);
  const routeStops = stops.filter(
    (s) => serves(s.served_base) || serves(s.served_new),
  );
  const direction_stops: Record<string, DirectionStops> = {};
  for (const d of route.directions)
    direction_stops[d.direction_id] = directionStops(
      routeStops,
      id,
      d.direction_id,
    );
  const perDirection = Object.values(direction_stops);
  // The route's own: served by it (any direction) in one feed only. Not the
  // union of the directions' lists: a stop moved to another direction (or
  // direction_ids swapped between feeds) is still served by the route.
  const added = sorted(
    routeStops
      .filter((s) => serves(s.served_new) && !serves(s.served_base))
      .map((s) => s.stop_id),
  );
  const removed = sorted(
    routeStops
      .filter((s) => serves(s.served_base) && !serves(s.served_new))
      .map((s) => s.stop_id),
  );

  const stop_info: Record<string, RouteStopInfo> = {};
  for (const s of [
    ...added,
    ...removed,
    ...perDirection.flatMap((d) => [...d.added, ...d.removed, ...d.moved]),
  ])
    if (stopInfo[s] != null) stop_info[s] = stopInfo[s];

  const order = (s: string): number => {
    const i = SHAPE_ORDER.indexOf(s as ShapeStatus);
    return i === -1 ? SHAPE_ORDER.length : i;
  };
  const shapeDiffs = [...own]
    .sort(
      (x, y) =>
        order(x.status) - order(y.status) || byId(x.shape_id, y.shape_id),
    )
    .map((sh) => shapeDiff(sh, id));

  return {
    route_id: id,
    status: route.status,
    agency_id: route.agency_id,
    short_name: route.short_name,
    long_name: route.long_name,
    route_type: route.route_type,
    color: route.color,
    text_color: route.text_color,
    field_changes: fieldChanges,
    flags: route.flags,
    networks: { base: route.network_base, new: route.network_new },
    trips: { base: 0, new: 0 },
    sort_order: route.sort_order,
    services: { base: [], new: [] },
    stops: {
      base_count: route.stops_base,
      new_count: route.stops_new,
      added,
      removed,
    },
    directions,
    shapes: shapeDiffs,
    stop_info,
    direction_stops,
  };
}
