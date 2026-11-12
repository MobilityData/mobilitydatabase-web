/**
 * Service periods of the Trips v3 page (/gtfs-diff-tool-v2/<dataset>/trips-v3):
 * the dates of a trip calendar (lib/trips-calendar) grouped by the schedule
 * they run, one summary per group instead of one per date.
 *
 * Dates comparing the same pair of service sets have the same changes, so a
 * group is one comparison, split by day type: a Saturday running the Sunday
 * schedule (a public holiday) is its own period, an exception, rather than
 * one more date among the Sundays.
 *
 * Each feed's typical schedule of a day type is the service set most of its
 * dates run; a period is named after the typical schedule it runs, if any.
 * Feeds sharing no dates compare each new-feed date with the old feed's
 * typical same weekday, so only the new feed's schedule names it.
 *
 * Pure; type-only imports besides the helpers.
 */

import type { GtfsDate } from './entity-diff-types';
import { MONTH_NAMES, weekdayIndex } from './calendar-utils';
import { type DayGroupId, dayGroupOf } from './trips-v2-days';
import {
  type TripChangeCounts,
  type TripsCalendarDoc,
  changedTrips,
} from './trips-calendar';

/** Comparisons given a colour of their own; the rest are "Other". */
export const MAX_PERIOD_COLORS = 6;

/** Dates an exception lists rather than giving their range. */
const MAX_LISTED_DATES = 4;

const GROUPS: DayGroupId[] = ['weekday', 'saturday', 'sunday'];

const SCHEDULE_NAME: Record<DayGroupId, string> = {
  weekday: 'weekday schedule',
  saturday: 'Saturday schedule',
  sunday: 'Sunday schedule',
};

const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** Which schedule a feed runs on a date: a day type's typical one, its own, or none. */
type ScheduleRef = DayGroupId | 'own' | 'none';

export interface ServicePeriod {
  /** "<comparison>-<day type>" */
  id: string;
  /** Index into TripsCalendarDoc.counts. */
  s: number;
  group: DayGroupId;
  /** Sorted. */
  dates: GtfsDate[];
  /** "Weekdays", "Fridays", "Saturday" */
  title: string;
  /** "3–31 Aug", "8 Sep 2026 – 18 Jun 2027", "15 Aug" */
  when: string;
  /** "Typical schedule", "Runs the Sunday schedule", "A schedule of its own" */
  schedule: string;
  /** Its day type's typical schedule, in both feeds. */
  typical: boolean;
  /** Runs another day type's typical schedule, in either feed. */
  exception: boolean;
  /** The other day type whose schedule it runs, in both feeds. */
  runs: DayGroupId | null;
  /** Index into the period palette; null when not singled out. */
  color: number | null;
  counts: TripChangeCounts;
  /** Trips added, removed or modified. */
  changed: number;
  /** `changed` out of every trip of the day in either feed, 0–1. */
  share: number;
}

/**
 * The value occurring most often (first seen on ties), if it occurs more
 * than once: a schedule no other date runs isn't typical of anything.
 */
function mostCommon(values: number[]): number | undefined {
  const counts = new Map<number, number>();
  let best: number | undefined;
  let n = 1;
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

/** Trips changed out of every trip of the day in either feed. */
export function changeShare(c: TripChangeCounts): number {
  const trips = c.base + c.added;
  return trips > 0 ? Math.min(1, changedTrips(c) / trips) : 0;
}

function short(d: GtfsDate, year = false): string {
  const s = `${Number(d.slice(6, 8))} ${MONTH_NAMES[Number(d.slice(4, 6)) - 1].slice(0, 3)}`;
  return year ? `${s} ${d.slice(0, 4)}` : s;
}

/** "15 Aug", "3–31 Aug", "28 Aug – 4 Sep", "8 Sep 2026 – 18 Jun 2027" */
export function periodWhen(dates: GtfsDate[]): string {
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === last) return short(first);
  if (first.slice(0, 6) === last.slice(0, 6))
    return `${Number(first.slice(6, 8))}–${short(last)}`;
  const years = first.slice(0, 4) !== last.slice(0, 4);
  return `${short(first, years)} – ${short(last, years)}`;
}

function periodTitle(group: DayGroupId, dates: GtfsDate[]): string {
  const one = dates.length === 1;
  const weekdays = new Set(dates.map(weekdayIndex));
  if (group === 'weekday' && weekdays.size > 1) return 'Weekdays';
  const name = WEEKDAY_NAMES[weekdayIndex(dates[0])];
  return one ? name : `${name}s`;
}

