/**
 * Types for the entity-level GTFS diff (v2 POC).
 * Produced by scripts/generate-gtfs-entity-diff.mjs.
 */

import type { DiffType } from '../../GtfsDiffTool/lib/gtfs-types';
import type {
  FeedSource,
  FieldChange,
  FileDiff,
  UnsupportedFile,
} from '../../GtfsDiffTool/lib/gtfs-diff-types';
import type { EntityRow, Highlight } from './highlights';

export type { DiffType, FieldChange, FileDiff };

export type DiffCounts = Record<DiffType, number>;

/** GTFS date string, YYYYMMDD. */
export type GtfsDate = string;

// ── Generic entities ───────────────────────────────────────────────

export interface ChildChangeCounts {
  added: number;
  deleted: number;
  modified: number;
}

export interface EntityChange {
  key: string;
  status: Exclude<DiffType, 'unchanged'>;
  label?: string;
  /** Extra columns useful for linking, e.g. a trip's route_id/service_id. */
  context?: Record<string, string>;
  field_changes?: FieldChange[];
  /** Child row changes keyed by child file name (e.g. stop_times.txt). */
  children?: Record<string, ChildChangeCounts>;
}

export interface EntityTypeDiff {
  file: string;
  primary_key: string[];
  child_files: string[];
  present: { base: boolean; new: boolean };
  total: { base: number; new: number };
  counts: DiffCounts;
  /**
   * Entities counted as unchanged whose only differences are identifiers
   * (trips: a renumbered trip_id / block_id).
   */
  id_only?: number;
  /** Empty when the list is long: it is then in `changes_table`. */
  changes: EntityChange[];
  changes_table?: ChangesTable;
}

/** A long change list written to Parquet (entities/<file>.parquet). */
export interface ChangesTable {
  /** Path inside the diff, e.g. entities/trips.parquet */
  path: string;
  rows: number;
  bytes: number;
  /** Resolved against the diff's base URL when entity-diff.json loads. */
  url?: string;
}

// ── Raw row tables (Parquet, queried with DuckDB-WASM) ─────────────

/** Every row of either feed appears once, with one of these actions. */
export type RawAction =
  | 'added'
  | 'deleted'
  | 'modified'
  | 'id_only'
  | 'unchanged';

/** A full row-level diff written to <dataset>/raw/ by the generator. */
export interface RawTable {
  /** GTFS file, e.g. stop_times.txt */
  file: string;
  /** Path inside the dataset folder, e.g. raw/stop_times.parquet */
  path: string;
  rows: number;
  bytes: number;
  /** GTFS columns; the table holds b_<column> and n_<column> for each. */
  columns: string[];
  counts: Record<RawAction, number>;
}

// ── Service calendar ───────────────────────────────────────────────

export type ExceptionType = '1' | '2';

export interface CalendarRow {
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  start_date: GtfsDate;
  end_date: GtfsDate;
}

export interface ServiceSnapshot {
  calendar: CalendarRow | null;
  exceptions: Array<{ date: GtfsDate; exception_type: ExceptionType }>;
  active_day_count: number;
  first_date: GtfsDate | null;
  last_date: GtfsDate | null;
}

export interface ServiceDiff {
  service_id: string;
  status: DiffType;
  base: ServiceSnapshot | null;
  new: ServiceSnapshot | null;
  route_ids: { base: string[]; new: string[] };
  trip_counts: { base: number; new: number };
  calendar_field_changes: FieldChange[];
  exception_changes: {
    added: Array<{ date: GtfsDate; exception_type: ExceptionType }>;
    removed: Array<{ date: GtfsDate; exception_type: ExceptionType }>;
    modified: Array<{
      date: GtfsDate;
      base_exception_type: ExceptionType;
      new_exception_type: ExceptionType;
    }>;
  };
  dates_gained: GtfsDate[];
  dates_lost: GtfsDate[];
}

/** Exception record in effect on a given date, in each feed. */
export interface DayException {
  base: ExceptionType | null;
  new: ExceptionType | null;
}

export type DayReasonCode =
  | 'exception_added'
  | 'exception_removed'
  | 'exception_type_changed'
  | 'calendar_added'
  | 'calendar_removed'
  | 'period_extended'
  | 'period_shortened'
  | 'weekday_added'
  | 'weekday_removed';

export interface DayServiceEntry {
  service_id: string;
  exception: DayException | null;
}

export interface DayModifiedEntry extends DayServiceEntry {
  /** gained: now runs; lost: no longer runs; exception_only: record changed, activity did not. */
  change: 'gained' | 'lost' | 'exception_only';
  reason: { code: DayReasonCode; detail: string };
}

