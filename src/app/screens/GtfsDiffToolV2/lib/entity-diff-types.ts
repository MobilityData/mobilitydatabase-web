/**
 * Types for the entity-level GTFS diff (v2 POC).
 * Produced by scripts/generate-gtfs-entity-diff.mjs as report.json's file
 * entries and analyses (lib/report.ts ReportDoc; files.json, FilesDoc, in
 * older builds) and the analyses' JSON; the viewer groups files into pages
 * itself (lib/sections.ts, EntityCategoryDiff).
 */

import type { DiffType } from '../../GtfsDiffTool/lib/gtfs-types';
import type {
  FeedSource,
  FieldChange,
  FileDiff,
} from '../../GtfsDiffTool/lib/gtfs-diff-types';
import type { EntityRow, Highlight } from './highlights';
import type { DirectionStops } from './route-tables';
import type { AnalysisName as LayoutAnalysisName } from './diff-layout';

export type { DiffType, FieldChange, FileDiff };

export type DiffCounts = Record<DiffType, number>;

/** GTFS date string, YYYYMMDD. */
export type GtfsDate = string;

// ── Generic entities ───────────────────────────────────────────────

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
}

// ── Raw row tables (Parquet, queried with DuckDB-WASM) ─────────────

/** A raw table row's action (unchanged rows are stored for the trip files only). */
export type RawAction =
  | 'added'
  | 'deleted'
  | 'modified'
  | 'id_only'
  | 'unchanged';

/**
 * A full row-level diff written to <dataset>/raw/ by the generator: one per
 * GTFS file that changed.
 */
export interface RawTable {
  /** GTFS file, e.g. stop_times.txt */
  file: string;
  /** Path inside the dataset folder, e.g. raw/stop_times.parquet */
  path: string;
  /** Rows stored in the table. */
  rows: number;
  bytes: number;
  /** GTFS columns; the table holds b_<column> and n_<column> for each. */
  columns: string[];
  /** Rows of either feed per action, stored or not. */
  counts: Record<RawAction, number>;
  /**
   * Set when unchanged rows are counted but not stored: every file but the
   * trip files (trips.txt, stop_times.txt, frequencies.txt).
   */
  unchanged_omitted?: boolean;
  /**
   * GTFS column whose value the table's trip_key holds: stop_id for
   * stops.txt, service_id for calendar_dates.txt. Absent: trip_id (shape_id
   * for shapes.txt).
   */
  key_column?: string;
  /**
   * Primary key of a keyed file (stops.txt, stop_areas.txt, …); key_column
   * is its first column. Empty for feed_info.txt. Absent: a trip file or
   * shapes.txt.
   */
  key_columns?: string[];
  /** Columns only the new feed has. */
  columns_added?: string[];
  /** Columns only the base feed has. */
  columns_deleted?: string[];
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
  /** Every route's name and colours: the route lookup (lib/route-info), attached when the category loads (useCategoryDetail). */
  routes: Record<string, RouteInfo>;
  /** The routes table (raw/routes.parquet); absent when there is none. */
  route_info_file?: string;
  /**
   * The analysis: services (one row each) and service-day changes (one row
   * per service changed on a date), queried with DuckDB-WASM
   * (scripts/lib/calendar-tables.mjs, lib/calendar-query).
   */
  tables: { services: MapTable; days: MapTable };
  /**
   * The services' rows: the calendar.txt and calendar_dates.txt raw tables
   * (raw/calendar.parquet, raw/calendar_dates.parquet), null when neither
   * feed has the file. Absent in older builds, whose tables held the rows.
   */
  calendar_rows_file?: string | null;
  calendar_dates_rows_file?: string | null;
  /** [base, new] number of active services for every date in the union coverage. */
  active_counts: Record<GtfsDate, [number, number]>;
  /** highlights/services.json: the services' highlights with full entity lists. */
  highlights_file?: string;
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
  /** moved_m at or over the generator's move threshold. */
  moved: boolean;
  route_ids: { base: string[]; new: string[] };
}

