/**
 * React hook that manages the GTFS diff Web Worker lifecycle.
 *
 * The worker stays alive after the initial diff so it can respond to
 * lazy file-diff requests — parsed data remains in worker memory,
 * never transferred to the main thread.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type FileDiffResult } from '../lib/gtfs-types';
import { type SemanticDiffResult } from '../lib/semantic-diff';
import {
  type FileMetadata,
  type WorkerFileDiffRequest,
  type WorkerOutboundMessage,
  type WorkerStartMessage,
} from '../lib/worker-types';

// ── Public types ───────────────────────────────────────────────────

export interface WorkerProgress {
  percent: number;
  label: string;
}

export type WorkerPhase = 'idle' | 'running' | 'done' | 'error';

export interface WorkerResult {
  filesAMeta: FileMetadata[];
  filesBMeta: FileMetadata[];
  fileNamesA: string[];
  fileNamesB: string[];
  semantic: SemanticDiffResult;
}

export interface UseGtfsDiffWorkerReturn {
  phase: WorkerPhase;
  progress: WorkerProgress;
  result: WorkerResult | null;
  error: string | null;
  run: (feedAFiles: File[], feedBFiles: File[]) => void;
  reset: () => void;
  /**
   * Request a per-file diff from the worker. Returns a Promise that
   * resolves when the worker sends back the result.
   */
  requestFileDiff: (
    fileName: string,
    keyColumns?: string[],
    filterRouteId?: string,
  ) => Promise<FileDiffResult>;
}

// ── Hook ───────────────────────────────────────────────────────────

let requestIdCounter = 0;

export function useGtfsDiffWorker(): UseGtfsDiffWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const [phase, setPhase] = useState<WorkerPhase>('idle');
  const [progressState, setProgress] = useState<WorkerProgress>({
    percent: 0,
    label: '',
  });
  const [result, setResult] = useState<WorkerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pending file diff request resolvers
  const pendingFileDiffs = useRef<
    Map<string, { resolve: (r: FileDiffResult) => void; reject: (e: Error) => void }>
  >(new Map());

  // Clean up worker on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      // Reject any pending requests
      pendingFileDiffs.current.forEach(({ reject }) => {
        reject(new Error('Worker terminated'));
      });
      pendingFileDiffs.current.clear();
    };
  }, []);

  const handleMessage = useCallback((event: MessageEvent<WorkerOutboundMessage>) => {
    const msg = event.data;

    switch (msg.type) {
      case 'progress':
        setProgress({ percent: msg.percent, label: msg.label });
        break;

      case 'done': {
        setResult({
          filesAMeta: msg.filesAMeta,
          filesBMeta: msg.filesBMeta,
          fileNamesA: msg.fileNamesA,
          fileNamesB: msg.fileNamesB,
          semantic: msg.semantic,
        });
        setPhase('done');
        setProgress({ percent: 100, label: 'Complete' });
        // NOTE: Do NOT terminate the worker — it holds parsed data
        // for lazy file diff requests.
        break;
      }

      case 'file-diff-response': {
        const pending = pendingFileDiffs.current.get(msg.requestId);
        if (pending) {
          pending.resolve(msg.result);
          pendingFileDiffs.current.delete(msg.requestId);
        }
        break;
      }

      case 'error': {
        setError(msg.message);
        setPhase('error');
        // Reject any pending file diff requests
        pendingFileDiffs.current.forEach(({ reject }) => {
          reject(new Error(msg.message));
        });
        pendingFileDiffs.current.clear();
        workerRef.current?.terminate();
        workerRef.current = null;
        break;
      }
    }
  }, []);

  const run = useCallback((feedAFiles: File[], feedBFiles: File[]) => {
    // Terminate any existing worker
    workerRef.current?.terminate();
    pendingFileDiffs.current.clear();

    setPhase('running');
    setProgress({ percent: 0, label: 'Starting…' });
    setResult(null);
    setError(null);

    const worker = new Worker(
      new URL('../lib/diff.worker.ts', import.meta.url),
    );
    workerRef.current = worker;

    worker.onmessage = handleMessage;

    worker.onerror = (event) => {
      setError(event.message || 'Worker encountered an unknown error');
      setPhase('error');
      pendingFileDiffs.current.forEach(({ reject }) => {
        reject(new Error(event.message));
      });
      pendingFileDiffs.current.clear();
      worker.terminate();
      workerRef.current = null;
    };

    const startMsg: WorkerStartMessage = {
      type: 'start',
      feedAFiles,
      feedBFiles,
    };
    worker.postMessage(startMsg);
  }, [handleMessage]);

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    pendingFileDiffs.current.forEach(({ reject }) => {
      reject(new Error('Reset'));
    });
    pendingFileDiffs.current.clear();
    setPhase('idle');
    setProgress({ percent: 0, label: '' });
    setResult(null);
    setError(null);
  }, []);

  const requestFileDiff = useCallback(
    (
      fileName: string,
      keyColumns?: string[],
      filterRouteId?: string,
    ): Promise<FileDiffResult> => {
      return new Promise<FileDiffResult>((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) {
          reject(new Error('Worker not available'));
          return;
        }

        const requestId = `fd-${++requestIdCounter}`;
        pendingFileDiffs.current.set(requestId, { resolve, reject });

        const msg: WorkerFileDiffRequest = {
          type: 'file-diff-request',
          requestId,
          fileName,
          keyColumns,
          filterRouteId,
        };
        worker.postMessage(msg);
      });
    },
    [],
  );

  return {
    phase,
    progress: progressState,
    result,
    error,
    run,
    reset,
    requestFileDiff,
  };
}
