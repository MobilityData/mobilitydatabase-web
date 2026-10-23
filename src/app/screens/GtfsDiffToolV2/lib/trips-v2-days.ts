/**
 * Which days the Trips v2 page can compare, and what kind of day each date
 * is (/gtfs-diff-tool-v2/<dataset>/trips-v2).
 *
 * The Weekday / Saturday / Sunday views each compare one representative
 * date: the set of services a feed runs most often on that day of the week.
 * Every other date with service is a special day (a holiday, a summer
 * timetable, a one-off). Special days are grouped by identical schedule,
 * and each feed's schedule is named after the typical day it matches, if
 * any ("runs the Sunday schedule").
 *
 * A special day is flagged when the two feeds treat it differently from
 * each other: e.g. Sunday schedule before, weekday schedule after. When it
 * runs the same typical schedule in both feeds its changes are those of that
 * typical day; when it runs a schedule of its own in both, only comparing
 * it tells.
 *
 * Only for feeds that share dates: across periods (no shared date) a special
 * day of one feed has no counterpart to compare with.
 */

import type { GtfsDate } from './entity-diff-types';
import type { TripsDiffDoc } from './trips-types';
import type { PeriodDayType } from './trips-anchor';
import { formatGtfsDate, weekdayIndex } from './calendar-utils';

export type DayGroupId = 'weekday' | 'saturday' | 'sunday';

export function dayGroupOf(d: GtfsDate): DayGroupId {
  const w = weekdayIndex(d);
  return w === 6 ? 'sunday' : w === 5 ? 'saturday' : 'weekday';
}

/** How one feed runs a date: a typical day's schedule, its own, or nothing. */
export type ScheduleRef =
  | { kind: 'typical'; label: string }
  | { kind: 'special' }
  | { kind: 'none' };

/**
 * different: the feeds treat these days differently from each other;
 * same: both run the same typical schedule, so its changes apply;
 * check: both run a schedule of their own, compare to know.
 */
export type SpecialVerdict = 'different' | 'check' | 'same';

export interface SpecialDayGroup {
  /** "<base set>,<new set>" */
  key: string;
  /** Sorted. */
  dates: GtfsDate[];
  before: ScheduleRef;
  after: ScheduleRef;
  verdict: SpecialVerdict;
  /** "Sunday schedule before, weekday schedule after" */
  title: string;
}

export type DayKind =
  /** Runs its day type's typical schedule in both feeds. */
  | 'typical'
  | SpecialVerdict
  /** Neither feed runs anything. */
  | 'none'
  /** Only one feed covers the date (outside the shared period). */
  | 'one_feed'
  /** No day pattern repeats in the feed: every date has its own services. */
  | 'unique';

export interface DayCatalog {
  /** False when the feeds share no service date. */
  shared: boolean;
  /**
   * False when no day pattern repeats (every date runs its own set of
   * services, as in some generated feeds): typical days are then the
   * busiest day of each type, and schedules can't single out special days.
   */
  repeats: boolean;
  special: SpecialDayGroup[];
  kindOf: Record<GtfsDate, DayKind>;
  /** Special group key of every special date. */
  groupOf: Record<GtfsDate, string>;
  /** Shared period, inclusive. */
  period: { first: GtfsDate; last: GtfsDate } | null;
  sharedDays: number;
  counts: Record<SpecialVerdict, number>;
}

function scheduleName(ref: ScheduleRef): string {
  if (ref.kind === 'typical') return `${ref.label} schedule`;
  if (ref.kind === 'special') return 'a schedule of its own';
  return 'no service';
}