export interface DayChanges {
  added: DayServiceEntry[];
  removed: DayServiceEntry[];
  modified: DayModifiedEntry[];
}

export type HighlightSeverity = 'success' | 'info' | 'warning' | 'error';

export interface CalendarHighlight {
  id: string;
  kind: string;
  severity: HighlightSeverity;
  title: string;
  detail?: string;
  service_ids: string[];
  route_ids: string[];
  dates: GtfsDate[];
}

export interface RouteInfo {
  short_name: string;
  long_name: string;
  color: string;
  text_color: string;
  presence: 'base' | 'new' | 'both';
}

export interface DateRange {
  start: GtfsDate | null;
  end: GtfsDate | null;
}

export interface CalendarDiff {
  files: string[];
  present: { base: string[]; new: string[] };
  counts: DiffCounts;
  total: { base: number; new: number };
  coverage: { base: DateRange; new: DateRange };
  routes: Record<string, RouteInfo>;
  /** Routes any service is used by (the line filter's options). */
  route_ids: string[];
  /**
   * Services (one row each) and service-day changes (one row per service
   * changed on a date, dates with changes only), queried with DuckDB-WASM
   * (scripts/lib/calendar-tables.mjs).
   */
  tables: { services: MapTable; days: MapTable };
  /** [base, new] number of active services for every date in the union coverage. */
  active_counts: Record<GtfsDate, [number, number]>;
  highlights: CalendarHighlight[];
  /** Notable highlights of the overview (lib/calendar-overview-highlights), built with the full lists. */
  overview_highlights?: Array<Highlight<EntityRow[]>>;
}

// ── Stops map ──────────────────────────────────────────────────────

/** [lon, lat] */
export type LonLat = [number, number];

export interface StopChange {
  stop_id: string;
  status: Exclude<DiffType, 'unchanged'>;
  name: string;
  base: Record<string, string> | null;
  new: Record<string, string> | null;
  base_coord: LonLat | null;
  new_coord: LonLat | null;
  field_changes: FieldChange[];
  /** Distance between base and new position, metres (null if either is missing). */
  moved_m: number | null;
  /** moved_m >= move_threshold_m */
  moved: boolean;
  route_ids: { base: string[]; new: string[] };
}

/** [stop_id, lon, lat, stop_name] */
export type CompactStop = [string, number, number, string];

/** A map's entity list as Parquet (maps/<name>.parquet, scripts/lib/map-tables.mjs). */
export interface MapTable {
  path: string;
  rows: number;
  bytes: number;
  /** <name>_detail.parquet: key + `detail` JSON, read one entity at a time. */
  detail?: MapTable;
}

export interface StopsMapDiff {
  columns: string[];
  move_threshold_m: number;
  counts: DiffCounts & { moved: number };
  /** Changed stops, one row each: queried with DuckDB-WASM. */
  table: MapTable;
  /** Computed by the generator over every changed stop. */
  highlights: Array<Highlight<EntityRow[]>>;
  all_stops: { base: CompactStop[]; new: CompactStop[] };
  routes: Record<string, RouteInfo>;
}

/** What the generator builds the stops map from (before the list goes to Parquet). */
export type StopsMapSource = Omit<StopsMapDiff, 'table' | 'highlights'> & {
  stops: StopChange[];
};

// ── Routes map ─────────────────────────────────────────────────────

export type RouteFlag =
  | 'attributes'
  | 'stops'
  | 'path'
  | 'trips'
  | 'services'
  | 'network';

export interface PatternOp {
  op: 'keep' | 'add' | 'remove';
  stop_id: string;
}

export interface RouteDirectionDiff {
  direction_id: string;
  headsign: { base: string | null; new: string | null };
  trips: { base: number; new: number };
  pattern_count: { base: number; new: number };
  shape_id: { base: string | null; new: string | null };
  /** Main (most frequent) stop pattern, base vs new. */
  pattern_diff: PatternOp[];
  geometry: { base: LonLat[] | null; new: LonLat[] | null };
  /** Max distance (m) between the base and new path, null if one is missing. */
  path_change_m: number | null;
  /** Path sections only in the new (added) or base (removed) geometry. */
  diverge: { added: LonLat[][]; removed: LonLat[][] };
}

