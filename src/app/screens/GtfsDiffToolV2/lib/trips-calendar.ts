/**
 * Trips added / removed / modified on every date, for the Trips v3 calendar
 * and its weekday table (/gtfs-diff-tool-v2/<dataset>/trips-v3).
 *
 * Built by scripts/generate-gtfs-trips-calendar.mjs into trips-calendar.json:
 * comparing every date in the browser would mean matching every day's trips,
 * so it is done once at build time. Dates running the same pair of service
 * sets give the same result and are compared once.
 *
 *   - Feeds sharing dates: each date of the shared period, both feeds' trips
 *     of that date.
 *   - Feeds sharing none (a summer feed against a fall one): each date of the
 *     new feed against the old feed's typical day of the same weekday, the
 *     comparison key being "<base date>~<new date>" (lib/trips-anchor).
 *
 * "Modified" counts rider-facing changes only (stop pattern, running time,
 * shift, pickup/drop-off, attributes), not trips that only got a new
 * trip_id, and not time changes within the minor threshold.
 *
 * Pure; type-only imports besides the helpers: the Node build imports it.
 */

import type { GtfsDate } from './entity-diff-types';
import type { TripClass, TripsDiffDoc } from './trips-types';
import { type AnchorKey, anchorKey } from './trips-anchor';
import { weekdayIndex } from './calendar-utils';

export const TRIPS_CALENDAR_FILE = 'trips-calendar.json';

/** Primary classes counted as "modified" (rider-facing). */
export const MODIFIED_CLASSES: TripClass[] = [
  'pattern',
  'running_time',
  'shifted',
  'rules',
  'attributes',
];

export interface TripChangeCounts {
  added: number;
  removed: number;
  /** Rider-facing changes of matched trips. */
  modified: number;
  /** Matched trips whose only change is an identifier. */
  id_only: number;
  /** Trips running that day in each feed. */
  base: number;
  new: number;
}

export interface WeekdaySummary {
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  /** The typical date: the most common comparison of that weekday. */
  date: GtfsDate;
  key: AnchorKey;
  /** Index into TripsCalendarDoc.counts. */
  s: number;
  /** Dates of that weekday with the typical comparison, out of `of`. */
  days: number;
  of: number;
  /**
   * No comparison repeats on that weekday (every date runs its own
   * services): `date` is the busiest one instead of the most common.
   */
  busiest?: boolean;
}

export interface TripsCalendarDoc {
  schema: 1;
  /** shared: feeds share dates; cross: new-feed dates vs typical old days. */
  mode: 'shared' | 'cross';
  first: GtfsDate;
  last: GtfsDate;
  /** Date -> its comparison key and index into `counts`. */
  days: Record<GtfsDate, { key: AnchorKey; s: number }>;
  /** One entry per distinct comparison. */
  counts: TripChangeCounts[];
  weekdays: WeekdaySummary[];
}

/** A distinct comparison: one base and one new service set (-1 = none). */
export interface PlannedComparison {
  base: number;
  new: number;
  /** A date it stands for, to load it in the browser. */
  key: AnchorKey;
}

export interface CalendarPlan {
  mode: 'shared' | 'cross';
  first: GtfsDate;
  last: GtfsDate;
  days: Record<GtfsDate, { key: AnchorKey; s: number }>;
  comparisons: PlannedComparison[];
  weekdays: WeekdaySummary[];
}

function middle<T>(list: T[]): T {
  return list[Math.floor(list.length / 2)];
}

/** The value occurring most often (first seen on ties). */
function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  let n = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > n) {
      best = v;
      n = c;
    }
  }
  return best;
}

