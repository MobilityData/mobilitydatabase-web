/**
 * The Service Dates page's services list, day popup and service page
 * (/gtfs-diff-tool-v2/<dataset>/calendar/<service_id>): links, the route
 * preview, a service's dates in each feed and the day popup's categories
 * and filters.
 *
 * Pure; type-only imports besides calendar-utils and report.
 */

import {
  type MonthCursor,
  cursorOf,
  formatGtfsDate,
  shiftMonth,
  weekdayFlags,
  weekdayIndex,
} from './calendar-utils';
import type { DayEntryRow } from './calendar-query';
import type {
  DayException,
  DayModifiedEntry,
  GtfsDate,
  RouteInfo,
  ServiceDiff,
  ServiceSnapshot,
} from './entity-diff-types';
import { sectionSlug } from './report';
import { SERVICES_PAGE } from './sections';

// ── Links ──────────────────────────────────────────────────────────

/** Query parameter of the day whose popup is open: ?day=20261224. */
export const DAY_PARAM = 'day';
/** Query parameter filtering the calendar on one service: ?service=WK. */
export const SERVICE_PARAM = 'service';

/** The Service Dates page, with a day open or filtered on a service. */
export function calendarPageHref(
  datasetId: string,
  opts: { day?: GtfsDate; service?: string } = {},
): string {
  const params = new URLSearchParams();
  if (opts.day) params.set(DAY_PARAM, opts.day);
  if (opts.service) params.set(SERVICE_PARAM, opts.service);
  const qs = params.toString();
  return `/gtfs-diff-tool-v2/${datasetId}/${sectionSlug(SERVICES_PAGE)}${qs ? `?${qs}` : ''}`;
}

/** A service's page. */
export function serviceHref(datasetId: string, serviceId: string): string {
  return `/gtfs-diff-tool-v2/${datasetId}/${sectionSlug(SERVICES_PAGE)}/${encodeURIComponent(serviceId)}`;
}

// ── Routes ─────────────────────────────────────────────────────────

/** Routes a list row shows before "and +N". */
export const ROUTE_PREVIEW = 5;

export function routePreview<T>(
  ids: T[],
  max: number = ROUTE_PREVIEW,
): { shown: T[]; more: number } {
  // "and +1" saves no room over the chip itself.
  if (ids.length <= max + 1) return { shown: ids, more: 0 };
  return { shown: ids.slice(0, max), more: ids.length - max };
}

export type RoutePresence = 'both' | 'base' | 'new';

/** A service's routes, each with the feeds whose trips use it on the service. */
export function serviceRoutes(
  s: Pick<ServiceDiff, 'route_ids'>,
  routes: Record<string, RouteInfo>,
): Array<{ routeId: string; presence: RoutePresence }> {
  const base = new Set(s.route_ids.base);
  const next = new Set(s.route_ids.new);
  const name = (id: string): string => routes[id]?.short_name || id;
  return [...new Set([...base, ...next])]
    .sort((a, b) =>
      name(a).localeCompare(name(b), undefined, { numeric: true }),
    )
    .map((routeId) => ({
      routeId,
      presence:
        base.has(routeId) && next.has(routeId)
          ? 'both'
          : base.has(routeId)
            ? 'base'
            : 'new',
    }));
}

// ── A service's dates ──────────────────────────────────────────────

