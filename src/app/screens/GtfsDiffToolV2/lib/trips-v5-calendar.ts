/**
 * Month and year grids of the Trips v5 calendar
 * (/gtfs-diff-tool-v2/<dataset>/trips-v5): each date with its service
 * period (lib/trips-periods) and its trips added / removed / modified
 * (lib/trips-calendar), laid out like the Service Dates calendar.
 *
 * Pure; type-only imports besides the helpers.
 */

import type { GtfsDate } from './entity-diff-types';
import {
  MONTH_NAMES,
  type MonthCursor,
  cursorOf,
  formatGtfsDate,
  monthGrid,
  parseGtfsDate,
} from './calendar-utils';
import { anchorDates, isCrossPeriod } from './trips-anchor';
import {
  type TripChangeCounts,
  type TripsCalendarDoc,
  changedTrips,
} from './trips-calendar';
import type { DayGroupId } from './trips-v2-days';
import { type ServicePeriod, scheduleLabel } from './trips-periods';

export interface TripsDayCell {
  date: GtfsDate;
  /** Day of the month. */
  day: number;
  /** Null when the date is outside the compared calendar. */
  period: ServicePeriod | null;
  counts: TripChangeCounts | null;
  /** Trips added, removed or modified. */
  changed: number;
  /** The old feed's date it is compared with, when not the same (cross mode). */
  base: GtfsDate | null;
  /** "Sunday schedule" on an exception, else null. */
  note: string | null;
  /** The note in narrow boxes: "Sun sched." */
  shortNote: string | null;
}

const SHORT_GROUP: Record<DayGroupId, string> = {
  weekday: 'Wkday',
  saturday: 'Sat',
  sunday: 'Sun',
};

/** What an exception runs: "Sunday schedule", else "Exception". */
export function exceptionNote(p: ServicePeriod | null): string | null {
  if (p == null || !p.exception) return null;
  return p.runs ? scheduleLabel(p.runs) : 'Exception';
}

/** exceptionNote for narrow boxes: "Sun sched.", "Exc." */
export function exceptionNoteShort(p: ServicePeriod | null): string | null {
  if (p == null || !p.exception) return null;
  return p.runs ? `${SHORT_GROUP[p.runs]} sched.` : 'Exc.';
}

/** One date of the calendar (compared or not). */
export function tripsDayCell(
  calendar: TripsCalendarDoc,
  byDate: Record<GtfsDate, ServicePeriod>,
  date: GtfsDate,
): TripsDayCell {
  const entry = calendar.days[date];
  const period = entry ? (byDate[date] ?? null) : null;
  const counts = entry ? (calendar.counts[entry.s] ?? null) : null;
  return {
    date,
    day: parseGtfsDate(date).day,
    period,
    counts,
    changed: changedTrips(counts ?? undefined),
    base:
      entry && isCrossPeriod(entry.key) ? anchorDates(entry.key).base : null,
    note: exceptionNote(period),
    shortNote: exceptionNoteShort(period),
  };
}

/** A month's cells, Monday first, padded with nulls to whole weeks. */
export function tripsMonthCells(
  calendar: TripsCalendarDoc,
  byDate: Record<GtfsDate, ServicePeriod>,
  cursor: MonthCursor,
): Array<TripsDayCell | null> {
  return monthGrid(cursor)
    .flat()
    .map((d) => (d == null ? null : tripsDayCell(calendar, byDate, d)));
}

/** Days of the cells with trips changed. */
export function changedDays(cells: Array<TripsDayCell | null>): number {
  let n = 0;
  for (const c of cells) if (c != null && c.changed > 0) n++;
  return n;
}

/** Months of a year within first..last (both inclusive), 0-based. */
export function yearMonths(
  year: number,
  first: GtfsDate,
  last: GtfsDate,
): number[] {
  const a = cursorOf(first);
  const b = cursorOf(last);
  return MONTH_NAMES.map((_, m) => m).filter(
    (m) =>
      (year > a.year || (year === a.year && m >= a.month)) &&
      (year < b.year || (year === b.year && m <= b.month)),
  );
}

/** The cursor moved into first..last's years (switching to the year view). */
export function clampToYears(
  cursor: MonthCursor,
  first: GtfsDate,
  last: GtfsDate,
): MonthCursor {
  if (cursor.year < cursorOf(first).year) return cursorOf(first);
  if (cursor.year > cursorOf(last).year) return cursorOf(last);
  return cursor;
}

/** Screen-reader label of a day box. */
export function dayAriaLabel(cell: TripsDayCell): string {
  const date = formatGtfsDate(cell.date);
  const p = cell.period;
  const c = cell.counts;
  if (p == null || c == null) return `${date}: not compared`;
  const changes =
    cell.changed === 0
      ? 'no trip changes'
      : `${c.added} added, ${c.removed} removed, ${c.modified} modified trips`;
  return `${date}: ${p.title}, ${p.schedule}, ${changes}`;
}

const COMPACT = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** 950, "1.2K", "19.3K" */
export function compactCount(n: number): string {
  return COMPACT.format(n);
}