/** An analysis's entity list as Parquet (analysis/<name>.parquet, scripts/lib/map-tables.mjs). */
export interface MapTable {
  path: string;
  rows: number;
  bytes: number;
}

export interface StopsMapDiff {
  columns: string[];
  counts: DiffCounts & { moved: number };
  /** Changed stops, one row each: queried with DuckDB-WASM. */
  table: MapTable;
  /** Older builds only: the highlights inline (now in `highlights_file` only). */
  highlights?: Array<Highlight<EntityRow[]>>;
  /** highlights/stops.json: the highlights with full entity lists; absent in older builds. */
  highlights_file?: string;
  /** The routes.txt raw table (raw/routes.parquet; maps/route_info.json in older builds): names and colours of every route (chips), shared with the routes map. */
  route_info_file?: string;
}

/** What the generator builds the stops map from (before the list goes to Parquet). */
export type StopsMapSource = Omit<
  StopsMapDiff,
  'table' | 'highlights' | 'highlights_file' | 'route_info_file'
> & {
  stops: StopChange[];
  routes: Record<string, RouteInfo>;
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

export type TypicalDay = 'weekday' | 'saturday' | 'sunday';

export interface RouteImpact {
  route_id: string;
  status: DiffType;
  /** routes.agency_id (or the feed's only agency); absent in older builds. */
  agency_id?: string;
  short_name: string;
  long_name: string;
  route_type: string;
  color: string;
  text_color: string;
  /**
   * The routes.txt rows: the build's, not stored in the route detail
   * (raw/routes.parquet holds them, field_changes are read from it).
   */
  base?: Record<string, string> | null;
  new?: Record<string, string> | null;
  field_changes: FieldChange[];
  flags: Record<RouteFlag, boolean>;
  networks: { base: string | null; new: string | null };
  trips: { base: number; new: number };
  /**
   * Trips on a typical weekday, Saturday and Sunday: the most common count
   * over the dates of that day type in each feed's service window (absent
   * in older builds).
   */
  typical_trips?: Record<TypicalDay, { base: number; new: number }>;
  /** routes.route_sort_order (new, else base), when numeric. */
  sort_order?: number | null;
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

/**
 * A route as the pages show it, assembled from the typed tables when it is
 * opened (lib/useMapTable loadRouteDetail; lib/route-tables): its routes
 * row, its shapes (analysis/shapes.parquet), its stops (analysis/stops.parquet),
 * its routes.txt rows (raw/routes.parquet) and its stops' names and
 * positions (raw/stops.parquet). Fields the tables no longer hold are
 * empty: `services`, `trips` (0), `typical_trips` (absent) and each
 * direction's `trips`, `pattern_count` (0) and `pattern_diff` ([]).
 */
export type RouteDetail = RouteImpact & {
  /** The stops `direction_stops` names, and the route's added / removed ones. */
  stop_info: Record<string, RouteStopInfo>;
  /** direction_id -> its added, removed and moved stops. */
  direction_stops: Record<string, DirectionStops>;
};

/** What the generator builds the routes map from (before the list goes to Parquet). */
export type RoutesMapSource = Omit<
  RoutesMapDiff,
  | 'table'
  | 'shapes_table'
  | 'highlights'
  | 'highlights_file'
  | 'route_info_file'
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
  /** Every route, one row each (analysis/routes.parquet, lib/route-tables ROUTES_COLUMNS). */
  table: MapTable;
  /** Every shape of either feed, one row each (analysis/shapes.parquet, SHAPES_COLUMNS). */
  shapes_table: MapTable;
  /** Older builds only: the highlights inline (now in `highlights_file` only). */
  highlights?: Array<Highlight<EntityRow[]>>;
  /** highlights/routes.json: the highlights with full entity lists; absent in older builds. */
  highlights_file?: string;
  /** The routes.txt raw table (raw/routes.parquet; maps/route_info.json in older builds): names and colours of every route (chips), shared with the other pages. */
  route_info_file?: string;
  /** The stops.txt raw table: a route's stops are looked up in it by stop_id (lib/stop-info); absent in older builds (`stop_info` in the detail). */
  stop_info_file?: string;
  /** The stops analysis table (analysis/stops.parquet): moves and served (route, direction) pairs. */
  stop_moves_file?: string;
  /**
   * Prototype: the overview's lines as PMTiles, layer `routes`, properties
   * route_id, kind and part (l line, a added, r removed). When set, the
   * routes map can draw from it instead.
   */
  overview_tiles?: string;
  /** Agencies of both feeds, by name (the agency filter); absent in older builds. */
  agencies?: Array<{ agency_id: string; name: string }>;
  shape_same_m?: number;
  /** First and last active date of each feed (typical_trips' window). */
  service_window?: {
    base: { start: GtfsDate; end: GtfsDate } | null;
    new: { start: GtfsDate; end: GtfsDate } | null;
  };
  /** Older builds only: now the shapes table's rows with no uses. */
  unused_shapes?: UnusedShapeDiff[];
}

// ── GTFS files (report.json's `files`; files.json in older builds) ──

/**
 * Analyses with their own JSON next to their tables, that a page loads
 * (lib/diff-layout ANALYSIS_FILES; pathways has its own page and loader).
 */
export type AnalysisName = Exclude<LayoutAnalysisName, 'pathways'>;

/** How many base trips were paired with a new one. */
export interface TripMatching {
  mapped: number;
  renamed: number;
  base_trips: number;
  new_trips: number;
}

/** One GTFS file either feed has. */
export interface DiffFileEntry {
  file: string;
  present: { base: boolean; new: boolean };
  /** Entities per feed, and changes by the file's key (keyed and grouped files). */
  total?: { base: number; new: number };
  primary_key?: string[];
  counts?: DiffCounts;
  /** Unchanged entities whose only differences are identifiers (trips.txt). */
  id_only?: number;
  /** Parent file whose entities this file's rows belong to (stop_times.txt: trips.txt). */
  part_of?: string;
  /** The file's raw row diff, when it changed. */
  raw_table?: RawTable;
  /** trips.txt only. */
  trip_matching?: TripMatching;
}

/**
 * Every GTFS file of the diff and the analyses' files: files.json in older
 * builds, and what the pages read from report.json (filesDocFromReport).
 */
export interface FilesDoc {
  schema: 1;
  metadata: GtfsEntityDiff['metadata'];
  files: DiffFileEntry[];
  /** Each analysis's JSON: analysis/stops.json, analysis/routes.json, analysis/services.json. */
  analyses: Partial<Record<AnalysisName, string>>;
}

// ── The viewer's pages (built from the file entries by lib/sections.ts) ──

export interface EntityCategoryDiff {
  id: string;
  label: string;
  files: string[];
  counts: DiffCounts;
  entity_types?: EntityTypeDiff[];
  calendar?: CalendarDiff;
  stops_map?: StopsMapDiff | null;
  routes_map?: RoutesMapDiff | null;
  /**
   * Full row diffs as Parquet (raw/<file>.parquet), one per file of the
   * category that changed.
   */
  raw_tables?: RawTable[];
  /**
   * The page's analysis JSON (analysis/stops.json…), loaded with its page
   * (useCategoryDetail) into the `detail_key` field.
   */
  detail?: string;
  detail_key?: 'stops_map' | 'routes_map' | 'calendar';
  trip_matching?: TripMatching;
}

export interface GtfsEntityDiff {
  metadata: {
    schema_version: string;
    generated_at: string;
    base_feed: FeedSource;
    new_feed: FeedSource;
    files: { base: string[]; new: string[] };
  };
  categories: EntityCategoryDiff[];
}
