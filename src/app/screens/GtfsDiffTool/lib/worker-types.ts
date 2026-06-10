/**
 * Message types for communication between the main thread and the
 * GTFS diff Web Worker.
 *
 * The worker computes the full GtfsDiff v2 document in one pass and
 * sends it back in the 'done' message.
 */

import type { GtfsDiff } from './gtfs-diff-types';

// ── Main thread → Worker messages ──────────────────────────────────

export interface WorkerStartMessage {
  type: 'start';
  /** Raw File objects (structured-cloneable) for each feed */
  feedAFiles: File[];
  feedBFiles: File[];
}

export type WorkerInboundMessage = WorkerStartMessage;

// ── Worker → Main thread messages ──────────────────────────────────

export interface WorkerProgressMessage {
  type: 'progress';
  /** 0 – 100 */
  percent: number;
  /** Human-readable status label */
  label: string;
}

export interface WorkerDoneMessage {
  type: 'done';
  /** Schema-compliant GtfsDiff v2 document */
  gtfsDiff: GtfsDiff;
}

export interface WorkerErrorMessage {
  type: 'error';
  message: string;
}

export type WorkerOutboundMessage =
  | WorkerProgressMessage
  | WorkerDoneMessage
  | WorkerErrorMessage;
