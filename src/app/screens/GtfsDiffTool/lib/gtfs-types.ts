/**
 * Core types for the GTFS Semantic Diff Tool.
 */

// ── Raw CSV row types ──────────────────────────────────────────────

export interface GtfsRawRow {
  [column: string]: string;
}

export type GtfsFileData = Map<string, GtfsRawRow[]>; // filename → rows

// ── GTFS parsed row types ──────────────────────────────────────────

export interface RawRoute {
  route_id: string;
  agency_id?: string;
  route_short_name?: string;
  route_long_name?: string;
  route_type?: string;
  route_color?: string;
  route_text_color?: string;
  route_url?: string;
  route_desc?: string;
  [key: string]: string | undefined;
}

export interface RawTrip {
  route_id: string;
  service_id: string;
  trip_id: string;
  trip_headsign?: string;
  trip_short_name?: string;
  direction_id?: string;
  block_id?: string;
  shape_id?: string;
  wheelchair_accessible?: string;
  bikes_allowed?: string;
  [key: string]: string | undefined;
}

export interface RawStopTime {
  trip_id: string;
  arrival_time?: string;
  departure_time?: string;
  stop_id: string;
  stop_sequence: string;
  stop_headsign?: string;
  pickup_type?: string;
  drop_off_type?: string;
  timepoint?: string;
  [key: string]: string | undefined;
}

export interface RawCalendar {
  service_id: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  start_date: string;
  end_date: string;
  [key: string]: string | undefined;
}

export interface RawCalendarDate {
  service_id: string;
  date: string;
  exception_type: string;
  [key: string]: string | undefined;
}

export interface RawStop {
  stop_id: string;
  stop_name?: string;
  stop_lat?: string;
  stop_lon?: string;
  wheelchair_boarding?: string;
  parent_station?: string;
  stop_code?: string;
  stop_desc?: string;
  zone_id?: string;
  stop_url?: string;
  location_type?: string;
  stop_timezone?: string;
  [key: string]: string | undefined;
}

export interface RawShape {
  shape_id: string;
  shape_pt_lat: string;
  shape_pt_lon: string;
  shape_pt_sequence: string;
  shape_dist_traveled?: string;
  [key: string]: string | undefined;
}

// ── Materialized entity types ──────────────────────────────────────

export interface MaterializedRoute {
  route_id: string;
  agency_id?: string;
  route_short_name?: string;
  route_long_name?: string;
  route_type?: string;
  route_color?: string;
  route_text_color?: string;
  tripCount: number;
  stopUniverse: string[]; // sorted unique stop_ids
  totalOperativeTripDays: number;
  averageHeadway: number | null; // in minutes, null if < 2 trips
  shapeIds: string[]; // sorted
  serviceIds: string[]; // sorted
  perDirectionTrips: Record<string, string[]>; // direction_id → trip_ids
}

export interface MaterializedServicePeriod {
  service_id: string;
  operativeDates: string[]; // sorted YYYYMMDD strings
  operativeDayCount: number;
  dateRangeString: string; // "YYYYMMDD – YYYYMMDD"
  tripIds: string[]; // sorted
  routeIds: string[]; // sorted unique
}

export interface MaterializedStop {
  stop_id: string;
  stop_name?: string;
  stop_lat?: string;
  stop_lon?: string;
  wheelchair_boarding?: string;
  parent_station?: string;
  routeIds: string[]; // sorted unique routes serving this stop
  tripIds: string[]; // sorted unique trips serving this stop
}

export interface MaterializedTrip {
  trip_id: string;
  route_id: string;
  service_id: string;
  direction_id?: string;
  shape_id?: string;
  trip_headsign?: string;
  wheelchair_accessible?: string;
  stopSequence: string[]; // ordered stop_ids by stop_sequence
  firstDepartureTime: string | null;
  lastArrivalTime: string | null;
  operativeDates: string[]; // from service materialization
}

export interface MaterializedFeed {
  routes: Map<string, MaterializedRoute>;
  servicePeriods: Map<string, MaterializedServicePeriod>;
  stops: Map<string, MaterializedStop>;
  trips: Map<string, MaterializedTrip>;
}

// ── Diff types ─────────────────────────────────────────────────────

export type DiffType = 'added' | 'deleted' | 'modified' | 'unchanged';

export interface FieldDelta {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface RouteImpact {
  addedTrips: string[];
  removedTrips: string[];
  modifiedTrips: string[];
  addedStops: string[];
  removedStops: string[];
  shapesChanged: boolean;
  servicePeriodsChanged: boolean;
  headwayDelta: number | null; // minutes, null if not computable
}

export interface EntityDiffRecord<T> {
  type: DiffType;
  key: string;
  oldEntity: T | null;
  newEntity: T | null;
  changes: FieldDelta[];
  impact?: RouteImpact; // only for routes
}

// ── File diff types ────────────────────────────────────────────────

export interface RowDiff {
  type: DiffType;
  key: string;
  oldRow: GtfsRawRow | null;
  newRow: GtfsRawRow | null;
  changedColumns: string[];
}

export interface BatchPattern {
  columns: string[];
  description: string;
  affectedRowCount: number;
  percentage: number;
}

export interface ColumnIntensity {
  column: string;
  changedCount: number;
  totalModified: number;
  percentage: number;
}

export interface FileDiffResult {
  fileName: string;
  keyColumns: string[];
  rows: RowDiff[];
  addedCount: number;
  deletedCount: number;
  modifiedCount: number;
  unchangedCount: number;
  batchPatterns: BatchPattern[];
  columnIntensities: ColumnIntensity[];
  duplicateKeys: string[];
  allColumns: string[];
}

// ── GTFS key configuration ─────────────────────────────────────────

export const GTFS_DEFAULT_KEYS: Record<string, string[]> = {
  'routes.txt': ['route_id'],
  'trips.txt': ['trip_id'],
  'stop_times.txt': ['trip_id', 'stop_sequence'],
  'stops.txt': ['stop_id'],
  'calendar.txt': ['service_id'],
  'calendar_dates.txt': ['service_id', 'date'],
  'shapes.txt': ['shape_id', 'shape_pt_sequence'],
  'agency.txt': ['agency_id'],
  'fare_attributes.txt': ['fare_id'],
  'fare_rules.txt': ['fare_id', 'route_id'],
  'frequencies.txt': ['trip_id', 'start_time'],
  'transfers.txt': ['from_stop_id', 'to_stop_id'],
  'pathways.txt': ['pathway_id'],
  'levels.txt': ['level_id'],
  'feed_info.txt': ['feed_publisher_name'],
};

export const CORE_GTFS_FILES = [
  'routes.txt',
  'trips.txt',
  'stop_times.txt',
  'calendar.txt',
  'stops.txt',
  'shapes.txt',
] as const;

export type CoreGtfsFile = (typeof CORE_GTFS_FILES)[number];

// ── Upload state ───────────────────────────────────────────────────

export interface FeedFiles {
  files: Map<string, GtfsRawRow[]>;
  fileNames: string[];
}

export type DiffTab = 'entity' | 'file';
export type EntitySubTab = 'routes' | 'servicePeriods' | 'stops';
