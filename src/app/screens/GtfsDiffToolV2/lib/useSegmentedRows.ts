'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Segments kept in memory; the farthest from the newest are dropped first. */
const CACHE_SEGMENTS = 60;

/** Shared, so a stale query doesn't hand out a new Map every render. */
const EMPTY: ReadonlyMap<number, never> = new Map<number, never>();

export interface SegmentCache<T> {
  /** Changes whenever the query changes. */
  queryKey: string;
  segments: ReadonlyMap<number, T[]>;
  /** Fetch a segment unless cached or already in flight. */
  ensure: (segment: number) => void;
  error: Error | null;
}

interface SegmentedRowsArgs<T> {
  /** Identifies the query (table, filters, sort); a new key starts empty. */
  queryKey: string;
  segmentRows: number;
  /** Rows [offset, offset + limit) of the current query. */
  fetchRows: (offset: number, limit: number) => Promise<T[]>;
}

/**
 * Row segments of one query, fetched on demand for an infinite-scroll list
 * or table (see useSegmentWindow). A new query starts from an empty cache;
 * results of a superseded query are dropped.
 */
export function useSegmentedRows<T>({
  queryKey,
  segmentRows,
  fetchRows,
}: SegmentedRowsArgs<T>): SegmentCache<T> {
  const [state, setState] = useState<{
    key: string;
    segments: Map<number, T[]>;
    error: Error | null;
  }>({ key: queryKey, segments: new Map(), error: null });
  const inFlight = useRef(new Set<string>());
  const current = useRef(queryKey);
  current.current = queryKey;

  useEffect(() => {
    setState({ key: queryKey, segments: new Map(), error: null });
  }, [queryKey]);

  // Read the latest fetcher inside ensure() without re-creating it per render.
  const args = useRef({ fetchRows, segmentRows });
  args.current = { fetchRows, segmentRows };

  const ensure = useCallback(
    (segment: number) => {
      const key = current.current;
      const id = `${key}#${segment}`;
      if (inFlight.current.has(id)) return;
      if (state.key === key && state.segments.has(segment)) return;
      inFlight.current.add(id);
      const a = args.current;
      a.fetchRows(segment * a.segmentRows, a.segmentRows)
        .then((rows) => {
          if (current.current !== key) return;
          setState((s) => {
            if (s.key !== key) return s;
            const segments = new Map(s.segments);
            segments.set(segment, rows);
            if (segments.size > CACHE_SEGMENTS) {
              const far = [...segments.keys()].sort(
                (x, y) => Math.abs(y - segment) - Math.abs(x - segment),
              );
              for (const k of far.slice(0, segments.size - CACHE_SEGMENTS))
                segments.delete(k);
            }
            return { ...s, segments };
          });
        })
        .catch((e: unknown) => {
          if (current.current !== key) return;
          setState((s) =>
            s.key !== key
              ? s
              : { ...s, error: e instanceof Error ? e : new Error(String(e)) },
          );
        })
        .finally(() => inFlight.current.delete(id));
    },
    [state],
  );

  const fresh = state.key === queryKey;
  return {
    queryKey,
    segments: fresh ? state.segments : EMPTY,
    ensure,
    error: fresh ? state.error : null,
  };
}
