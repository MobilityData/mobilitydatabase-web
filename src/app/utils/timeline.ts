/**
 * Geometry helpers for the service-coverage diagrams: the worked examples on
 * the "How it is calculated" page and the real coverage windows on a feed's
 * Seal of Reliability analysis. Kept free of React so the placement math can
 * be unit tested on its own.
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

/** Two decimals, so server and client render byte-identical percentages. */
export function roundPercent(value: number): number {
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
 * Narrowest a band drawn over a track can be and still hold a spelled-out
 * label. Below this the band is a sliver - a week, or a fortnight of overlap,
 * on an axis of months - and its label is abbreviated rather than clipped to
 * nothing.
 */
const FULL_LABEL_MIN_WIDTH_PERCENT = 12;

export function fitsFullBandLabel(widthPercent: number): boolean {
  return widthPercent >= FULL_LABEL_MIN_WIDTH_PERCENT;
}

/**
 * Where an annotation - a chip naming a span - sits under a track: centred on
 * `centerPercent`, and never reaching past the ends of the track, which are
 * as far as it may go.
 *
 * Expressed as flow, not as an absolute offset, so the annotation keeps its
 * own height. Percentage padding insets the far side by as much as the near
 * side has to spare, leaving the widest box whose own centre is
 * `centerPercent` and which still fits the track; centring the annotation in
 * that box centres it on the span while keeping it inside the track.
 *
 * An annotation wider than that box - a chip under a span near either end -
 * cannot be centred without spilling off the track, so it falls back to
 * resting against the near edge. That is what `flexDirection` is for: a
 * `safe` centring falls back to the start of the row, so the row runs
 * backwards for spans past halfway and the fallback lands on the right edge
 * rather than the left.
 */
export interface TrackAnnotationPlacement {
  /** Which edge an annotation too wide to centre falls back against. */
  flexDirection: 'row' | 'row-reverse';
  paddingLeftPercent: number;
  paddingRightPercent: number;
}

export function placeAnnotationOnAxis(
  centerPercent: number,
): TrackAnnotationPlacement {
  const center = clampPercent(centerPercent);
  return {
    flexDirection: center > 50 ? 'row-reverse' : 'row',
    paddingLeftPercent: roundPercent(Math.max(0, center * 2 - 100)),
    paddingRightPercent: roundPercent(Math.max(0, 100 - center * 2)),
  };
}

/** Which end of a segment stays put when its pixel floor widens it. */
export type TrackAnchor = 'start' | 'end';

/**
 * Which end a band drawn over a bar should grow from, once its pixel floor is
 * wider than the days it covers.
 *
 * A band always grows away from the end it is anchored to, so the anchor is
 * the end nearest the bar: a one-day overlap on a bar that *ends* there grows
 * back into the bar rather than off its end, and a gap drawn beyond a bar
 * grows back towards it rather than away. Without this the floor always grows
 * rightwards, which leaves a band hanging off the end of the bar it belongs
 * to.
 */
export function anchorBandToBar(
  band: TrackPlacement,
  bar: TrackPlacement,
): TrackAnchor {
  const bandCenter = band.leftPercent + band.widthPercent / 2;
  return bandCenter >= bar.leftPercent + bar.widthPercent ? 'end' : 'start';
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
