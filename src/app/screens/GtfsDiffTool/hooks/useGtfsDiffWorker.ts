/**
 * React hook that manages the GTFS diff Web Worker lifecycle.
 *
 * The worker computes the full GtfsDiff v2 document and posts it back
 * in a single 'done' message. No lazy file diff requests needed.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GtfsDiff } from '../lib/gtfs-diff-types';
import type {
  WorkerOutboundMessage,
  WorkerStartMessage,
} from '../lib/worker-types';

// ── Public types ───────────────────────────────────────────────────

export interface WorkerProgress {
  percent: number;
  label: string;
}

export type WorkerPhase = 'idle' | 'running' | 'done' | 'error';

export interface UseGtfsDiffWorkerReturn {
  phase: WorkerPhase;
  progress: WorkerProgress;
  gtfsDiff: GtfsDiff | null;
  error: string | null;
  run: (feedAFiles: File[], feedBFiles: File[]) => void;
  reset: () => void;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useGtfsDiffWorker(): UseGtfsDiffWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const [phase, setPhase] = useState<WorkerPhase>('idle');
  const [progressState, setProgress] = useState<WorkerProgress>({
    percent: 0,
    label: '',
  });
  const [gtfsDiff, setGtfsDiff] = useState<GtfsDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Terminate worker on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const handleMessage = useCallback((event: MessageEvent<WorkerOutboundMessage>) => {
    const msg = event.data;

    switch (msg.type) {
      case 'progress':
        setProgress({ percent: msg.percent, label: msg.label });
        break;

      case 'done':
        setGtfsDiff(msg.gtfsDiff);
        setPhase('done');
        setProgress({ percent: 100, label: 'Complete' });
        // Worker is no longer needed after the document is received
        workerRef.current?.terminate();
        workerRef.current = null;
        break;

      case 'error':
        setError(msg.message);
        setPhase('error');
        workerRef.current?.terminate();
        workerRef.current = null;
        break;
    }
  }, []);

  const run = useCallback(
    (feedAFiles: File[], feedBFiles: File[]) => {
      workerRef.current?.terminate();

      setPhase('running');
      setProgress({ percent: 0, label: 'Starting…' });
      setGtfsDiff(null);
      setError(null);

      const worker = new Worker(
        new URL('../lib/diff.worker.ts', import.meta.url),
      );
      workerRef.current = worker;
      worker.onmessage = handleMessage;
      worker.onerror = (event) => {
        setError(event.message || 'Worker encountered an unknown error');
        setPhase('error');
        worker.terminate();
        workerRef.current = null;
      };

      const startMsg: WorkerStartMessage = {
        type: 'start',
        feedAFiles,
        feedBFiles,
      };
      worker.postMessage(startMsg);
    },
    [handleMessage],
  );

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setPhase('idle');
    setProgress({ percent: 0, label: '' });
    setGtfsDiff(null);
    setError(null);
  }, []);

  return { phase, progress: progressState, gtfsDiff, error, run, reset };
}

