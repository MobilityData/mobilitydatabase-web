/**
 * What the Trips view compares: a service day, or two of them.
 *
 * When both feeds publish the same dates, a comparison is one date and its
 * key is that date ("20260908"): the trips each feed runs on it. When they
 * don't (a summer feed against a fall feed, say), there is no shared date, so
 * a comparison pairs a base date with a new date and its key is
 * "<base>~<new>" ("20260825~20261110"): base trips of the first date against
 * new trips of the second.
 *
 * Every place that keys on a date (shard loading, the day diff, deep links)
 * takes the key as is, so both kinds flow through the same code.
 *
 * Type-only imports: the Node generators import this file directly.
 */

import type { GtfsDate } from './entity-diff-types';
import type { TripsDiffDoc } from './trips-types';

export type AnchorKey = string;

const SEP = '~';

export function anchorKey(base: GtfsDate, next: GtfsDate): AnchorKey {
  return base === next ? base : `${base}${SEP}${next}`;
}

export function anchorDates(key: AnchorKey): { base: GtfsDate; new: GtfsDate } {
  const i = key.indexOf(SEP);
  return i < 0
    ? { base: key, new: key }
    : { base: key.slice(0, i), new: key.slice(i + 1) };
}

export function isCrossPeriod(key: AnchorKey): boolean {
  return key.includes(SEP);
}

/** [base service-set index, new service-set index]; -1 = no service. */
export function anchorSetIndices(
  doc: Pick<TripsDiffDoc, 'dates'>,
  key: AnchorKey,
): [number, number] {
  const d = anchorDates(key);
  return [doc.dates[d.base]?.[0] ?? -1, doc.dates[d.new]?.[1] ?? -1];
}

// ── Typical days of each period ────────────────────────────────────

export interface PeriodSide {
  /** Representative date: the middle date running the most common set. */
  date: GtfsDate;
  /** Dates running that same set. */
  day_count: number;
  /** Dates of this day type with any service in this feed. */
  group_count: number;
  first: GtfsDate;
  last: GtfsDate;
}

export interface PeriodDayType {
  id: string;
  label: string;
  key: AnchorKey;
  base: PeriodSide;
  new: PeriodSide;
}

const GROUPS: Array<{ id: string; label: string; days: number[] }> = [
  { id: 'weekday', label: 'Weekday', days: [0, 1, 2, 3, 4] },
  { id: 'saturday', label: 'Saturday', days: [5] },
  { id: 'sunday', label: 'Sunday', days: [6] },
];

/** 0 = Monday … 6 = Sunday */
function weekday(d: GtfsDate): number {
  const t = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
  return (new Date(t).getUTCDay() + 6) % 7;
}

function typicalSide(dates: Array<[GtfsDate, number]>): PeriodSide | null {
  const bySet = new Map<number, GtfsDate[]>();
  for (const [d, set] of dates) {
    if (set < 0) continue;
    const list = bySet.get(set);
    if (list) list.push(d);
    else bySet.set(set, [d]);
  }
  let best: GtfsDate[] | null = null;
  for (const list of bySet.values())
    if (best == null || list.length > best.length) best = list;
  if (best == null) return null;
  best.sort();
  const total = [...bySet.values()].reduce((s, l) => s + l.length, 0);
  return {
    date: best[Math.floor(best.length / 2)],
    day_count: best.length,
    group_count: total,
    first: best[0],
    last: best[best.length - 1],
  };
}

/**
 * Typical Weekday / Saturday / Sunday of each feed, paired across periods:
 * for each day type, the service set each feed runs most often on it.
 */
export function periodDayTypes(
  doc: Pick<TripsDiffDoc, 'dates'>,
): PeriodDayType[] {
  const out: PeriodDayType[] = [];
  const entries = Object.entries(doc.dates);
  for (const g of GROUPS) {
    const inGroup = entries.filter(([d]) => g.days.includes(weekday(d)));
    const base = typicalSide(inGroup.map(([d, [b]]) => [d, b]));
    const next = typicalSide(inGroup.map(([d, [, n]]) => [d, n]));
    if (base == null || next == null) continue;
    out.push({
      id: `${g.id}-periods`,
      label: g.label,
      key: anchorKey(base.date, next.date),
      base,
      new: next,
    });
  }
  return out;
}

/** Dates on which both feeds run service. */
export function sharedServiceDays(doc: Pick<TripsDiffDoc, 'dates'>): number {
  let n = 0;
  for (const [b, x] of Object.values(doc.dates)) if (b >= 0 && x >= 0) n++;
  return n;
}

/** Each feed's own service date range. */
export function feedCoverage(doc: Pick<TripsDiffDoc, 'dates'>): {
  base: { min: GtfsDate | null; max: GtfsDate | null };
  new: { min: GtfsDate | null; max: GtfsDate | null };
} {
  const range = (
    side: 0 | 1,
  ): { min: GtfsDate | null; max: GtfsDate | null } => {
    let min: GtfsDate | null = null;
    let max: GtfsDate | null = null;
    for (const [d, v] of Object.entries(doc.dates)) {
      if (v[side] < 0) continue;
      if (min == null || d < min) min = d;
      if (max == null || d > max) max = d;
    }
    return { min, max };
  };
  return { base: range(0), new: range(1) };
}
