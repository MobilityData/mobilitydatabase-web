/**
 * SQL for the service calendar page (DuckDB over calendar/services.parquet
 * and calendar/days.parquet, written by scripts/lib/calendar-tables.mjs).
 * Pure, so it is unit-tested; the filters mean the same as calendar-utils'
 * filterDay / serviceMatches applied to the full lists.
 *
 * User input only goes in as bound parameters; view names are checked.
 */

import {
  CHANGE_KINDS,
  type CalendarFilters,
  type ChangeKind,
  type DayCounts,
} from './calendar-utils';
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

const token = (id: string): string => `\u001f${id}\u001f`;

function routesClause(
  routeIds: string[],
  parts: string[],
  params: unknown[],
): void {
  if (routeIds.length === 0) return;
  parts.push(`(${routeIds.map(() => 'contains(routes, ?)').join(' OR ')})`);
  params.push(...routeIds.map(token));
}

function idsClause(ids: string[], parts: string[], params: unknown[]): void {
  if (ids.length === 0) return;
  parts.push(`service_id IN (${ids.map(() => '?').join(', ')})`);
  params.push(...ids);
}

function where(parts: string[]): string {
  return parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '';
}

// ── Service-day changes ────────────────────────────────────────────

/** WHERE for the calendar filters on days.parquet; `withKinds: false` for per-kind counts. */
export function entriesWhere(
  f: CalendarFilters,
  withKinds = true,
): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (withKinds) {
    if (f.kinds.length === 0) parts.push('FALSE');
    else {
      parts.push(`kind IN (${f.kinds.map(() => '?').join(', ')})`);
      params.push(...f.kinds);
    }
  }
  idsClause(f.serviceIds, parts, params);
  routesClause(f.routeIds, parts, params);
  if (f.exceptionType === 'none') parts.push('NOT has_exc');
  else if (f.exceptionType !== 'all') {
    parts.push('(exc_base = ? OR exc_new = ?)');
    params.push(f.exceptionType, f.exceptionType);
  }
  return { sql: where(parts), params };
}

/** Changes per date and kind under every filter (month / year views). */
export function dayCountsQuery(v: string, f: CalendarFilters): SqlQuery {
  const w = entriesWhere(f);
  return {
    sql: `SELECT date, kind, count(*)::INTEGER AS n FROM ${view(v)} ${w.sql} GROUP BY date, kind ORDER BY date`,
    params: w.params,
  };
}

/** Changes per kind under every filter but the kind one (filter chips). */
export function kindCountsQuery(v: string, f: CalendarFilters): SqlQuery {
  const w = entriesWhere(f, false);
  return {
    sql: `SELECT kind, count(*)::INTEGER AS n FROM ${view(v)} ${w.sql} GROUP BY kind`,
    params: w.params,
  };
}

/** Every change on a date, unfiltered. */
export function dayTotalQuery(v: string, date: GtfsDate): SqlQuery {
  return {
    sql: `SELECT count(*)::INTEGER AS n FROM ${view(v)} WHERE date = ?`,
    params: [date],
  };
}

/** One date's changes under the filters, with what the dialog shows of each service. */
export function dayEntriesQuery(
  daysView: string,
  servicesView: string,
  date: GtfsDate,
  f: CalendarFilters,
): SqlQuery {
  const w = entriesWhere(f);
  const cond = w.sql ? `${w.sql} AND date = ?` : 'WHERE date = ?';
  return {
    sql: `SELECT d.kind, d.service_id, d.has_exc, d.exc_base, d.exc_new, d.change, d.reason_code, d.reason_detail,
        s.route_ids, s.pattern_base, s.pattern_new, s.trips_base, s.trips_new
      FROM (SELECT * FROM ${view(daysView)} ${cond}) d
      LEFT JOIN (SELECT service_id, route_ids, pattern_base, pattern_new, trips_base, trips_new FROM ${view(servicesView)}) s
      USING (service_id)
      ORDER BY d.kord, d.ord`,
    params: [...w.params, date],
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

function jsonList(v: unknown): string[] {
  const s = str(v);
  if (!s) return [];
  const parsed: unknown = JSON.parse(s);
  return Array.isArray(parsed) ? parsed.map(String) : [];
}

export function toDayEntryRow(r: Record<string, unknown>): DayEntryRow {
  const exception: DayException | null = r.has_exc
    ? {
        base: (str(r.exc_base) as DayException['base']) ?? null,
        new: (str(r.exc_new) as DayException['new']) ?? null,
      }
    : null;
  const base: DayServiceEntry = { service_id: String(r.service_id), exception };
  const kind = String(r.kind) as ChangeKind;
  const entry: DayServiceEntry | DayModifiedEntry =
    kind === 'modified'
      ? {
          ...base,
          change: (str(r.change) ??
            'exception_only') as DayModifiedEntry['change'],
          reason: {
            code: (str(r.reason_code) ?? '') as DayReasonCode,
            detail: str(r.reason_detail) ?? '',
          },
        }
      : base;
  return {
    kind,
    entry,
    routeIds: jsonList(r.route_ids),
    patternBase: str(r.pattern_base) ?? '',
    patternNew: str(r.pattern_new) ?? '',
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

export function servicesWhere(
  f: ServiceListFilters,
  withStatus = true,
): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  idsClause(f.serviceIds, parts, params);
  routesClause(f.routeIds, parts, params);
  if (withStatus && f.status) {
    parts.push('status = ?');
    params.push(f.status);
  }
  const q = normalizeText(f.search);
  if (q !== '') {
    parts.push('contains(search, ?)');
    params.push(q);
  }
  return { sql: where(parts), params };
}

export function servicesPageQuery(
  v: string,
  f: ServiceListFilters,
  offset: number,
  limit: number,
): SqlQuery {
  const w = servicesWhere(f);
  return {
    sql: `SELECT service_id, status, route_ids, pattern, gained, lost FROM ${view(v)} ${w.sql} ORDER BY ord ${page(offset, limit)}`,
    params: w.params,
  };
}

/** Services per status under every filter but the status one. */
export function serviceStatusCountsQuery(
  v: string,
  f: ServiceListFilters,
): SqlQuery {
  const w = servicesWhere(f, false);
  return {
    sql: `SELECT status, count(*)::INTEGER AS n FROM ${view(v)} ${w.sql} GROUP BY status`,
    params: w.params,
  };
}

export function serviceIdsQuery(v: string): SqlQuery {
  return {
    sql: `SELECT service_id FROM ${view(v)} ORDER BY service_id`,
    params: [],
  };
}

/** One service's ServiceDiff JSON. */
export function serviceDetailQuery(v: string, serviceId: string): SqlQuery {
  return {
    sql: `SELECT detail FROM ${view(v)} WHERE service_id = ? LIMIT 1`,
    params: [serviceId],
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
}

export function toServiceListRow(r: Record<string, unknown>): ServiceListRow {
  return {
    service_id: String(r.service_id),
    status: String(r.status) as DiffType,
    routeIds: jsonList(r.route_ids),
    pattern: str(r.pattern) ?? '',
    gained: Number(r.gained ?? 0),
    lost: Number(r.lost ?? 0),
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

/** The calendar status (added / deleted / modified / unchanged) of some services. */
export function serviceStatusQuery(v: string, ids: string[]): SqlQuery {
  return {
    sql:
      ids.length === 0
        ? `SELECT service_id, status FROM ${view(v)} WHERE false`
        : `SELECT service_id, status FROM ${view(v)} WHERE service_id IN (${ids.map(() => '?').join(', ')})`,
    params: ids,
  };
}
