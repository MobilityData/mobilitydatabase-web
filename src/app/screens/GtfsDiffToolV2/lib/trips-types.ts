/**
 * Types for the day-anchored Trips view (v2 POC).
 *
 * The payload (`TripsDiffDoc`) is produced by
 * scripts/generate-gtfs-trips-diff.mjs: both feeds' trips in a compact form,
 * plus which services run on every date. Matching and classification run
 * client-side for the selected service day (lib/trips-utils.ts), so any date
 * can be compared, not only precomputed ones.
 */

import type { FeedSource } from '../../GtfsDiffTool/lib/gtfs-diff-types';
import type { FieldChange, GtfsDate, RouteInfo } from './entity-diff-types';

// ── Generated payload ──────────────────────────────────────────────

export type FeedSide = 'base' | 'new';

/** [start_time, end_time, headway_secs, exact_times] in seconds. */
export type FrequencyRow = [number, number, number, string];

export interface CompactTrip {
  id: string;
  route: string;
  service: string;
  dir: string;
  headsign: string;
  /** Non-empty trip attributes (wheelchair_accessible, block_id, shape_id, …). */
  attrs: Record<string, string>;
  stops: string[];
  /** Seconds since service-day midnight, null when not set (non-timepoint). */
  arr: Array<number | null>;
  dep: Array<number | null>;
  /** One character per stop, '0' when empty (GTFS default). */
  pickup: string;
  dropoff: string;
  /** One character per stop, '_' when empty. Only when the column exists. */
  timepoint?: string;
  dist?: Array<number | null>;
  stop_headsign?: string[];
  freq?: FrequencyRow[];
}

export interface DayTypeOption {
  id: string;
  label: string;
  /** Representative date that is diffed. */
  date: GtfsDate;
  /** Dates sharing this exact pair of service sets. */
  day_count: number;
  /** Dates of this day type in the compared period. */
  group_count: number;
  first: GtfsDate;
  last: GtfsDate;
  /** True for the most common pattern of its day type. */
  primary: boolean;
}

export interface TripsDiffDoc {
  metadata: {
    schema_version: string;
    generated_at: string;
    base_feed: FeedSource;
    new_feed: FeedSource;
  };
  routes: Record<string, RouteInfo>;
  /** stop_id -> stop_name (new feed preferred). */
  stops: Record<string, string>;
  /** Distinct sets of active service_ids, referenced by `dates`. */
  service_sets: { base: string[][]; new: string[][] };
  /** date -> [base set index, new set index]; -1 = no service in that feed. */
  dates: Record<GtfsDate, [number, number]>;
  day_types: DayTypeOption[];
  feeds: { base: { trips: CompactTrip[] }; new: { trips: CompactTrip[] } };
}

// ── Client-side diff of one service day ────────────────────────────

/** Primary class of a trip; matched trips get exactly one. */
export type TripClass =
  | 'added'
  | 'removed'
  | 'pattern'
  | 'running_time'
  | 'shifted'
  | 'rules'
  | 'attributes'
  | 'restructured'
  | 'unchanged';

/**
 * same_id: paired only because the trip_id is unchanged; the stops or times
 * differ too much for the other passes, so it is a weak match.
 */
export type MatchMethod = 'same_pattern' | 'cross_pattern' | 'same_id';

export interface StopAlignment {
  op: 'keep' | 'add' | 'remove';
  stop_id: string;
  /** Index in the base / new trip's stop list. */
  bi: number | null;
  ni: number | null;
}

export interface RuleChange {
  stop_id: string;
  kind: 'pickup' | 'dropoff';
  base: string;
  new: string;
}

export interface RawStopChange {
  stop_id: string;
  field: 'timepoint' | 'shape_dist_traveled' | 'stop_headsign';
  base: string;
  new: string;
}

export interface SegmentChange {
  from: string;
  to: string;
  /** Running time between the two stops, seconds. */
  base: number;
  new: number;
}

export interface TripPair {
  key: string;
  route: string;
  dir: string;
  cls: TripClass;
  /** Changed but within the minor threshold: dimmed, not counted in verdicts. */
  minor: boolean;
  base: CompactTrip | null;
  new: CompactTrip | null;
  /** Departure used for ordering (new, else base), seconds. */
  time: number;
  base_time: number | null;
  new_time: number | null;
  method: MatchMethod | null;
  /** Secondary flags besides the primary class. */
  flags: TripClass[];
  align: StopAlignment[];
  /** Uniform shift in seconds when every kept time moved by the same delta. */
  shift: number | null;
  /** Largest absolute time delta over kept stops, seconds. */
  max_delta: number;
  segments: SegmentChange[];
  rules: RuleChange[];
  attr_changes: FieldChange[];
  /** Identifier attributes that changed (block_id): ID only, not service. */
  id_attr_changes: FieldChange[];
  raw_changes: RawStopChange[];
  /** End-to-end running-time change over kept stops, seconds. */
  running_delta: number | null;
  id_changed: boolean;
  service_changed: boolean;
}

export type RouteVerdict =
  | 'less_service'
  | 'more_service'
  | 'retimed'
  | 'pattern'
  | 'rules_attributes'
  | 'restructured';

export interface PatternInfo {
  key: string;
  stops: string[];
  base: number;
  new: number;
  /** For patterns only in the new feed: the base pattern it most resembles. */
  ref: string | null;
}

export interface RouteDirDiff {
  key: string;
  route: string;
  dir: string;
  headsign: string;
  trips: { base: number; new: number };
  span: {
    base: [number, number] | null;
    new: [number, number] | null;
  };
  /** Median headway in the busiest hour, minutes. */
  peak_headway: { base: number | null; new: number | null };
  /** Largest per-period median running-time change. */
  running: { delta: number; period: string } | null;
  patterns: PatternInfo[];
  patterns_changed: number;
  /** Trips departing in each hour 0…29 (expanded for frequency trips). */
  profile: { base: number[]; new: number[] };
  /** Hours with frequency-based service. */
  freq_hours: boolean[];
  /** Union stop order of every pattern. */
  stop_order: string[];
  pairs: TripPair[];
  /** Primary classes of non-minor trips. */
  class_counts: Record<TripClass, number>;
  minor_count: number;
  verdicts: RouteVerdict[];
  minor_only: boolean;
  impact: number;
}

export interface DayDiff {
  date: GtfsDate;
  services: { base: string[]; new: string[] };
  routes: RouteDirDiff[];
  class_counts: Record<TripClass, number>;
  minor_count: number;
  trips: { base: number; new: number };
}
