/**
 * SQL for the service calendar page: DuckDB over the calendar analysis
 * tables (analysis/services.parquet, analysis/service_dates.parquet, written by
 * scripts/lib/calendar-tables.mjs) and the calendar raw tables
 * (raw/calendar.parquet, raw/calendar_dates.parquet), which hold the
 * services' rows (lib/calendar-rows). Pure, so it is unit-tested; the
 * filters mean the same as calendar-utils' filterDay / serviceMatches
 * applied to the full lists.
 *
 * User input only goes in as bound parameters; view names are checked.
 */

import {
  CHANGE_KINDS,
  type CalendarFilters,
  type ChangeKind,
  type DayCounts,
  serviceListPattern,
  snapshotPatternText,
} from './calendar-utils';
import {
  CALENDAR_FIELDS,
  calendarSides,
  jsonList,
  patternSnapshot,
  reasonDetail,
  serviceSide,
} from './calendar-rows';
import type {
  DayException,
  DayModifiedEntry,
  DayReasonCode,
  DayServiceEntry,
  DiffType,
  GtfsDate,
} from './entity-diff-types';
import type { SqlQuery } from './map-table-query';
import { normalizeText } from './stops-utils';

const IDENT = /^[A-Za-z0-9_]+$/;

function view(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Bad view: ${name}`);
  return `"${name}"`;
}

function page(offset: number, limit: number): string {
  const off = Math.max(0, Math.floor(offset));
  const lim = Math.max(1, Math.min(1000, Math.floor(limit)));
  return `LIMIT ${lim} OFFSET ${off}`;
}

/** Lists are bound as one U+001F-joined string. */
const SEP = '\u001f';
const listParam = (ids: string[]): string => ids.join(SEP);

/**
 * The calendar's views: its two analysis tables, and the calendar.txt and
 * calendar_dates.txt raw tables (null when the feeds have no such file).
 */
export interface CalendarViews {
  days: string;
  services: string;
  calendar: string | null;
  dates: string | null;
}

// ── Raw rows ───────────────────────────────────────────────────────

const FIELD_COLUMNS = CALENDAR_FIELDS.flatMap((f) => [`b_${f}`, `n_${f}`]);

/** A service's calendar.txt row per service_id (lib/calendar-rows calendarSides). */
export function calendarRowsSql(rawView: string | null): string {
  if (rawView == null)
    return `SELECT NULL::VARCHAR AS service_id, NULL::VARCHAR AS cal_action, ${FIELD_COLUMNS.map(
      (c) => `NULL::VARCHAR AS ${c}`,
    ).join(', ')} WHERE false`;
  return `SELECT trip_key AS service_id, action AS cal_action, ${FIELD_COLUMNS.join(', ')} FROM ${view(rawView)}`;
}

/**
 * A service's calendar_dates.txt rows (lib/calendar-rows exceptionSides),
 * with the exception type in effect in each feed (exc_base / exc_new).
 */
export function exceptionRowsSql(rawView: string | null): string {
  if (rawView == null)
    return `SELECT NULL::VARCHAR AS service_id, NULL::VARCHAR AS date, NULL::VARCHAR AS exc_action,
      NULL::VARCHAR AS b_exception_type, NULL::VARCHAR AS n_exception_type,
      NULL::VARCHAR AS exc_base, NULL::VARCHAR AS exc_new WHERE false`;
  return `SELECT trip_key AS service_id, coalesce(n_date, b_date) AS date, action AS exc_action,
      b_exception_type, n_exception_type,
      CASE action WHEN 'added' THEN NULL WHEN 'unchanged' THEN coalesce(b_exception_type, n_exception_type)
        ELSE b_exception_type END AS exc_base,
      CASE action WHEN 'deleted' THEN NULL ELSE n_exception_type END AS exc_new
    FROM ${view(rawView)}`;
}

/** Route ids of a services row, both feeds. */
const ROUTES_SQL = 'list_concat(route_ids_base, route_ids_new)';

function routesClause(
  servicesView: string,
  routeIds: string[],
  column: string,
  parts: string[],
  params: unknown[],
): void {
  if (routeIds.length === 0) return;
  parts.push(
    `${column} IN (SELECT service_id FROM ${view(servicesView)} WHERE list_has_any(${ROUTES_SQL}, string_split(?, chr(31))))`,
  );
  params.push(listParam(routeIds));
}

function idsClause(
  ids: string[],
  column: string,
  parts: string[],
  params: unknown[],
): void {
  if (ids.length === 0) return;
  parts.push(`${column} IN (${ids.map(() => '?').join(', ')})`);
  params.push(...ids);
}

function where(parts: string[]): string {
  return parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '';
}

// ── Service-day changes ────────────────────────────────────────────

/** A day row's kind: added / removed services, else a kept service's change. */
const KIND_SQL = `CASE WHEN change IN ('added', 'removed') THEN change ELSE 'modified' END`;
const KIND_ORDER = `CASE d.kind WHEN 'added' THEN 0 WHEN 'removed' THEN 1 ELSE 2 END`;

/**
 * days.parquet with each row's kind (`d`) under the calendar filters, joined
 * to the service's exception that day (`e`) when `withExceptions` or the
 * exception filter needs it. `withKinds: false` for per-kind counts.
 */
function filteredDays(
  v: CalendarViews,
  f: CalendarFilters,
  { withKinds = true, withExceptions = false } = {},
): { from: string; parts: string[]; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (withKinds && f.kinds.length > 0) {
    parts.push(`d.kind IN (${f.kinds.map(() => '?').join(', ')})`);
    params.push(...f.kinds);
  }
  idsClause(f.serviceIds, 'd.service_id', parts, params);
  routesClause(v.services, f.routeIds, 'd.service_id', parts, params);
  if (f.exceptionType === 'none')
    parts.push('e.exc_base IS NULL AND e.exc_new IS NULL');
  else if (f.exceptionType !== 'all') {
    parts.push('(e.exc_base = ? OR e.exc_new = ?)');
    params.push(f.exceptionType, f.exceptionType);
  }
  const days = `(SELECT date, service_id, change, reason_code, ${KIND_SQL} AS kind FROM ${view(v.days)}) d`;
  const join =
    withExceptions || f.exceptionType !== 'all'
      ? ` LEFT JOIN (${exceptionRowsSql(v.dates)}) e ON e.service_id = d.service_id AND e.date = d.date`
      : '';
  return { from: `${days}${join}`, parts, params };
}

/** Changes per date and kind under every filter (month / year views). */
export function dayCountsQuery(v: CalendarViews, f: CalendarFilters): SqlQuery {
  const q = filteredDays(v, f);
  return {
    sql: `SELECT d.date, d.kind, count(*)::INTEGER AS n FROM ${q.from} ${where(q.parts)} GROUP BY d.date, d.kind ORDER BY d.date`,
    params: q.params,
  };
}

/** Changes per kind under every filter but the kind one (filter chips). */
export function kindCountsQuery(
  v: CalendarViews,
  f: CalendarFilters,
): SqlQuery {
  const q = filteredDays(v, f, { withKinds: false });
  return {
    sql: `SELECT d.kind, count(*)::INTEGER AS n FROM ${q.from} ${where(q.parts)} GROUP BY d.kind`,
    params: q.params,
  };
}

/** Every change on a date, unfiltered. */
export function dayTotalQuery(daysView: string, date: GtfsDate): SqlQuery {
  return {
    sql: `SELECT count(*)::INTEGER AS n FROM ${view(daysView)} WHERE date = ?`,
    params: [date],
  };
}

/**
 * One date's changes under the filters, with what the dialog shows of each
 * service: its exception that day, routes, trips and calendar.txt rows.
 */
export function dayEntriesQuery(
  v: CalendarViews,
  date: GtfsDate,
  f: CalendarFilters,
): SqlQuery {
  const q = filteredDays(v, f, { withExceptions: true });
  return {
    sql: `SELECT d.date, d.kind, d.change, d.service_id, d.reason_code, e.exc_base, e.exc_new,
        s.status, to_json(s.route_ids_base) AS route_ids_base, to_json(s.route_ids_new) AS route_ids_new,
        s.trips_base, s.trips_new, s.active_days_base, s.active_days_new,
        s.first_date_base, s.last_date_base, s.first_date_new, s.last_date_new,
        c.* EXCLUDE (service_id)
      FROM ${q.from}
      LEFT JOIN ${view(v.services)} s ON s.service_id = d.service_id
      LEFT JOIN (${calendarRowsSql(v.calendar)}) c ON c.service_id = d.service_id
      ${where([...q.parts, 'd.date = ?'])}
      ORDER BY ${KIND_ORDER}, d.service_id`,
    params: [...q.params, date],
  };
}

/** Rows of dayCountsQuery -> date -> counts per kind. */
export function toDayCounts(
  rows: Array<Record<string, unknown>>,
): Record<GtfsDate, DayCounts> {
  const out: Record<GtfsDate, DayCounts> = {};
  for (const r of rows) {
    const d = String(r.date);
    out[d] ??= { added: 0, removed: 0, modified: 0 };
    out[d][String(r.kind) as ChangeKind] = Number(r.n);
  }
  return out;
}

/** A change on a date, as the day dialog lists it. */
export interface DayEntryRow {
  kind: ChangeKind;
  entry: DayServiceEntry | DayModifiedEntry;
  routeIds: string[];
  patternBase: string;
  patternNew: string;
  trips: { base: number; new: number };
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Route ids of a row selecting to_json(route_ids_base / _new), both feeds. */
function rowRouteIds(r: Record<string, unknown>): string[] {
  return [
    ...new Set([...jsonList(r.route_ids_base), ...jsonList(r.route_ids_new)]),
  ].sort();
}

export function toDayEntryRow(r: Record<string, unknown>): DayEntryRow {
  const excBase = str(r.exc_base) as DayException['base'];
  const excNew = str(r.exc_new) as DayException['new'];
  const exception: DayException | null =
    excBase != null || excNew != null ? { base: excBase, new: excNew } : null;
  const base: DayServiceEntry = { service_id: String(r.service_id), exception };
  const kind = String(r.kind) as ChangeKind;
  const cal = calendarSides(r);
  const code = (str(r.reason_code) ?? '') as DayReasonCode;
  const entry: DayServiceEntry | DayModifiedEntry =
    kind === 'modified'
      ? {
          ...base,
          change: (str(r.change) ??
            'exception_only') as DayModifiedEntry['change'],
          reason: {
            code,
            detail: reasonDetail(code, String(r.date), cal, exception),
          },
        }
      : base;
  return {
    kind,
    entry,
    routeIds: rowRouteIds(r),
    patternBase: snapshotPatternText(
      patternSnapshot(cal.base, serviceSide(r, 'base')),
    ),
    patternNew: snapshotPatternText(
      patternSnapshot(cal.new, serviceSide(r, 'new')),
    ),
    trips: { base: Number(r.trips_base ?? 0), new: Number(r.trips_new ?? 0) },
  };
}

// ── Services ───────────────────────────────────────────────────────

export interface ServiceListFilters {
  /** From the calendar filters. */
  serviceIds: string[];
  routeIds: string[];
  /** The list's own status filter. */
  status: DiffType | null;
  /** Substring of the service_id (accent- and case-insensitive). */
  search: string;
}

/** WHERE on services.parquet aliased `s`. */
function servicesWhere(
  f: ServiceListFilters,
  withStatus = true,
): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  idsClause(f.serviceIds, 's.service_id', parts, params);
  if (f.routeIds.length > 0) {
    parts.push(
      `list_has_any(list_concat(s.route_ids_base, s.route_ids_new), string_split(?, chr(31)))`,
    );
    params.push(listParam(f.routeIds));
  }
  if (withStatus && f.status) {
    parts.push('s.status = ?');
    params.push(f.status);
  }
  const q = normalizeText(f.search);
  if (q !== '') {
    // normalizeText in SQL: accents stripped, lower case.
    parts.push('contains(lower(strip_accents(s.service_id)), ?)');
    params.push(q);
  }
  return { sql: where(parts), params };
}

/** The list's order: modified, added, deleted, unchanged, then service_id. */
const SERVICE_ORDER = `CASE s.status WHEN 'modified' THEN 0 WHEN 'added' THEN 1 WHEN 'deleted' THEN 2 ELSE 3 END,
  lower(s.service_id), s.service_id`;

/** A page of the services list, with their calendar.txt rows (the pattern). */
export function servicesPageQuery(
  v: Pick<CalendarViews, 'services' | 'calendar'>,
  f: ServiceListFilters,
  offset: number,
  limit: number,
): SqlQuery {
  const w = servicesWhere(f);
  return {
    sql: `SELECT s.service_id, s.status, to_json(s.route_ids_base) AS route_ids_base,
        to_json(s.route_ids_new) AS route_ids_new, s.gained, s.lost, s.trips_base, s.trips_new,
        s.active_days_base, s.active_days_new, c.* EXCLUDE (service_id)
      FROM ${view(v.services)} s
      LEFT JOIN (${calendarRowsSql(v.calendar)}) c ON c.service_id = s.service_id
      ${w.sql} ORDER BY ${SERVICE_ORDER} ${page(offset, limit)}`,
    params: w.params,
  };
}

/** Services per status under every filter but the status one. */
export function serviceStatusCountsQuery(
  servicesView: string,
  f: ServiceListFilters,
): SqlQuery {
  const w = servicesWhere(f, false);
  return {
    sql: `SELECT s.status, count(*)::INTEGER AS n FROM ${view(servicesView)} s ${w.sql} GROUP BY s.status`,
    params: w.params,
  };
}

export function serviceIdsQuery(servicesView: string): SqlQuery {
  return {
    sql: `SELECT service_id FROM ${view(servicesView)} ORDER BY service_id`,
    params: [],
  };
}

/** Routes any service is used by (the line filter's options). */
export function serviceRouteIdsQuery(servicesView: string): SqlQuery {
  return {
    sql: `SELECT DISTINCT unnest(${ROUTES_SQL}) AS route_id FROM ${view(servicesView)}`,
    params: [],
  };
}

/** A service as the list shows it (collapsed). */
export interface ServiceListRow {
  service_id: string;
  status: DiffType;
  routeIds: string[];
  pattern: string;
  gained: number;
  lost: number;
  trips: { base: number; new: number };
  /** Days it runs in each feed (0 where it isn't in that feed). */
  activeDays: { base: number; new: number };
}

export function toServiceListRow(r: Record<string, unknown>): ServiceListRow {
  const status = String(r.status) as DiffType;
  return {
    service_id: String(r.service_id),
    status,
    routeIds: rowRouteIds(r),
    pattern: serviceListPattern(status, calendarSides(r)),
    gained: Number(r.gained ?? 0),
    lost: Number(r.lost ?? 0),
    trips: { base: Number(r.trips_base ?? 0), new: Number(r.trips_new ?? 0) },
    activeDays: {
      base: Number(r.active_days_base ?? 0),
      new: Number(r.active_days_new ?? 0),
    },
  };
}

/**
 * One service's rows (lib/calendar-rows serviceDiffFromRows): its
 * services.parquet row, calendar.txt row, calendar_dates.txt rows and
 * gained / lost dates. `serviceId` null reads every service's (the build).
 */
export function serviceRowsQueries(
  v: CalendarViews,
  serviceId: string | null,
): {
  service: SqlQuery;
  calendar: SqlQuery;
  exceptions: SqlQuery;
  days: SqlQuery;
} {
  const one = serviceId == null ? '' : 'WHERE service_id = ?';
  const params = serviceId == null ? [] : [serviceId];
  return {
    service: {
      sql: `SELECT * EXCLUDE (route_ids_base, route_ids_new), to_json(route_ids_base) AS route_ids_base,
          to_json(route_ids_new) AS route_ids_new FROM ${view(v.services)} ${one}`,
      params,
    },
    calendar: {
      sql: `SELECT * FROM (${calendarRowsSql(v.calendar)}) ${one}`,
      params,
    },
    exceptions: {
      sql: `SELECT * FROM (${exceptionRowsSql(v.dates)}) ${one}`,
      params,
    },
    days: {
      sql: `SELECT service_id, date, change FROM ${view(v.days)}
        WHERE change IN ('gained', 'lost')${serviceId == null ? '' : ' AND service_id = ?'}`,
      params,
    },
  };
}

export const NO_KIND_COUNTS: DayCounts = { added: 0, removed: 0, modified: 0 };

export function toKindCounts(rows: Array<Record<string, unknown>>): DayCounts {
  const c = { ...NO_KIND_COUNTS };
  for (const r of rows)
    if (CHANGE_KINDS.includes(String(r.kind) as ChangeKind))
      c[String(r.kind) as ChangeKind] = Number(r.n);
  return c;
}