export interface RouteImpact {
  route_id: string;
  status: DiffType;
  short_name: string;
  long_name: string;
  route_type: string;
  color: string;
  text_color: string;
  base: Record<string, string> | null;
  new: Record<string, string> | null;
  field_changes: FieldChange[];
  flags: Record<RouteFlag, boolean>;
  networks: { base: string | null; new: string | null };
  trips: { base: number; new: number };
  services: { base: string[]; new: string[] };
  stops: {
    base_count: number;
    new_count: number;
    added: string[];
    removed: string[];
  };
  directions: RouteDirectionDiff[];
  /** Every shape used by this route's trips (absent in diffs built before shapes moved into routes). */
  shapes?: RouteShapeDiff[];
  shape_counts?: Record<ShapeStatus, number>;
}

/**
 * How a shape changed:
 *   rerouted  same id, path moved more than path_change_threshold_m
 *   redrawn   same id, moved between shape_same_m and the threshold
 *   points    same id, same geometry; points, precision or distances changed
 *   renamed   new id, same geometry as a removed shape of the route
 */
export type ShapeStatus =
  | 'rerouted'
  | 'redrawn'
  | 'points'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'unchanged';

export interface RouteShapeDiff {
  /** The new id, or the base id when removed. */
  shape_id: string;
  status: ShapeStatus;
  /** Base id of a renamed shape. */
  renamed_from?: string;
  /**
   * Same id: max distance between the two versions. Added / removed: how far
   * the shape strays from the route's shapes in the other feed (null: none).
   */
  deviation_m: number | null;
  points: { base: number; new: number };
  /** Trips of this route using the shape. */
  trips: { base: number; new: number };
  directions: string[];
  /** Other routes whose trips use the same shape. */
  other_routes: { base: string[]; new: string[] };
  /** In shapes.txt but used by no trip, per feed. */
  unused: { base: boolean; new: boolean };
  /** Unchanged / points-only shapes carry only their current line. */
  geometry: { base: LonLat[] | null; new: LonLat[] | null };
  diverge: { added: LonLat[][]; removed: LonLat[][] };
}

/** A shape no trip uses in either feed. */
export type UnusedShapeDiff = Pick<
  RouteShapeDiff,
  | 'shape_id'
  | 'status'
  | 'renamed_from'
  | 'deviation_m'
  | 'points'
  | 'unused'
  | 'geometry'
>;

/** A route's `detail` in maps/routes.parquet: the route and the stops it draws. */
export type RouteDetail = RouteImpact & {
  stop_info: Record<string, RouteStopInfo>;
};

/** What the generator builds the routes map from (before the list goes to Parquet). */
export type RoutesMapSource = Omit<
  RoutesMapDiff,
  'table' | 'highlights' | 'route_info'
> & {
  routes: RouteImpact[];
  stops: Record<string, RouteStopInfo>;
};

export interface RouteStopInfo {
  name: string;
  coord: LonLat;
  /** The stop's own change status in stops.txt. */
  status: DiffType;
  moved_m: number;
}

export interface RoutesMapDiff {
  columns: string[];
  path_change_threshold_m: number;
  counts: DiffCounts;
  /** Every route, one row each: queried with DuckDB-WASM. */
  table: MapTable;
  /** Computed by the generator over every route. */
  highlights: Array<Highlight<EntityRow[]>>;
  /** Names and colours of every route (chips). */
  route_info: Record<string, RouteInfo>;
  shape_same_m?: number;
  /** Shapes counted once each, across routes. */
  shape_counts?: Record<ShapeStatus, number>;
  unused_shapes?: UnusedShapeDiff[];
}

// ── Top-level document ─────────────────────────────────────────────

export interface EntityCategoryDiff {
  id: string;
  label: string;
  files: string[];
  counts: DiffCounts;
  entity_types?: EntityTypeDiff[];
  calendar?: CalendarDiff;
  /** Row-level diffs in the v1 FileDiff shape (only for some categories). */
  file_diffs?: FileDiff[];
  stops_map?: StopsMapDiff | null;
  routes_map?: RoutesMapDiff | null;
  /** Full row diffs as Parquet (trips: trips, stop_times, frequencies). */
  raw_tables?: RawTable[];
  /**
   * categories/<id>.json holding this category's calendar, stops_map,
   * routes_map and file_diffs (loaded with its tab; see useCategoryDetail).
   */
  detail?: string;
  /** How many base trips were paired with a new one (trips only). */
  trip_matching?: {
    mapped: number;
    renamed: number;
    base_trips: number;
    new_trips: number;
  };
}

export interface GtfsEntityDiff {
  metadata: {
    schema_version: string;
    generated_at: string;
    base_feed: FeedSource;
    new_feed: FeedSource;
    files: { base: string[]; new: string[] };
    unsupported_files: UnsupportedFile[];
  };
  categories: EntityCategoryDiff[];
}
