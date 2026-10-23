/**
 * Which row segments an infinite-scroll table keeps in the DOM.
 *
 * Rows load in fixed-size segments as the user scrolls down. Every segment
 * that has been rendered once has a measured height, so segments far from
 * the viewport can be swapped for spacers of that height (no scroll jump),
 * and brought back when the user scrolls up to them.
 */

export interface RowWindow {
  /** First and last rendered segment, inclusive. */
  first: number;
  last: number;
}

export interface RowWindowInput {
  current: RowWindow;
  /** Measured heights of segments 0…n-1 (every segment rendered so far). */
  heights: number[];
  /** Segments that exist for the current query. */
  segmentCount: number;
  segmentRows: number;
  scrollTop: number;
  viewportHeight: number;
  /** Load / restore segments this far beyond the viewport. */
  aheadPx: number;
  /** Only evict segments at least this far outside the viewport. */
  evictMarginPx: number;
  /** Start evicting once more rows than this are rendered. */
  maxRenderedRows: number;
}

/** Top offset of every segment (index n = total measured height). */
export function segmentOffsets(heights: number[]): number[] {
  const out = [0];
  for (const h of heights) out.push(out[out.length - 1] + h);
  return out;
}

/** Height of the measured segments in [from, to). */
export function spanHeight(
  heights: number[],
  from: number,
  to: number,
): number {
  let h = 0;
  for (let i = Math.max(0, from); i < Math.min(to, heights.length); i++)
    h += heights[i];
  return h;
}

export function nextWindow(input: RowWindowInput): RowWindow {
  const {
    current,
    heights,
    segmentCount,
    segmentRows,
    scrollTop,
    viewportHeight,
    aheadPx,
    evictMarginPx,
    maxRenderedRows,
  } = input;
  if (segmentCount === 0) return { first: 0, last: 0 };
  const measured = Math.min(heights.length, segmentCount);
  const pos = segmentOffsets(heights.slice(0, measured));
  const viewTop = scrollTop - aheadPx;
  const viewBottom = scrollTop + viewportHeight + aheadPx;

  // Segments the (extended) viewport touches.
  let wantFirst = -1;
  let wantLast = -1;
  for (let s = 0; s < measured; s++) {
    if (pos[s] < viewBottom && pos[s + 1] > viewTop) {
      if (wantFirst === -1) wantFirst = s;
      wantLast = s;
    }
  }
  // Past everything measured: the next unloaded segment.
  if (viewBottom > pos[measured] && measured < segmentCount) {
    if (wantFirst === -1) wantFirst = measured;
    wantLast = measured;
  }
  if (wantFirst === -1) {
    wantFirst = Math.max(0, measured - 1);
    wantLast = wantFirst;
  }

  // Keep what is rendered next to the wanted range; a jump re-centres.
  const overlaps =
    current.last >= wantFirst - 1 && current.first <= wantLast + 1;
  let first = overlaps ? Math.min(current.first, wantFirst) : wantFirst;
  let last = overlaps ? Math.max(current.last, wantLast) : wantLast;
  last = Math.min(last, segmentCount - 1);

  // Too many rows in the DOM: drop the farthest segments, if far enough away.
  const rendered = (): number => (last - first + 1) * segmentRows;
  while (rendered() > maxRenderedRows) {
    const topBottomEdge = first < measured ? pos[first + 1] : Infinity;
    const topFar =
      first < wantFirst && topBottomEdge < scrollTop - evictMarginPx;
    const bottomTopEdge = last < measured ? pos[last] : Infinity;
    const bottomFar =
      last > wantLast &&
      last < measured &&
      bottomTopEdge > scrollTop + viewportHeight + evictMarginPx;
    if (
      topFar &&
      (!bottomFar || scrollTop - topBottomEdge >= bottomTopEdge - scrollTop)
    )
      first++;
    else if (bottomFar) last--;
    else break;
  }
  return { first, last };
}