function scheduleName(r: ScheduleRef): string {
  if (r === 'none') return 'no service';
  if (r === 'own') return 'a schedule of its own';
  return SCHEDULE_NAME[r];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function describeSchedule(
  group: DayGroupId,
  before: ScheduleRef,
  after: ScheduleRef,
  cross: boolean,
): Pick<ServicePeriod, 'schedule' | 'typical' | 'exception' | 'runs'> {
  const other = (r: ScheduleRef): boolean =>
    r !== group && r !== 'own' && r !== 'none';
  if (cross || before === after) {
    const r = cross ? after : before;
    if (r === group)
      return {
        schedule: 'Typical schedule',
        typical: true,
        exception: false,
        runs: null,
      };
    if (r === 'own' || r === 'none')
      return {
        schedule: capitalize(scheduleName(r)),
        typical: false,
        exception: false,
        runs: null,
      };
    return {
      schedule: `Runs the ${scheduleName(r)}`,
      typical: false,
      exception: true,
      runs: r,
    };
  }
  const exception = other(before) || other(after);
  if (before === 'none')
    return {
      schedule: `Service added: ${scheduleName(after)}`,
      typical: false,
      exception,
      runs: null,
    };
  if (after === 'none')
    return {
      schedule: `No service anymore (${scheduleName(before)} before)`,
      typical: false,
      exception,
      runs: null,
    };
  return {
    schedule: `${capitalize(scheduleName(before))} before, ${scheduleName(after)} after`,
    typical: false,
    exception,
    runs: null,
  };
}

/** "Weekday schedule", "Sunday schedule" */
export function scheduleLabel(group: DayGroupId): string {
  return capitalize(SCHEDULE_NAME[group]);
}

/**
 * The calendar's dates as service periods: typical schedules first (weekday,
 * Saturday, Sunday), then special periods, longest first, then exceptions by
 * date. The comparisons covering the most days get a colour each
 * (MAX_PERIOD_COLORS); a period's exceptions share its comparison's colour.
 */
export function servicePeriods(calendar: TripsCalendarDoc): ServicePeriod[] {
  const setsOf = (s: number): [number, number] => calendar.sets?.[s] ?? [s, s];
  const cross = calendar.mode === 'cross';
  const dates = Object.keys(calendar.days).sort();

  // Each feed's typical set of each day type.
  const typical = new Map<
    DayGroupId,
    [number | undefined, number | undefined]
  >();
  for (const g of GROUPS) {
    const sets = dates
      .filter((d) => dayGroupOf(d) === g)
      .map((d) => setsOf(calendar.days[d].s));
    typical.set(g, [
      mostCommon(sets.map(([b]) => b).filter((b) => b >= 0)),
      mostCommon(sets.map(([, n]) => n).filter((n) => n >= 0)),
    ]);
  }
  const refOf = (set: number, side: 0 | 1, own: DayGroupId): ScheduleRef => {
    if (set < 0) return 'none';
    if (typical.get(own)?.[side] === set) return own;
    return GROUPS.find((g) => typical.get(g)?.[side] === set) ?? 'own';
  };

  const byKey = new Map<
    string,
    { s: number; group: DayGroupId; dates: GtfsDate[] }
  >();
  for (const d of dates) {
    const { s } = calendar.days[d];
    const group = dayGroupOf(d);
    const id = `${s}-${group}`;
    let p = byKey.get(id);
    if (p == null) byKey.set(id, (p = { s, group, dates: [] }));
    p.dates.push(d);
  }

  // Colours: the comparisons covering the most days, of more than one day.
  const daysOf = new Map<number, number>();
  for (const d of dates) {
    const { s } = calendar.days[d];
    daysOf.set(s, (daysOf.get(s) ?? 0) + 1);
  }
  const colorOf = new Map(
    [...daysOf]
      .filter(([, n]) => n > 1)
      .sort(([sa, a], [sb, b]) => b - a || sa - sb)
      .slice(0, MAX_PERIOD_COLORS)
      .map(([s], i) => [s, i]),
  );

  const periods = [...byKey.entries()].map(([id, p]): ServicePeriod => {
    const [b, n] = setsOf(p.s);
    const counts = calendar.counts[p.s];
    const schedule = describeSchedule(
      p.group,
      refOf(b, 0, p.group),
      refOf(n, 1, p.group),
      cross,
    );
    return {
      id,
      s: p.s,
      group: p.group,
      dates: p.dates,
      title: periodTitle(p.group, p.dates),
      // Exceptions are holidays and the like: their dates, not a range.
      when:
        schedule.exception && p.dates.length <= MAX_LISTED_DATES
          ? p.dates.map((d) => short(d)).join(', ')
          : periodWhen(p.dates),
      ...schedule,
      color: colorOf.get(p.s) ?? null,
      counts,
      changed: changedTrips(counts),
      share: changeShare(counts),
    };
  });
  const rank = (p: ServicePeriod): number =>
    p.typical ? GROUPS.indexOf(p.group) : p.exception ? 4 : 3;
  return periods.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.exception ? 0 : b.dates.length - a.dates.length) ||
      a.dates[0].localeCompare(b.dates[0]),
  );
}

/** The period of each date. */
export function periodByDate(
  periods: ServicePeriod[],
): Record<GtfsDate, ServicePeriod> {
  const out: Record<GtfsDate, ServicePeriod> = {};
  for (const p of periods) for (const d of p.dates) out[d] = p;
  return out;
}

/**
 * The schedule line a period's row needs, or null when its group already
 * says it: typical schedules, and special periods running their own.
 */
export function scheduleNote(p: ServicePeriod): string | null {
  if (p.typical) return null;
  if (p.schedule === capitalize(scheduleName('own'))) return null;
  return p.schedule;
}

/** After "on": "weekdays", "Sundays", "Sat 15 Aug", "weekdays 3–31 Aug". */
export function periodPhrase(p: ServicePeriod): string {
  const title = p.title === 'Weekdays' ? 'weekdays' : p.title;
  if (p.dates.length === 1) {
    const d = p.dates[0];
    return `${WEEKDAY_NAMES[weekdayIndex(d)].slice(0, 3)} ${short(d)}`;
  }
  return p.typical ? title : `${title} ${p.when}`;
}
