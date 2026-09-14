/**
 * Geometry helpers for the service-coverage diagrams on the
 * "How it is calculated" page. Kept free of React so the placement math can be
 * unit tested on its own.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DateRange {
  /** Inclusive ISO date (YYYY-MM-DD). */
  start: string;
  /** Inclusive ISO date (YYYY-MM-DD). */
  end: string;
}

export interface TrackPlacement {
  leftPercent: number;
  widthPercent: number;
}

/**
 * Parses an ISO date as UTC midnight so the diagrams render identically on the
 * server and on the client regardless of the viewer's timezone.
 */
export function parseIsoDate(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00.000Z`);
}

export function daysBetween(startIso: string, endIso: string): number {
  return (parseIsoDate(endIso) - parseIsoDate(startIso)) / MS_PER_DAY;
}

function clampPercent(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Position of a single date on the axis, as a percentage from its left edge.
 * Returns 0 for a degenerate axis rather than dividing by zero.
 */
export function placeDateOnAxis(isoDate: string, axis: DateRange): number {
  const axisSpan = daysBetween(axis.start, axis.end);
  if (axisSpan <= 0) return 0;
  const offset = daysBetween(axis.start, isoDate);
  return roundPercent(clampPercent((offset / axisSpan) * 100));
}

/**
 * The empty spans between consecutive dataset ranges.
 *
 * A gap only counts when the next range starts more than one day after the
 * previous one ends — back-to-back datasets (v1 ends Aug 31, v2 starts Sept 1)
 * are continuous, so they produce nothing. Each returned range bridges
 * `previous.end` to `next.start` so it fills exactly the empty space on the
 * track; the missing service days are the interior of that span.
 *
 * Input is assumed to be in chronological order, matching how feed versions
 * are published.
 */
export function findGapSpans(ranges: DateRange[]): DateRange[] {
  const gaps: DateRange[] = [];

  for (let index = 1; index < ranges.length; index++) {
    const previous = ranges[index - 1];
    const next = ranges[index];
    if (daysBetween(previous.end, next.start) > 1) {
      gaps.push({ start: previous.end, end: next.start });
    }
  }

  return gaps;
}

/**
 * Position and width of a date range on the axis. Ranges falling entirely
 * outside the axis collapse to zero width instead of overflowing the track.
 */
export function placeRangeOnAxis(
  range: DateRange,
  axis: DateRange,
): TrackPlacement {
  const leftPercent = placeDateOnAxis(range.start, axis);
  const rightPercent = placeDateOnAxis(range.end, axis);
  return {
    leftPercent,
    widthPercent: roundPercent(Math.max(rightPercent - leftPercent, 0)),
  };
}
