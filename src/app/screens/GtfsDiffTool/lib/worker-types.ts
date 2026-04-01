/**
 * Message types for communication between the main thread and the
 * GTFS diff Web Worker.
 *
 * The worker now keeps parsed data in memory and responds to lazy
 * file-diff requests after the initial semantic diff is done.
 */

import { type FileDiffResult, type GtfsRawRow } from './gtfs-types';
import { type SemanticDiffResult } from './semantic-diff';

// ── Main thread → Worker messages ──────────────────────────────────

export interface WorkerStartMessage {
  type: 'start';
  /** Raw File objects (structured-cloneable) for each feed */
  feedAFiles: File[];
  feedBFiles: File[];
}

/** Request a per-file diff from the worker (lazy, on demand). */
export interface WorkerFileDiffRequest {
  type: 'file-diff-request';
  /** Unique id so we can correlate responses */
  requestId: string;
  fileName: string;
  keyColumns?: string[];
  /** Filter to a specific route_id (for contextual file diff) */
  filterRouteId?: string;
}

export type WorkerInboundMessage = WorkerStartMessage | WorkerFileDiffRequest;

// ── Worker → Main thread messages ──────────────────────────────────

export interface WorkerProgressMessage {
  type: 'progress';
  /** 0 – 100 */
  percent: number;
  /** Human-readable status label */
  label: string;
}

/** Compact file metadata — replaces sending full row data. */
export interface FileMetadata {
  fileName: string;
  rowCount: number;
  columns: string[];
}

export interface WorkerDoneMessage {
  type: 'done';
  /** Metadata per file (NOT full row data — that stays in the worker) */
  filesAMeta: FileMetadata[];
  filesBMeta: FileMetadata[];
  /** File names found in each feed */
  fileNamesA: string[];
  fileNamesB: string[];
  /** Semantic diff result */
  semantic: SemanticDiffResult;
}

/** Response to a WorkerFileDiffRequest. */
export interface WorkerFileDiffResponse {
  type: 'file-diff-response';
  requestId: string;
  result: FileDiffResult;
}

export interface WorkerErrorMessage {
  type: 'error';
  message: string;
}

export type WorkerOutboundMessage =
  | WorkerProgressMessage
  | WorkerDoneMessage
  | WorkerFileDiffResponse
  | WorkerErrorMessage;
