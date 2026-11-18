/**
 * The services analysis's tables (<dataset>/analysis/, paths from
 * src/app/screens/GtfsDiffToolV2/lib/diff-layout.ts), queried by the
 * calendar page with DuckDB-WASM (IDFM: 10,816 services, 109,168
 * service-day changes). They hold analysis results only: a service's
 * calendar.txt row and calendar_dates.txt exceptions are in the raw tables
 * (raw/calendar.parquet, raw/calendar_dates.parquet: every row of either
 * feed, keyed by service_id), which analysis/services.json names.
 *
 *   analysis/services.parquet   one row per service of either feed, by
 *     service_id: service_id, status (added | deleted | modified |
 *     unchanged), route_ids_base / route_ids_new (VARCHAR[]: routes whose
 *     trips use it), trips_base / trips_new, active_days_base /
 *     active_days_new, first_date_base / last_date_base, first_date_new /
 *     last_date_new (its active dates; NULL in a feed without it), gained /
 *     lost (dates it now runs / no longer runs)
 *   analysis/service_dates.parquet   one row per service change on a date,
 *     by date then service_id: date, service_id, change (added | removed: an
 *     added / deleted service's active date; gained | lost | exception_only:
 *     a kept service's), reason_code (why a kept service's date changed)
 */

import { appHelpers, writeHighlightsFile, writeTable } from './map-tables.mjs';
import { timed, timer } from './timings.mjs';
import { SERVICES_TABLE, SERVICE_DATES_TABLE } from '../../src/app/screens/GtfsDiffToolV2/lib/diff-layout.ts';

const SERVICE_COLUMNS = [
  ['service_id', 'VARCHAR'],
  ['status', 'VARCHAR'],
  ['route_ids_base', 'VARCHAR[]'],
  ['route_ids_new', 'VARCHAR[]'],
  ['trips_base', 'INTEGER'],
  ['trips_new', 'INTEGER'],
  ['active_days_base', 'INTEGER'],
  ['active_days_new', 'INTEGER'],
  ['first_date_base', 'VARCHAR'],
  ['last_date_base', 'VARCHAR'],
  ['first_date_new', 'VARCHAR'],
  ['last_date_new', 'VARCHAR'],
  ['gained', 'INTEGER'],
  ['lost', 'INTEGER'],
];

const DAY_COLUMNS = [
  ['date', 'VARCHAR'],
  ['service_id', 'VARCHAR'],
  ['change', 'VARCHAR'],
  ['reason_code', 'VARCHAR'],
];

/**
 * Writes analysis/services.parquet and analysis/service_dates.parquet and
 * the services section's highlights file, and returns the calendar without
 * its `services` and `days` (`tables.services` and `tables.days` point at
 * the files).
 */
export async function writeCalendarTables(datasetDir, calendar) {
  const h = await appHelpers();
  const endRows = timer('calendar: services and days rows');
  const serviceRows = calendar.services.map((s) => [
    s.service_id,
    s.status,
    s.route_ids.base,
    s.route_ids.new,
    s.trip_counts.base,
    s.trip_counts.new,
    s.base?.active_day_count ?? null,
    s.new?.active_day_count ?? null,
    s.base?.first_date ?? null,
    s.base?.last_date ?? null,
    s.new?.first_date ?? null,
    s.new?.last_date ?? null,
    s.dates_gained.length,
    s.dates_lost.length,
  ]);
  const dayRows = [];
  for (const [date, day] of Object.entries(calendar.days)) {
    for (const e of day.added) dayRows.push([date, e.service_id, 'added', null]);
    for (const e of day.removed) dayRows.push([date, e.service_id, 'removed', null]);
    for (const e of day.modified) dayRows.push([date, e.service_id, e.change, e.reason.code]);
  }
  endRows({ rows: serviceRows.length + dayRows.length });

  const services = await writeTable(datasetDir, SERVICES_TABLE, SERVICE_COLUMNS, serviceRows, {
    orderBy: 'service_id',
    key: 'service_id',
  });
  const days = await writeTable(datasetDir, SERVICE_DATES_TABLE, DAY_COLUMNS, dayRows, {
    orderBy: 'date, service_id',
  });
  // The notable highlights need the full lists, which leave here.
  const highlights = await writeHighlightsFile(
    datasetDir,
    'services',
    timed('calendar: overview highlights (calendarOverviewHighlights)', () => h.calendarOverviewHighlights(calendar)),
  );
  const { services: _services, days: _days, ...rest } = calendar;
  return { ...rest, highlights_file: highlights.file, tables: { services, days } };
}
