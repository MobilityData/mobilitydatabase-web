'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { type RowWindow, nextWindow, spanHeight } from './row-window';
import type { SegmentCache } from './useSegmentedRows';

interface SegmentWindowArgs<T> {
  cache: SegmentCache<T>;
  /** Rows matching the query. */
  total: number;
  segmentRows: number;
  /** Start loading the next segment this far before the end is reached. */
  aheadPx?: number;
  /** Rendered segments are only removed when this far outside the view. */
  evictMarginPx?: number;
  /** Rows in the DOM before far-away segments are swapped for spacers. */
  maxRenderedRows?: number;
}

export interface SegmentWindow<E extends HTMLElement> {
  /** The scrolling element. */
  scrollRef: React.RefObject<E | null>;
  onScroll: () => void;
  /** Ref for a rendered segment's element, so its height is measured. */
  segmentRef: (segment: number) => (el: HTMLElement | null) => void;
  /** Segments to render, in order (some may still be loading). */
  rendered: number[];
  /** Height of a segment once measured (placeholders keep it). */
  heightOf: (segment: number) => number | undefined;
  /** Heights of the evicted segments above / below the rendered ones. */
  topSpacer: number;
  bottomSpacer: number;
  segmentCount: number;
  /** First / last rendered segment, and how many have been measured. */
  first: number;
  last: number;
  measured: number;
}

/**
 * Infinite scroll with windowing over a segmented query
 * (useSegmentedRows): segments load as the view nears them, and segments
 * far outside the view are swapped for spacers of their measured height
 * (lib/row-window.ts). Used by the raw diff tables and the map lists.
 */
export function useSegmentWindow<T, E extends HTMLElement = HTMLDivElement>({
  cache,
  total,
  segmentRows,
  aheadPx = 1200,
  evictMarginPx = 4000,
  maxRenderedRows = 1000,
}: SegmentWindowArgs<T>): SegmentWindow<E> {
  const segmentCount = Math.ceil(total / segmentRows);
  const scrollRef = useRef<E>(null);
  const elements = useRef(new Map<number, HTMLElement>());
  /** Measured height of every segment rendered so far, for this query. */
  const heights = useRef<number[]>([]);
  const [win, setWin] = useState<RowWindow>({ first: 0, last: 0 });
  const [measuredVersion, bumpMeasured] = useReducer((n: number) => n + 1, 0);

  // A new query starts at the top with nothing measured.
  useEffect(() => {
    heights.current = [];
    setWin({ first: 0, last: 0 });
    scrollRef.current?.scrollTo({ top: 0 });
  }, [cache.queryKey]);

  // Fetch every rendered segment that isn't cached.
  useEffect(() => {
    for (let s = win.first; s <= Math.min(win.last, segmentCount - 1); s++)
      cache.ensure(s);
  }, [win, segmentCount, cache]);

  // Measure segments once their rows are in the DOM.
  useLayoutEffect(() => {
    let changed = false;
    for (const [s, el] of elements.current) {
      if (!cache.segments.has(s)) continue;
      const h = el.offsetHeight;
      // Heights are kept contiguous from segment 0 (segments render in order).
      if (h > 0 && s <= heights.current.length && heights.current[s] !== h) {
        heights.current[s] = h;
        changed = true;
      }
    }
    if (changed) bumpMeasured();
  });

  const updateWindow = useCallback(() => {
    const el = scrollRef.current;
    if (el == null) return;
    setWin((current) => {
      const next = nextWindow({
        current,
        heights: heights.current,
        segmentCount,
        segmentRows,
        scrollTop: el.scrollTop,
        viewportHeight: el.clientHeight,
        aheadPx,
        evictMarginPx,
        maxRenderedRows,
      });
      return next.first === current.first && next.last === current.last
        ? current
        : next;
    });
  }, [segmentCount, segmentRows, aheadPx, evictMarginPx, maxRenderedRows]);

  // Keep filling the view after each load / measurement (short pages, jumps).
  useEffect(updateWindow, [updateWindow, measuredVersion, cache.segments]);

  const frame = useRef<number | null>(null);
  const onScroll = useCallback((): void => {
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      updateWindow();
    });
  }, [updateWindow]);
  useEffect(
    () => () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const segmentRef = useCallback(
    (segment: number) => (el: HTMLElement | null) => {
      if (el) elements.current.set(segment, el);
      else elements.current.delete(segment);
    },
    [],
  );

  const lastRendered = Math.min(win.last, segmentCount - 1);
  const rendered: number[] = [];
  for (let s = win.first; s <= lastRendered; s++) rendered.push(s);
  return {
    scrollRef,
    onScroll,
    segmentRef,
    rendered,
    heightOf: (s) => heights.current[s],
    topSpacer: spanHeight(heights.current, 0, win.first),
    bottomSpacer: spanHeight(
      heights.current,
      lastRendered + 1,
      heights.current.length,
    ),
    segmentCount,
    first: win.first,
    last: lastRendered,
    measured: heights.current.length,
  };
}
