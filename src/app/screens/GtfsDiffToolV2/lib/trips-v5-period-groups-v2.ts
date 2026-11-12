/**
 * Rows of the Trips v5 service period table, v2
 * (/gtfs-diff-tool-v2/<dataset>/trips-v5): the periods of lib/trips-periods
 * grouped by day kind (lib/trips-v5-day-kinds) instead of one row each, so
 * the long tail of single-date periods folds away.
 *
 * - Typical periods: one row each, as in v1 (lib/trips-v5-periods).
 * - No service: one summary row, first after them (the publisher's check).
 * - Substitute periods: one row per schedule they run ("Runs the Sunday
 *   schedule"), their dates listed across day types.
 * - Unique schedules over several days, or a single date: one summary row each.
 *
 * Grouped rows show a count when every member agrees, else a "min–max"
 * range; those of several periods expand to one child row per period.
 *
 * Pure; type-only imports besides the helpers.
 */

import type { GtfsDate } from './entity-diff-types';
import { MONTH_NAMES } from './calendar-utils';
import { type ServicePeriod, periodWhen, scheduleNote } from './trips-periods';
import { type DayKind, dayKindOf, dayKindTitle } from './trips-v5-day-kinds';
import { formatChangeShare, periodTitles } from './trips-v5-periods';

export type GroupCountKind = 'added' | 'modified' | 'removed';

export interface GroupCountLabel {
  /** "12", "3–40" */
  label: string;
  /** Every member has none: shown muted. */
  zero: boolean;
}

export interface GroupRowV2 {
  /** Stable React key. */
  key: string;
  kind: DayKind;
  /** "Typical weekday", "Runs the Sunday schedule", "Unique single date schedule" */
  title: string;
  /** A second line under the title, if any. */
  note: string | null;
  /** "7–18 Sep", "19 Sep, 2 Oct", "21 Sep – 5 Oct" */
  window: string;
  /** "10 days", "2 periods · 7 days"; null when the window says it. */
  days: string | null;
  /** "22%", "32–52%" */
  change: string;
  /** Trips per day of each kind, a single value or a range. */
  counts: Record<GroupCountKind, GroupCountLabel>;
  /** Periods the row covers, for highlighting them on the calendar. */
  periodIds: string[];
  /** One row per period, collapsed by default; null for a leaf row. */
  children: GroupRowV2[] | null;
  /** The date a click opens; null for rows that expand instead. */
  openDate: GtfsDate | null;
  /** No service in the new feed: the publisher's first check. */
  flagged: boolean;
}

/** Dates a substitute row lists before falling back to a count. */
const MAX_LISTED_DATES = 4;

/** Dates listed with the count when there are more. */
const LISTED_WITH_COUNT = 3;

const COUNT_KINDS: GroupCountKind[] = ['added', 'modified', 'removed'];

/** Summary rows after the substitute ones, in order. */
const SUMMARY_KINDS: DayKind[] = ['block', 'oneoff'];

