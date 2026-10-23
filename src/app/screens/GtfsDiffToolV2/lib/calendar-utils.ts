/**
 * Pure helpers for the service calendar view. All dates are GTFS
 * YYYYMMDD strings handled in UTC so no timezone shifts creep in.
 */

import type {
  CalendarRow,
  DayChanges,
  DayModifiedEntry,
  DayServiceEntry,
  GtfsDate,
  ServiceDiff,
  ServiceSnapshot,
} from './entity-diff-types';

// ── Constants ──────────────────────────────────────────────────────

export type ChangeKind = 'added' | 'removed' | 'modified';

export const CHANGE_KINDS: ChangeKind[] = ['added', 'removed', 'modified'];

export const CHANGE_COLORS: Record<ChangeKind, string> = {
  added: '#2e7d32',
  removed: '#d32f2f',
  modified: '#ed6c02',
};

export const CHANGE_LABELS: Record<ChangeKind, string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Modified',
};

export const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// ── Date helpers ───────────────────────────────────────────────────

export interface MonthCursor {
  year: number;
  /** 0-based month */
  month: number;
}

export function toGtfsDate(year: number, month: number, day: number): GtfsDate {
  return `${year}${String(month + 1).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

export function parseGtfsDate(d: GtfsDate): {
  year: number;
  month: number;
  day: number;
} {
  return {
    year: +d.slice(0, 4),
    month: +d.slice(4, 6) - 1,
    day: +d.slice(6, 8),
  };
}

export function cursorOf(d: GtfsDate): MonthCursor {
  const { year, month } = parseGtfsDate(d);
  return { year, month };
}

export function shiftMonth(c: MonthCursor, delta: number): MonthCursor {
  const total = c.year * 12 + c.month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(d: GtfsDate): number {
  const { year, month, day } = parseGtfsDate(d);
  return (new Date(Date.UTC(year, month, day)).getUTCDay() + 6) % 7;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Monday-first grid for a month: an array of weeks, each 7 cells,
 * null for padding cells outside the month.
 */
export function monthGrid(c: MonthCursor): Array<Array<GtfsDate | null>> {
  const first = toGtfsDate(c.year, c.month, 1);
  const cells: Array<GtfsDate | null> = new Array(weekdayIndex(first)).fill(
    null,
  );
  for (let d = 1; d <= daysInMonth(c.year, c.month); d++) {
    cells.push(toGtfsDate(c.year, c.month, d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<GtfsDate | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** "Fri 11 Sep 2026" */
export function formatGtfsDate(d: GtfsDate | null | undefined): string {
  if (d == null || d === '') return '—';
  const { year, month, day } = parseGtfsDate(d);
  return `${WEEKDAY_SHORT[weekdayIndex(d)]} ${day} ${MONTH_NAMES[month].slice(0, 3)} ${year}`;
}

/** "Friday, 11 September 2026" */
export function formatGtfsDateLong(d: GtfsDate): string {
  const { year, month, day } = parseGtfsDate(d);
  const weekday = WEEKDAY_KEYS[weekdayIndex(d)];
  return `${weekday[0].toUpperCase()}${weekday.slice(1)}, ${day} ${MONTH_NAMES[month]} ${year}`;
}

export function weekdayFlags(cal: CalendarRow | null | undefined): boolean[] {
  return WEEKDAY_KEYS.map((k) => cal?.[k] === '1');
}

/** Compress weekday flags into "Mon–Fri", "Sat, Sun", … */
export function formatWeekdays(cal: CalendarRow | null | undefined): string {
  const flags = weekdayFlags(cal);
  const runs: string[] = [];
  let i = 0;
  while (i < 7) {
    if (!flags[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < 7 && flags[j + 1]) j++;
    if (j - i >= 2) runs.push(`${WEEKDAY_SHORT[i]}–${WEEKDAY_SHORT[j]}`);
    else for (let k = i; k <= j; k++) runs.push(WEEKDAY_SHORT[k]);
    i = j + 1;
  }
  return runs.length > 0 ? runs.join(', ') : 'Specific dates only';
}

/** "Mon–Fri · Mon 1 Jun 2026 – Fri 3 Jul 2026", or "… · 12 dates". */
export function snapshotPatternText(s: ServiceSnapshot | null): string {
  if (s == null) return '';
  const cal = s.calendar;
  // A calendar.txt row with no weekdays set means calendar_dates.txt drives it.
  const range =
    cal && weekdayFlags(cal).some(Boolean)
      ? `${formatGtfsDate(cal.start_date)} – ${formatGtfsDate(cal.end_date)}`
      : `${s.active_day_count} date${s.active_day_count === 1 ? '' : 's'}`;
  return `${formatWeekdays(cal)} · ${range}`;
}

/** A service's weekly pattern for the services list ("Mon–Fri → Sat, Sun"). */
export function serviceListPattern(s: ServiceDiff): string {
  return s.status === 'modified' &&
    formatWeekdays(s.base?.calendar) !== formatWeekdays(s.new?.calendar)
    ? `${formatWeekdays(s.base?.calendar)} → ${formatWeekdays(s.new?.calendar)}`
    : formatWeekdays((s.new ?? s.base)?.calendar);
}

/** Change counts of one day, per kind. */
export type DayCounts = Record<ChangeKind, number>;

export function countsTotal(c: DayCounts | undefined): number {
  return c == null ? 0 : c.added + c.removed + c.modified;
}

// ── Filters ────────────────────────────────────────────────────────

export type ExceptionFilter = 'all' | '1' | '2' | 'none';

export interface CalendarFilters {
  kinds: ChangeKind[];
  routeIds: string[];
  serviceIds: string[];
  exceptionType: ExceptionFilter;
}

export const DEFAULT_FILTERS: CalendarFilters = {
  kinds: [...CHANGE_KINDS],
  routeIds: [],
  serviceIds: [],
  exceptionType: 'all',
};

export function isFiltered(f: CalendarFilters): boolean {
  return (
    f.kinds.length !== CHANGE_KINDS.length ||
    f.routeIds.length > 0 ||
    f.serviceIds.length > 0 ||
    f.exceptionType !== 'all'
  );
}

/** service_id -> route_ids used by its trips in either feed */
export function buildServiceRouteMap(
  services: ServiceDiff[],
): Map<string, Set<string>> {
  return new Map(
    services.map((s) => [
      s.service_id,
      new Set([...s.route_ids.base, ...s.route_ids.new]),
    ]),
  );
}

export function serviceMatches(
  serviceId: string,
  filters: CalendarFilters,
  serviceRoutes: Map<string, Set<string>>,
): boolean {
  if (filters.serviceIds.length > 0 && !filters.serviceIds.includes(serviceId))
    return false;
  if (filters.routeIds.length > 0) {
    const routes = serviceRoutes.get(serviceId);
    if (!filters.routeIds.some((r) => routes?.has(r))) return false;
  }
  return true;
}

function entryMatches(
  e: DayServiceEntry,
  filters: CalendarFilters,
  serviceRoutes: Map<string, Set<string>>,
): boolean {
  if (!serviceMatches(e.service_id, filters, serviceRoutes)) return false;
  switch (filters.exceptionType) {
    case 'all':
      return true;
    case 'none':
      return e.exception == null;
    default:
      return (
        e.exception?.base === filters.exceptionType ||
        e.exception?.new === filters.exceptionType
      );
  }
}

export function filterDay(
  day: DayChanges,
  filters: CalendarFilters,
  serviceRoutes: Map<string, Set<string>>,
): DayChanges {
  const keep = <T extends DayServiceEntry>(kind: ChangeKind, list: T[]): T[] =>
    filters.kinds.includes(kind)
      ? list.filter((e) => entryMatches(e, filters, serviceRoutes))
      : [];
  return {
    added: keep('added', day.added),
    removed: keep('removed', day.removed),
    modified: keep<DayModifiedEntry>('modified', day.modified),
  };
}

export function dayTotal(day: DayChanges | undefined): number {
  return day == null
    ? 0
    : day.added.length + day.removed.length + day.modified.length;
}

export function filterDays(
  days: Record<GtfsDate, DayChanges>,
  filters: CalendarFilters,
  serviceRoutes: Map<string, Set<string>>,
): Record<GtfsDate, DayChanges> {
  const out: Record<GtfsDate, DayChanges> = {};
  for (const [d, day] of Object.entries(days)) {
    const filtered = filterDay(day, filters, serviceRoutes);
    if (dayTotal(filtered) > 0) out[d] = filtered;
  }
  return out;
}

// ── Human-readable explanations ────────────────────────────────────

export function exceptionLabel(t: string | null | undefined): string {
  if (t === '1') return 'service added (type 1)';
  if (t === '2') return 'service removed (type 2)';
  return 'none';
}

export function modifiedEntryText(e: DayModifiedEntry, date: GtfsDate): string {
  const weekday = WEEKDAY_SHORT[weekdayIndex(date)];
  const verb =
    e.change === 'gained'
      ? 'Now runs'
      : e.change === 'lost'
        ? 'No longer runs'
        : 'Still the same activity';
  switch (e.reason.code) {
    case 'exception_added':
      return `${verb}: ${e.exception?.new === '2' ? 'no-service' : 'extra service'} exception added`;
    case 'exception_removed':
      return `${verb}: ${e.exception?.base === '2' ? 'no-service' : 'extra service'} exception removed`;
    case 'exception_type_changed':
      return `${verb}: exception type changed (${e.reason.detail.replace('exception_type ', '')})`;
    case 'calendar_added':
      return `${verb}: regular weekly pattern added`;
    case 'calendar_removed':
      return `${verb}: regular weekly pattern removed`;
    case 'period_extended':
      return `${verb}: service period extended`;
    case 'period_shortened':
      return `${verb}: service period shortened`;
    case 'weekday_added':
      return `${verb}: ${weekday} added to regular pattern`;
    case 'weekday_removed':
      return `${verb}: ${weekday} removed from regular pattern`;
    default:
      return verb;
  }
}

/** All change dates in ascending order — used for prev/next navigation. */
export function sortedDates(days: Record<GtfsDate, DayChanges>): GtfsDate[] {
  return Object.keys(days).sort();
}