function addDays(d: GtfsDate, n: number): GtfsDate {
  const t = new Date(
    Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8) + n),
  );
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, '0')}${String(t.getUTCDate()).padStart(2, '0')}`;
}

/**
 * The dates a feed runs a service on: its calendar.txt weekdays between
 * start_date and end_date, plus exception_type 1, minus 2 (the build's
 * activeDates).
 */
export function activeDates(s: ServiceSnapshot | null): Set<GtfsDate> {
  const dates = new Set<GtfsDate>();
  if (s == null) return dates;
  const cal = s.calendar;
  if (cal && /^\d{8}$/.test(cal.start_date) && /^\d{8}$/.test(cal.end_date)) {
    const flags = weekdayFlags(cal);
    for (let d = cal.start_date; d <= cal.end_date; d = addDays(d, 1))
      if (flags[weekdayIndex(d)]) dates.add(d);
  }
  for (const e of s.exceptions) {
    if (e.exception_type === '1') dates.add(e.date);
    else if (e.exception_type === '2') dates.delete(e.date);
  }
  return dates;
}

/**
 * What a date is for a service: runs in both feeds, gained or lost (kept
 * service), every date of an added or removed one, or only its exception
 * changed.
 */
export type ServiceDayState =
  | 'runs'
  | 'gained'
  | 'lost'
  | 'added'
  | 'removed'
  | 'exception';

export interface ServiceDay {
  date: GtfsDate;
  state: ServiceDayState;
  /** Its calendar_dates.txt exception in each feed, if any. */
  exception: DayException | null;
}

/** Every date the service runs on in either feed, or whose exception changed. */
export function serviceDays(s: ServiceDiff): Map<GtfsDate, ServiceDay> {
  const b = activeDates(s.base);
  const n = activeDates(s.new);
  const exc = new Map<GtfsDate, DayException>();
  for (const e of s.base?.exceptions ?? [])
    exc.set(e.date, { base: e.exception_type, new: null });
  for (const e of s.new?.exceptions ?? [])
    exc.set(e.date, {
      base: exc.get(e.date)?.base ?? null,
      new: e.exception_type,
    });
  const out = new Map<GtfsDate, ServiceDay>();
  const put = (date: GtfsDate, state: ServiceDayState): void => {
    out.set(date, { date, state, exception: exc.get(date) ?? null });
  };
  if (s.status === 'added') for (const d of n) put(d, 'added');
  else if (s.status === 'deleted') for (const d of b) put(d, 'removed');
  else {
    for (const d of b) put(d, n.has(d) ? 'runs' : 'lost');
    for (const d of n) if (!b.has(d)) put(d, 'gained');
    // Exceptions that changed without changing whether the service runs.
    for (const [d, e] of exc)
      if (e.base !== e.new && b.has(d) === n.has(d)) put(d, 'exception');
  }
  return new Map([...out].sort(([a], [z]) => (a < z ? -1 : 1)));
}

/** Every month from the first date's to the last's. */
export function monthsBetween(
  first: GtfsDate | null,
  last: GtfsDate | null,
): MonthCursor[] {
  if (first == null || last == null) return [];
  const end = cursorOf(last);
  const out: MonthCursor[] = [];
  for (
    let c = cursorOf(first);
    c.year * 12 + c.month <= end.year * 12 + end.month;
    c = shiftMonth(c, 1)
  )
    out.push(c);
  return out;
}

// ── Day popup ──────────────────────────────────────────────────────

/** How a service changes on a day. */
export type DayChangeCategory =
  | 'added'
  | 'removed'
  | 'gained'
  | 'lost'
  | 'exception_only';

export const DAY_CATEGORY_ORDER: DayChangeCategory[] = [
  'added',
  'removed',
  'gained',
  'lost',
  'exception_only',
];

export const DAY_CATEGORY_LABELS: Record<DayChangeCategory, string> = {
  added: 'New service',
  removed: 'Service removed',
  gained: 'Now runs',
  lost: 'No longer runs',
  exception_only: 'Exception only',
};

export function dayEntryCategory(r: DayEntryRow): DayChangeCategory {
  if (r.kind !== 'modified') return r.kind;
  return (r.entry as DayModifiedEntry).change;
}

export interface DayEntryFilters {
  /** Substring of the service_id or a route's names (case-insensitive). */
  search: string;
  /** Empty: every category. */
  categories: DayChangeCategory[];
}

export const NO_DAY_ENTRY_FILTERS: DayEntryFilters = {
  search: '',
  categories: [],
};

export function isFilteringEntries(f: DayEntryFilters): boolean {
  return f.search.trim() !== '' || f.categories.length > 0;
}

export function filterDayEntries(
  rows: DayEntryRow[],
  f: DayEntryFilters,
  routes: Record<string, RouteInfo>,
): DayEntryRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.categories.length > 0 && !f.categories.includes(dayEntryCategory(r)))
      return false;
    if (q === '') return true;
    if (r.entry.service_id.toLowerCase().includes(q)) return true;
    return r.routeIds.some((id) => {
      const info = routes[id];
      return [id, info?.short_name, info?.long_name].some((t) =>
        t?.toLowerCase().includes(q),
      );
    });
  });
}

/** Changes per category on a day, in DAY_CATEGORY_ORDER; zeros left out. */
export function dayEntryCategoryCounts(
  rows: DayEntryRow[],
): Array<{ category: DayChangeCategory; count: number }> {
  const n = new Map<DayChangeCategory, number>();
  for (const r of rows) {
    const c = dayEntryCategory(r);
    n.set(c, (n.get(c) ?? 0) + 1);
  }
  return DAY_CATEGORY_ORDER.filter((c) => n.has(c)).map((c) => ({
    category: c,
    count: n.get(c) ?? 0,
  }));
}

/** "Mon 1 Jun 2026 – Fri 3 Jul 2026", or "12 specific dates". */
export function periodText(s: ServiceSnapshot | null): string {
  if (s == null) return '—';
  if (s.calendar && weekdayFlags(s.calendar).some(Boolean))
    return `${formatGtfsDate(s.calendar.start_date)} – ${formatGtfsDate(s.calendar.end_date)}`;
  return `${s.active_day_count} specific date${s.active_day_count === 1 ? '' : 's'}`;
}