export function specialTitle(before: ScheduleRef, after: ScheduleRef): string {
  if (before.kind === 'none') return `Service added: ${scheduleName(after)}`;
  if (after.kind === 'none')
    return `No service anymore (${scheduleName(before)} before)`;
  if (before.kind === 'typical' && after.kind === 'typical') {
    return before.label === after.label
      ? `Runs the ${scheduleName(before)} in both feeds`
      : `${capitalize(scheduleName(before))} before, ${scheduleName(after)} after`;
  }
  if (before.kind === 'special' && after.kind === 'special')
    return 'A schedule of its own in both feeds';
  return `${capitalize(scheduleName(before))} before, ${scheduleName(after)} after`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function verdictOf(before: ScheduleRef, after: ScheduleRef): SpecialVerdict {
  if (before.kind === 'typical' && after.kind === 'typical')
    return before.label === after.label ? 'same' : 'different';
  if (before.kind === 'special' && after.kind === 'special') return 'check';
  return 'different';
}

const VERDICT_ORDER: Record<SpecialVerdict, number> = {
  different: 0,
  check: 1,
  same: 2,
};

export function dayCatalog(
  doc: Pick<TripsDiffDoc, 'dates' | 'day_types'>,
): DayCatalog {
  const entries = Object.entries(doc.dates).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const kindOf: Record<GtfsDate, DayKind> = {};
  const groupOf: Record<GtfsDate, string> = {};
  const counts: Record<SpecialVerdict, number> = {
    different: 0,
    check: 0,
    same: 0,
  };

  // Shared period: where both feeds have service at least once.
  let first: GtfsDate | null = null;
  let last: GtfsDate | null = null;
  const range = { b: [null, null], n: [null, null] } as Record<
    'b' | 'n',
    [GtfsDate | null, GtfsDate | null]
  >;
  for (const [d, [b, n]] of entries) {
    if (b >= 0) {
      range.b[0] ??= d;
      range.b[1] = d;
    }
    if (n >= 0) {
      range.n[0] ??= d;
      range.n[1] = d;
    }
  }
  if (range.b[0] && range.n[0] && range.b[1] && range.n[1]) {
    first = range.b[0] > range.n[0] ? range.b[0] : range.n[0];
    last = range.b[1] < range.n[1] ? range.b[1] : range.n[1];
    if (first > last) first = last = null;
  }

  // Typical schedule of each day type, and the label of each feed's sets.
  const primary = new Map<DayGroupId, [number, number]>();
  const baseLabel = new Map<number, string>();
  const newLabel = new Map<number, string>();
  for (const t of doc.day_types) {
    if (!t.primary) continue;
    const sig = doc.dates[t.date];
    if (sig == null) continue;
    primary.set(dayGroupOf(t.date), sig);
    if (sig[0] >= 0 && !baseLabel.has(sig[0])) baseLabel.set(sig[0], t.label);
    if (sig[1] >= 0 && !newLabel.has(sig[1])) newLabel.set(sig[1], t.label);
  }
  const ref = (i: number, labels: Map<number, string>): ScheduleRef =>
    i < 0
      ? { kind: 'none' }
      : labels.has(i)
        ? { kind: 'typical', label: labels.get(i) as string }
        : { kind: 'special' };

  const groups = new Map<string, SpecialDayGroup>();
  let sharedDays = 0;
  for (const [d, [b, n]] of entries) {
    if (first == null || last == null || d < first || d > last) {
      kindOf[d] = b < 0 && n < 0 ? 'none' : 'one_feed';
      continue;
    }
    if (b < 0 && n < 0) {
      kindOf[d] = 'none';
      continue;
    }
    sharedDays++;
    const p = primary.get(dayGroupOf(d));
    if (p && p[0] === b && p[1] === n) {
      kindOf[d] = 'typical';
      continue;
    }
    const key = `${b},${n}`;
    let g = groups.get(key);
    if (g == null) {
      const before = ref(b, baseLabel);
      const after = ref(n, newLabel);
      g = {
        key,
        dates: [],
        before,
        after,
        verdict: verdictOf(before, after),
        title: specialTitle(before, after),
      };
      groups.set(key, g);
    }
    g.dates.push(d);
    kindOf[d] = g.verdict;
    groupOf[d] = key;
    counts[g.verdict]++;
  }

  const repeats = doc.day_types.some((t) => t.primary && t.day_count > 1);
  if (!repeats) {
    // Schedules can't single out special days: drop the groups.
    for (const d of Object.keys(groupOf)) {
      kindOf[d] = 'unique';
      delete groupOf[d];
    }
    counts.different = counts.check = counts.same = 0;
  }
  const special = [...groups.values()].sort(
    (a, b) =>
      VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] ||
      a.dates[0].localeCompare(b.dates[0]),
  );
  return {
    shared: primary.size > 0 && first != null,
    repeats,
    special: repeats ? special : [],
    kindOf,
    groupOf,
    period: first && last ? { first, last } : null,
    sharedDays,
    counts,
  };
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function short(d: GtfsDate): string {
  return `${Number(d.slice(6, 8))} ${MONTHS[Number(d.slice(4, 6)) - 1]}`;
}

/** "Fri 25 Dec" */
export function shortDate(d: GtfsDate): string {
  return formatGtfsDate(d).replace(/ \d{4}$/, '');
}

export interface DayDescription {
  /** Container title: "Typical Weekday · Tue 8 Sep 2026" */
  title: string;
  /** Tag on every card about the day: "Weekday · Tue 8 Sep" */
  short: string;
  /** What the day stands for, one or two sentences. */
  note: string;
  kind: 'typical' | 'period' | 'special' | 'date';
}

/** Names and explains a comparison key (a date, or "<base>~<new>"). */
export function describeDay(
  key: string,
  doc: Pick<TripsDiffDoc, 'day_types'>,
  catalog: Pick<DayCatalog, 'kindOf' | 'groupOf' | 'special'>,
  periodTypes: PeriodDayType[],
): DayDescription {
  const sep = key.indexOf('~');
  if (sep >= 0) {
    const b = key.slice(0, sep);
    const n = key.slice(sep + 1);
    const p = periodTypes.find((x) => x.key === key);
    if (p == null)
      return {
        title: `${formatGtfsDate(b)} → ${formatGtfsDate(n)}`,
        short: `${shortDate(b)} → ${shortDate(n)}`,
        note: 'Before-feed trips of the first date against after-feed trips of the second.',
        kind: 'period',
      };
    const lower = p.label.toLowerCase();
    return {
      title: `Typical ${p.label} · ${formatGtfsDate(b)} → ${formatGtfsDate(n)}`,
      short: `${p.label} · ${shortDate(b)} → ${shortDate(n)}`,
      note: `The feeds share no service dates, so this compares the typical ${lower} of each: ${p.base.day_count} of ${p.base.group_count} ${lower}s of the before feed run the schedule of ${shortDate(b)}, and ${p.new.day_count} of ${p.new.group_count} of the after feed that of ${shortDate(n)}.`,
      kind: 'period',
    };
  }

  const typical = doc.day_types.find((t) => t.primary && t.date === key);
  if (typical) {
    const lower = typical.label.toLowerCase();
    return {
      title: `${typical.day_count > 1 ? 'Typical' : 'Busiest'} ${typical.label} · ${formatGtfsDate(key)}`,
      short: `${typical.label} · ${shortDate(key)}`,
      note:
        typical.day_count > 1
          ? `${typical.day_count} of ${typical.group_count} ${lower}s run this same schedule in both feeds, so what is shown here applies to all of them. Holidays and other special days are listed separately.`
          : `No two ${lower}s run the same set of services in this feed, so this is the ${lower} with the most trips. Other ${lower}s may differ: pick them on the calendar.`,
      kind: 'typical',
    };
  }

  const groupKey = catalog.groupOf[key];
  const g = groupKey
    ? catalog.special.find((x) => x.key === groupKey)
    : undefined;
  if (g) {
    const others = g.dates.filter((d) => d !== key);
    const also =
      others.length > 0 ? ` Same schedule on ${datesText(others)}.` : '';
    const verdict =
      g.verdict === 'different'
        ? ' The two feeds run this day differently, so expect changes beyond those of a typical day.'
        : g.verdict === 'same' && g.before.kind === 'typical'
          ? ` Its changes are those of the typical ${g.before.label}.`
          : '';
    return {
      title: `Special day · ${formatGtfsDate(key)}`,
      short: shortDate(key),
      note: `${g.title}.${verdict}${also}`,
      kind: 'special',
    };
  }

  const kind = catalog.kindOf[key];
  const label = doc.day_types.find(
    (t) => t.primary && dayGroupOf(t.date) === dayGroupOf(key),
  )?.label;
  return {
    title: formatGtfsDate(key),
    short: shortDate(key),
    note:
      kind === 'typical' && label
        ? `Runs the typical ${label} schedule in both feeds: the same changes as the ${label} view.`
        : kind === 'one_feed'
          ? 'Only one feed covers this date, so every trip shows as added or removed.'
          : kind === 'none' || kind == null
            ? 'Neither feed runs service on this day.'
            : '',
    kind: 'date',
  };
}

const GROUP_PLURAL: Record<DayGroupId, string> = {
  weekday: 'Weekdays',
  saturday: 'Saturdays',
  sunday: 'Sundays',
};

/** "Mon 7 Sep 2026", "Weekdays · 3 Aug – 31 Aug · 21 days" */
export function whenText(dates: GtfsDate[]): string {
  if (dates.length === 1) return formatGtfsDate(dates[0]);
  const kinds = (['weekday', 'saturday', 'sunday'] as const).filter((k) =>
    dates.some((d) => dayGroupOf(d) === k),
  );
  return `${kinds.map((k) => GROUP_PLURAL[k]).join(' and ')} · ${datesText(dates)}`;
}

/** "25 Dec", "24 Dec, 31 Dec", "1 Jul – 31 Aug · 44 days" */
export function datesText(dates: GtfsDate[], max = 3): string {
  if (dates.length === 0) return '';
  if (dates.length <= max) return dates.map(short).join(', ');
  return `${short(dates[0])} – ${short(dates[dates.length - 1])} · ${dates.length} days`;
}
