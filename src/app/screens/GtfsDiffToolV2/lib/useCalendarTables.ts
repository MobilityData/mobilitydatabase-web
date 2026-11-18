'use client';

/**
 * The calendar page's tables: the analysis (analysis/services.parquet,
 * analysis/service_dates.parquet) and the calendar raw tables holding the services'
 * rows, registered once per URL and queried together (lib/calendar-query).
 */

import { diffFileUrl } from './datasets';
import { parquetView, runQueued } from './duckdb-client';
import { type CalendarViews, serviceRowsQueries } from './calendar-query';
import { serviceDiffFromRows } from './calendar-rows';
import type { CalendarDiff, ServiceDiff } from './entity-diff-types';
import type { SqlQuery } from './map-table-query';
import { type MapTableResult, mapTableUrl, useViewsQuery } from './useMapTable';

export interface CalendarUrls {
  days: string;
  services: string;
  calendar: string | null;
  dates: string | null;
}

/**
 * The calendar's table URLs, or null for an older build (its tables held
 * the services' rows; rebuild it).
 */
export function calendarUrls(
  datasetId: string,
  calendar: CalendarDiff,
): CalendarUrls | null {
  if (calendar.calendar_rows_file === undefined) return null;
  const raw = (file: string | null | undefined): string | null =>
    file ? diffFileUrl(datasetId, file) : null;
  return {
    days: mapTableUrl(datasetId, calendar.tables.days),
    services: mapTableUrl(datasetId, calendar.tables.services),
    calendar: raw(calendar.calendar_rows_file),
    dates: raw(calendar.calendar_dates_rows_file),
  };
}

/** Identifies the tables (for re-running queries). */
export function calendarKey(u: CalendarUrls): string {
  return [u.days, u.services, u.calendar ?? '', u.dates ?? ''].join('\n');
}

export async function calendarViews(u: CalendarUrls): Promise<CalendarViews> {
  const view = (url: string | null): Promise<string | null> =>
    url == null ? Promise.resolve(null) : parquetView(url);
  const [days, services, calendar, dates] = await Promise.all([
    parquetView(u.days),
    parquetView(u.services),
    view(u.calendar),
    view(u.dates),
  ]);
  return { days, services, calendar, dates };
}

/** One query over the calendar's tables. */
export async function queryCalendar(
  u: CalendarUrls,
  build: (v: CalendarViews) => SqlQuery,
): Promise<Array<Record<string, unknown>>> {
  return runQueued(build(await calendarViews(u)));
}

/** useViewsQuery over the calendar's tables; re-run when `key` changes. */
export function useCalendarQuery<T>(
  u: CalendarUrls | null,
  key: string,
  build: (v: CalendarViews) => SqlQuery,
  read: (rows: Array<Record<string, unknown>>) => T,
): MapTableResult<T> {
  return useViewsQuery(
    u == null ? null : calendarKey(u),
    async () => {
      if (u == null) return [];
      const v = await calendarViews(u);
      return [v.days, v.services, v.calendar ?? '', v.dates ?? ''];
    },
    key,
    ([days, services, calendar, dates]) =>
      build({
        days,
        services,
        calendar: calendar || null,
        dates: dates || null,
      }),
    read,
  );
}

/** One service's full record, from its rows (lib/calendar-rows). */
export async function loadServiceDiff(
  u: CalendarUrls,
  serviceId: string,
): Promise<ServiceDiff | null> {
  const q = serviceRowsQueries(await calendarViews(u), serviceId);
  const [service, calendar, exceptions, days] = await Promise.all([
    runQueued(q.service),
    runQueued(q.calendar),
    runQueued(q.exceptions),
    runQueued(q.days),
  ]);
  if (service[0] == null) return null;
  return serviceDiffFromRows({
    service: service[0],
    calendar: calendar[0] ?? null,
    exceptions,
    days,
  });
}
