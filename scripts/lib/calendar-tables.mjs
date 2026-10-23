/**
 * The service calendar's lists as Parquet (<dataset>/calendar/), queried by
 * the calendar page with DuckDB-WASM instead of holding them in JSON
 * (IDFM: 10,816 services, 109,168 service-day changes).
 *
 *   calendar/services.parquet   one row per service, in list order (ord):
 *     ord, service_id, status, search, routes, route_ids, pattern, gained,
 *     lost, pattern_base, pattern_new, trips_base, trips_new,
 *     detail (ServiceDiff JSON, read when a service is expanded; in
 *     services_detail.parquet, see map-tables.mjs writeSplitTable)
 *   calendar/days.parquet       one row per service change on a date:
 *     date, kind (added | removed | modified), kord, ord, service_id,
 *     has_exc, exc_base, exc_new, change, reason_code, reason_detail, routes
 *
 * `routes` holds route ids wrapped in U+001F (contains(routes, chr(31) ||
 * id || chr(31))); `search` the normalised service_id.
 */

import { appHelpers, writeSplitTable, writeTable } from './map-tables.mjs';

export const CALENDAR_DIR = 'calendar';
const SEP = '\u001f';
const SORT_ORDER = { modified: 0, added: 1, deleted: 2, unchanged: 3 };
const KINDS = ['added', 'removed', 'modified'];

const SERVICE_COLUMNS = [
  ['ord', 'INTEGER'],
  ['service_id', 'VARCHAR'],
  ['status', 'VARCHAR'],
  ['search', 'VARCHAR'],
  ['routes', 'VARCHAR'],
  ['route_ids', 'VARCHAR'],
  ['pattern', 'VARCHAR'],
  ['gained', 'INTEGER'],
  ['lost', 'INTEGER'],
  ['pattern_base', 'VARCHAR'],
  ['pattern_new', 'VARCHAR'],
  ['trips_base', 'INTEGER'],
  ['trips_new', 'INTEGER'],
  ['detail', 'VARCHAR'],
];

const DAY_COLUMNS = [
  ['date', 'VARCHAR'],
  ['kind', 'VARCHAR'],
  ['kord', 'INTEGER'],
  ['ord', 'INTEGER'],
  ['service_id', 'VARCHAR'],
  ['has_exc', 'BOOLEAN'],
  ['exc_base', 'VARCHAR'],
  ['exc_new', 'VARCHAR'],
  ['change', 'VARCHAR'],
  ['reason_code', 'VARCHAR'],
  ['reason_detail', 'VARCHAR'],
  ['routes', 'VARCHAR'],
];

/**
 * Writes calendar/services.parquet and calendar/days.parquet, and returns
 * the calendar without its `services` and `days` (`tables` points at the
 * files; `route_ids` lists the routes any service is used by, for the line
 * filter).
 */
export async function writeCalendarTables(datasetDir, calendar) {
  const h = await appHelpers();
  const routesOf = (s) => [...new Set([...s.route_ids.base, ...s.route_ids.new])].sort();
  const wrap = (ids) => (ids.length > 0 ? `${SEP}${ids.join(SEP)}${SEP}` : '');
  const serviceRoutes = new Map(calendar.services.map((s) => [s.service_id, routesOf(s)]));

  const sorted = [...calendar.services].sort(
    (a, b) => SORT_ORDER[a.status] - SORT_ORDER[b.status] || a.service_id.localeCompare(b.service_id),
  );
  const serviceRows = sorted.map((s, ord) => {
    const routes = serviceRoutes.get(s.service_id);
    return [
      ord,
      s.service_id,
      s.status,
      h.normalizeText(s.service_id),
      wrap(routes),
      JSON.stringify(routes),
      h.serviceListPattern(s),
      s.dates_gained.length,
      s.dates_lost.length,
      h.snapshotPatternText(s.base),
      h.snapshotPatternText(s.new),
      s.trip_counts.base,
      s.trip_counts.new,
      JSON.stringify(s),
    ];
  });

  const dayRows = [];
  for (const [date, day] of Object.entries(calendar.days)) {
    KINDS.forEach((kind, kord) => {
      day[kind].forEach((e, ord) => {
        dayRows.push([
          date,
          kind,
          kord,
          ord,
          e.service_id,
          e.exception != null,
          e.exception?.base ?? null,
          e.exception?.new ?? null,
          e.change ?? null,
          e.reason?.code ?? null,
          e.reason?.detail ?? null,
          wrap(serviceRoutes.get(e.service_id) ?? []),
        ]);
      });
    });
  }

  const services = await writeSplitTable(datasetDir, 'services', SERVICE_COLUMNS, serviceRows, {
    dir: CALENDAR_DIR,
    key: 'service_id',
  });
  const days = await writeTable(datasetDir, 'days', DAY_COLUMNS, dayRows, {
    dir: CALENDAR_DIR,
    orderBy: 'date, kord, ord',
  });
  const routeIds = [...new Set([...serviceRoutes.values()].flat())];
  // The overview's notable highlights need the full lists, which leave here.
  const overviewHighlights = h.calendarOverviewHighlights(calendar);
  const { services: _services, days: _days, ...rest } = calendar;
  return {
    ...rest,
    route_ids: routeIds,
    overview_highlights: overviewHighlights,
    tables: { services, days },
  };
}