function short(d: GtfsDate): string {
  return `${Number(d.slice(6, 8))} ${MONTH_NAMES[Number(d.slice(4, 6)) - 1].slice(0, 3)}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** "22%" when every value formats the same, else "12–32%". */
export function formatShareRange(shares: number[]): string {
  const lo = formatChangeShare(Math.min(...shares));
  const hi = formatChangeShare(Math.max(...shares));
  if (lo === hi) return lo;
  return `${lo.endsWith('%') ? lo.slice(0, -1) : lo}–${hi}`;
}

/** "12" when every value is the same, else "3–40". */
export function formatCountRange(values: number[]): GroupCountLabel {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return {
    label:
      lo === hi
        ? lo.toLocaleString()
        : `${lo.toLocaleString()}–${hi.toLocaleString()}`,
    zero: hi === 0,
  };
}

/** "2 days", "3 periods · 9 days": the periods only when not one per day. */
export function daysLabel(periods: ServicePeriod[]): string {
  const days = periods.reduce((n, p) => n + p.dates.length, 0);
  const label = plural(days, 'day', 'days');
  return periods.length === days
    ? label
    : `${plural(periods.length, 'period', 'periods')} · ${label}`;
}

/** "19 Sep, 2 Oct"; past MAX_LISTED_DATES, the first few and "…". */
export function listedDates(dates: GtfsDate[]): string {
  if (dates.length <= MAX_LISTED_DATES) return dates.map(short).join(', ');
  return `${dates.slice(0, LISTED_WITH_COUNT).map(short).join(', ')}, …`;
}

function sortedDates(periods: ServicePeriod[]): GtfsDate[] {
  return periods.flatMap((p) => p.dates).sort();
}

/** Most trips changed first, then by date. */
function byShare(a: ServicePeriod, b: ServicePeriod): number {
  return b.share - a.share || a.dates[0].localeCompare(b.dates[0]);
}

function aggregates(
  periods: ServicePeriod[],
): Pick<GroupRowV2, 'change' | 'counts' | 'periodIds'> {
  return {
    change: formatShareRange(periods.map((p) => p.share)),
    counts: Object.fromEntries(
      COUNT_KINDS.map((k) => [
        k,
        formatCountRange(periods.map((p) => p.counts[k])),
      ]),
    ) as Record<GroupCountKind, GroupCountLabel>,
    periodIds: periods.map((p) => p.id),
  };
}

/** A row of its own for one period, as in v1. */
function periodRow(
  p: ServicePeriod,
  kind: DayKind,
  title: string,
  note: string | null,
): GroupRowV2 {
  const n = p.dates.length;
  return {
    key: p.id,
    kind,
    title,
    note,
    window: p.when,
    days: n > 1 ? plural(n, 'day', 'days') : null,
    ...aggregates([p]),
    children: null,
    openDate: p.dates[0],
    flagged: kind === 'none',
  };
}

/**
 * The periods as v2 table rows: typical periods, then a no-service summary,
 * then substitute periods by the schedule they run (most days first), then
 * one summary per own-schedule kind. Kinds without periods are left out.
 */
export function periodGroupRowsV2(periods: ServicePeriod[]): GroupRowV2[] {
  const titles = periodTitles(periods);
  const titleOf = (p: ServicePeriod): string => titles.get(p.id) ?? p.title;
  const byKind = new Map<DayKind, ServicePeriod[]>();
  for (const p of periods) {
    const kind = dayKindOf(p);
    const list = byKind.get(kind);
    if (list) list.push(p);
    else byKind.set(kind, [p]);
  }
  const of = (kind: DayKind): ServicePeriod[] => byKind.get(kind) ?? [];

  const children = (
    members: ServicePeriod[],
    kind: DayKind,
    withNote: boolean,
  ): GroupRowV2[] =>
    [...members]
      .sort(byShare)
      .map((p) =>
        periodRow(p, kind, titleOf(p), withNote ? scheduleNote(p) : null),
      );

  const summary = (kind: DayKind, members: ServicePeriod[]): GroupRowV2 => ({
    key: `kind:${kind}`,
    kind,
    title: dayKindTitle(kind),
    note: null,
    window: periodWhen(sortedDates(members)),
    days: daysLabel(members),
    ...aggregates(members),
    children: children(members, kind, true),
    openDate: null,
    flagged: kind === 'none',
  });

  const rows: GroupRowV2[] = of('typical').map((p) =>
    periodRow(p, 'typical', titleOf(p), null),
  );

  const none = of('none');
  if (none.length > 0) rows.push(summary('none', none));

  // Substitutes by the schedule they run, in the periods' order.
  const bySchedule = new Map<string, ServicePeriod[]>();
  for (const p of of('substitute')) {
    const list = bySchedule.get(p.schedule);
    if (list) list.push(p);
    else bySchedule.set(p.schedule, [p]);
  }
  const substitutes = [...bySchedule.entries()]
    .map(([schedule, members]) => ({
      schedule,
      members,
      dates: sortedDates(members),
    }))
    // Most days first, then by date.
    .sort(
      (a, b) =>
        b.dates.length - a.dates.length || a.dates[0].localeCompare(b.dates[0]),
    )
    .map(({ schedule, members, dates }): GroupRowV2 => {
      const several = members.length > 1;
      return {
        key: `substitute:${schedule}`,
        kind: 'substitute',
        title: schedule,
        note: null,
        window: listedDates(dates),
        days:
          dates.length > MAX_LISTED_DATES
            ? plural(dates.length, 'day', 'days')
            : null,
        ...aggregates(members),
        // Days of one period compare the same: any opens them all.
        children: several ? children(members, 'substitute', false) : null,
        openDate: several ? null : dates[0],
        flagged: false,
      };
    });
  rows.push(...substitutes);

  for (const kind of SUMMARY_KINDS) {
    const members = of(kind);
    if (members.length > 0) rows.push(summary(kind, members));
  }
  return rows;
}
