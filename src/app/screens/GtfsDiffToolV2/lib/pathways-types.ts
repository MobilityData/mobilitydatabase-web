/**
 * Types for the station pathways + levels diff (v2 POC).
 * Produced by scripts/generate-gtfs-pathways-diff.mjs
 * (logic in scripts/lib/gtfs-pathways-diff.mjs).
 */

import type { FieldChange } from './entity-diff-types';

/** A GTFS row with empty columns dropped: a missing key means ''. */
export type SparseRow = Record<string, string>;

export type RowStatus = 'added' | 'deleted' | 'modified' | 'unchanged';
export type LinkStatus = RowStatus | 'restructured';

/** 'ab': travel from link.a to link.b only; 'ba': the reverse. */
export type LinkDirection = 'ab' | 'ba';

export interface LinkFieldChange extends FieldChange {
  /** Set when the change only applies to one direction of travel. */
  direction?: LinkDirection;
}

/**
 * Pathways between the same two nodes with the same pathway_mode, folded
 * into one link (feeds often publish a corridor as two one-way rows).
 */
export interface PathwayLink {
  /** `${a}|${b}|${mode}` with a < b. */
  id: string;
  a: string;
  b: string;
  /** pathway_mode, '1'..'7'. */
  mode: string;
  /** restructured: only pathway_id / is_bidirectional changed. */
  status: LinkStatus;
  base: SparseRow[];
  new: SparseRow[];
  field_changes: LinkFieldChange[];
  id_changes: Array<{ base: string; new: string }>;
}

export interface NodeDiff {
  stop_id: string;
  status: RowStatus;
  base: SparseRow | null;
  new: SparseRow | null;
  field_changes: FieldChange[];
}

export interface LevelDiff {
  level_id: string;
  status: RowStatus;
  base: SparseRow | null;
  new: SparseRow | null;
  field_changes: FieldChange[];
}

export interface StationPathwaysDiff {
  station_id: string;
  name: string;
  status: Exclude<RowStatus, 'unchanged'>;
  station: { base: SparseRow | null; new: SparseRow | null };
  /** Levels referenced by any node of the station, in either feed. */
  levels: LevelDiff[];
  /** Every node that is an endpoint of a pathway, in either feed. */
  nodes: NodeDiff[];
  links: PathwayLink[];
}

export interface PathwaysFeedSource {
  source: string;
  downloaded_at: string;
  label: string;
}

export interface PathwaysDiff {
  metadata: {
    schema_version: string;
    generated_at: string;
    base_feed: PathwaysFeedSource;
    new_feed: PathwaysFeedSource;
    note: string | null;
  };
  present: {
    base: { levels: boolean; pathways: boolean };
    new: { levels: boolean; pathways: boolean };
  };
  totals: {
    stations: { base: number; new: number };
    pathways: { base: number; new: number };
    levels: { base: number; new: number };
  };
  orphan_pathways: { base: number; new: number };
  unchanged_station_ids: string[];
  /** Changed stations only. */
  stations: StationPathwaysDiff[];
}
