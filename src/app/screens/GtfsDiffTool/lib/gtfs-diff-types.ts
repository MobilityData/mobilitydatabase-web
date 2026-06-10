/**
 * TypeScript types matching the GTFS Diff v2 JSON schema.
 * See gtfs-diff-schema.json for the authoritative definition.
 */

// ── Shared primitives ──────────────────────────────────────────────

export interface ColumnEntry {
  name: string;
  /** 1-based position in the file's CSV header row. */
  position: number;
}

export interface FeedSource {
  source: string;
  /** ISO 8601 timestamp of when the feed was obtained. */
  downloaded_at: string;
}

export interface UnsupportedFile {
  file_name: string;
  present_in: 'base' | 'new' | 'both';
}

/** Machine- and human-readable reason a file or column was not compared. */
export interface NotComparedReason {
  /** e.g. "id_churn", "missing_primary_key", "file_too_large". */
  code: string;
  message: string;
}

/** A column excluded from the diff because its values are unreliable. */
export interface IgnoredColumn {
  column: string;
  reason: NotComparedReason;
}

// ── Metadata ───────────────────────────────────────────────────────

export interface GtfsDiffMetadata {
  schema_version: string;
  /** ISO 8601 timestamp of when the diff was generated. */
  generated_at: string;
  /**
   * Maximum number of row changes included per file.
   * 0 means no row changes; null means uncapped.
   */
  row_changes_cap_per_file: number | null;
  base_feed: FeedSource;
  new_feed: FeedSource;
  unsupported_files: UnsupportedFile[];
}

// ── Summary ────────────────────────────────────────────────────────

export interface FileSummary {
  file_name: string;
  status: 'added' | 'deleted' | 'modified' | 'not_compared';
}

export interface GtfsDiffSummary {
  total_changes: number;
  files_added_count: number;
  files_deleted_count: number;
  files_modified_count: number;
  files_not_compared_count: number;
  files: FileSummary[];
}

// ── Row change types ───────────────────────────────────────────────

export type RowIdentifier = Record<string, string>;

export interface RowAdded {
  identifier: RowIdentifier;
  /** CSV row from the new file — field order matches the columns array. */
  raw_value: string;
  /** 1-based line number in the new CSV file (header = line 1). */
  new_line_number: number;
}

export interface RowDeleted {
  identifier: RowIdentifier;
  /** CSV row from the base file — field order matches the columns array. */
  raw_value: string;
  /** 1-based line number in the base CSV file. */
  base_line_number: number;
}

export interface FieldChange {
  field: string;
  base_value: string;
  new_value: string;
}

export interface RowModified {
  identifier: RowIdentifier;
  /** Base CSV row — field order matches the columns array. */
  raw_value: string;
  base_line_number: number;
  new_line_number: number;
  field_changes: FieldChange[];
}

export interface RowChanges {
  /** Column(s) that uniquely identify a row. */
  primary_key: string[];
  /**
   * Union of all columns across both feeds.
   * Order: base feed's original column order, then new-feed-only columns appended.
   */
  columns: string[];
  added: RowAdded[];
  deleted: RowDeleted[];
  modified: RowModified[];
}

export interface TruncationInfo {
  is_truncated: true;
  omitted_count: number;
}

// ── Per-file statistics ────────────────────────────────────────────

/** Per-column modification statistics. Only covers modified rows. */
export interface ColumnStat {
  column: string;
  /** Number of modified rows that had a change in this column. */
  modifications_count: number;
  /** modifications_count as a percentage of total modified rows. */
  modifications_percentage: number;
}

export interface FileStats {
  total_rows_base?: number;
  total_rows_new?: number;
  columns_added_count?: number;
  columns_deleted_count?: number;
  rows_added_count?: number;
  rows_deleted_count?: number;
  rows_modified_count?: number;
  /** Percentage of rows changed relative to the larger of the two versions. */
  rows_changed_percentage?: number;
  column_stats?: ColumnStat[];
}

// ── File diff ──────────────────────────────────────────────────────

export interface FileDiff {
  file_name: string;
  file_action: 'modified' | 'added' | 'deleted' | 'not_compared';
  not_compared_reason?: NotComparedReason;
  ignored_columns?: IgnoredColumn[];
  columns_added?: ColumnEntry[];
  columns_deleted?: ColumnEntry[];
  row_changes?: RowChanges;
  truncated?: TruncationInfo;
  stats?: FileStats;
}

// ── Top-level document ─────────────────────────────────────────────

export interface GtfsDiff {
  metadata: GtfsDiffMetadata;
  summary: GtfsDiffSummary;
  file_diffs: FileDiff[];
}