/** Which comparisons a calendar needs, from the trips index alone. */
export function planTripsCalendar(
  index: Pick<TripsDiffDoc, 'dates'>,
): CalendarPlan | null {
  const entries = Object.entries(index.dates).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const shared = entries.some(([, [b, n]]) => b >= 0 && n >= 0);
  const sigIndex = new Map<string, number>();
  const comparisons: PlannedComparison[] = [];
  const days: CalendarPlan['days'] = {};
  const add = (date: GtfsDate, key: AnchorKey, b: number, n: number): void => {
    const sig = `${b},${n}`;
    let s = sigIndex.get(sig);
    if (s == null) {
      s = comparisons.length;
      sigIndex.set(sig, s);
      comparisons.push({ base: b, new: n, key });
    }
    days[date] = { key, s };
  };

  let first: GtfsDate | null = null;
  let last: GtfsDate | null = null;
  if (shared) {
    // The period both feeds publish service in.
    const span = (side: 0 | 1): [GtfsDate, GtfsDate] | null => {
      const ds = entries.filter(([, v]) => v[side] >= 0).map(([d]) => d);
      return ds.length ? [ds[0], ds[ds.length - 1]] : null;
    };
    const b = span(0);
    const n = span(1);
    if (!b || !n) return null;
    first = b[0] > n[0] ? b[0] : n[0];
    last = b[1] < n[1] ? b[1] : n[1];
    for (const [d, [bs, ns]] of entries)
      if (d >= first && d <= last && (bs >= 0 || ns >= 0)) add(d, d, bs, ns);
  } else {
    // The old feed's typical day of each weekday: its most common set.
    const typical = new Map<number, { date: GtfsDate; set: number }>();
    for (let wd = 0; wd < 7; wd++) {
      const sameDay = entries.filter(
        ([d, [bs]]) => bs >= 0 && weekdayIndex(d) === wd,
      );
      const set = mostCommon(sameDay.map(([, [bs]]) => bs));
      if (set == null) continue;
      const dates = sameDay.filter(([, [bs]]) => bs === set).map(([d]) => d);
      typical.set(wd, { date: middle(dates), set });
    }
    const newDates = entries.filter(([, [, ns]]) => ns >= 0);
    if (newDates.length === 0) return null;
    first = newDates[0][0];
    last = newDates[newDates.length - 1][0];
    for (const [d, [, ns]] of newDates) {
      const t = typical.get(weekdayIndex(d));
      add(d, t ? anchorKey(t.date, d) : d, t?.set ?? -1, ns);
    }
  }

  const weekdays: WeekdaySummary[] = [];
  for (let wd = 0; wd < 7; wd++) {
    const dates = Object.keys(days)
      .filter((d) => weekdayIndex(d) === wd)
      .sort();
    const s = mostCommon(dates.map((d) => days[d].s));
    if (s == null) continue;
    const withS = dates.filter((d) => days[d].s === s);
    const date = middle(withS);
    weekdays.push({
      weekday: wd,
      date,
      key: days[date].key,
      s,
      days: withS.length,
      of: dates.length,
    });
  }
  return {
    mode: shared ? 'shared' : 'cross',
    first,
    last,
    days,
    comparisons,
    weekdays,
  };
}

/**
 * The plan's weekdays, with counts known: a weekday whose most common
 * comparison covers a single date (nothing repeats, as in feeds giving each
 * date its own services) is represented by its busiest date instead.
 */
export function typicalWeekdays(
  plan: Pick<CalendarPlan, 'days' | 'weekdays'>,
  counts: TripChangeCounts[],
): WeekdaySummary[] {
  return plan.weekdays.map((w) => {
    if (w.days > 1) return w;
    const trips = (d: GtfsDate): number => {
      const c = counts[plan.days[d].s];
      return c ? c.base + c.new : 0;
    };
    const dates = Object.keys(plan.days)
      .filter((d) => weekdayIndex(d) === w.weekday)
      .sort();
    const date = dates.reduce((a, b) => (trips(b) > trips(a) ? b : a));
    const { key, s } = plan.days[date];
    return { ...w, date, key, s, days: 1, busiest: dates.length > 1 };
  });
}

/** One day's counts from its class counts (non-minor primary classes). */
export function changeCounts(
  classCounts: Record<TripClass, number>,
  trips: { base: number; new: number },
): TripChangeCounts {
  return {
    added: classCounts.added,
    removed: classCounts.removed,
    modified: MODIFIED_CLASSES.reduce((n, c) => n + classCounts[c], 0),
    id_only: classCounts.restructured,
    base: trips.base,
    new: trips.new,
  };
}

export function emptyCounts(): TripChangeCounts {
  return { added: 0, removed: 0, modified: 0, id_only: 0, base: 0, new: 0 };
}

export function addCounts(a: TripChangeCounts, b: TripChangeCounts): void {
  a.added += b.added;
  a.removed += b.removed;
  a.modified += b.modified;
  a.id_only += b.id_only;
  a.base += b.base;
  a.new += b.new;
}

export function changedTrips(c: TripChangeCounts | undefined): number {
  return c ? c.added + c.removed + c.modified : 0;
}

/** Column order of the weekday table: Saturday first. */
export const WEEKDAY_TABLE_ORDER = [5, 6, 0, 1, 2, 3, 4];
