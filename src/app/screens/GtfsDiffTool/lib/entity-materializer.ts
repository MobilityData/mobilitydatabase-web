/**
 * Phase 1: Entity Materialization (columnar-optimised)
 *
 * Joins across all uploaded GTFS files to construct rich entity objects.
 * Operates on ColumnarTable data — never creates per-row objects for
 * large files like stop_times.txt (which can have 3M+ rows).
 */

import { type ColumnarTable } from './columnar-table';
import {
  type MaterializedFeed,
  type MaterializedRoute,
  type MaterializedServicePeriod,
  type MaterializedStop,
  type MaterializedTrip,
} from './gtfs-types';

// ── Helpers ────────────────────────────────────────────────────────

function unique(arr: string[]): string[] {
  return Array.from(new Set(arr)).sort();
}

function parseGtfsDate(dateStr: string): Date {
  const y = parseInt(dateStr.substring(0, 4), 10);
  const m = parseInt(dateStr.substring(4, 6), 10) - 1;
  const d = parseInt(dateStr.substring(6, 8), 10);
  return new Date(y, m, d);
}

function formatGtfsDate(date: Date): string {
  const y = date.getFullYear().toString();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}

const DAY_NAMES = [
  'sunday', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday',
] as const;

function parseGtfsTime(timeStr: string | undefined): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parts[2] ? parseInt(parts[2], 10) : 0;
  if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
  return h * 3600 + m * 60 + s;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Safe column accessor — returns empty array if column doesn't exist. */
function col(table: ColumnarTable | null, name: string): string[] {
  if (!table) return [];
  return table.getColumn(name) ?? [];
}

// ── Service period materialization ─────────────────────────────────

function materializeServicePeriods(
  calendarTable: ColumnarTable | null,
  calendarDatesTable: ColumnarTable | null,
  tripServiceCol: string[],
  tripIdCol: string[],
  tripRouteMap: Map<string, string>,
): Map<string, MaterializedServicePeriod> {
  const result = new Map<string, MaterializedServicePeriod>();
  const baseDates = new Map<string, Set<string>>();

  // Step 1: expand calendar.txt date ranges
  if (calendarTable && calendarTable.rowCount > 0) {
    const serviceIdCol = col(calendarTable, 'service_id');
    const startDateCol = col(calendarTable, 'start_date');
    const endDateCol = col(calendarTable, 'end_date');
    const dayCols = DAY_NAMES.map((d) => col(calendarTable, d));

    for (let i = 0; i < calendarTable.rowCount; i++) {
      const serviceId = serviceIdCol[i] ?? '';
      const startDate = parseGtfsDate(startDateCol[i] ?? '');
      const endDate = parseGtfsDate(endDateCol[i] ?? '');
      let dates = baseDates.get(serviceId);
      if (!dates) {
        dates = new Set<string>();
        baseDates.set(serviceId, dates);
      }

      const current = new Date(startDate);
      while (current <= endDate) {
        const dayIdx = current.getDay();
        if ((dayCols[dayIdx] ?? [])[i] === '1') {
          dates.add(formatGtfsDate(current));
        }
        current.setDate(current.getDate() + 1);
      }
    }
  }

  // Step 2: apply calendar_dates.txt exceptions
  if (calendarDatesTable && calendarDatesTable.rowCount > 0) {
    const serviceIdCol = col(calendarDatesTable, 'service_id');
    const dateCol = col(calendarDatesTable, 'date');
    const exTypeCol = col(calendarDatesTable, 'exception_type');

    for (let i = 0; i < calendarDatesTable.rowCount; i++) {
      const serviceId = serviceIdCol[i] ?? '';
      const date = dateCol[i] ?? '';
      const exType = exTypeCol[i] ?? '';

      let dates = baseDates.get(serviceId);
      if (!dates) {
        dates = new Set<string>();
        baseDates.set(serviceId, dates);
      }
      if (exType === '1') {
        dates.add(date);
      } else if (exType === '2') {
        dates.delete(date);
      }
    }
  }

  // Build trip → service index from the trips table columns
  const tripsByService = new Map<string, string[]>();
  for (let i = 0; i < tripServiceCol.length; i++) {
    const svc = tripServiceCol[i];
    const tid = tripIdCol[i];
    const bucket = tripsByService.get(svc);
    if (bucket) bucket.push(tid);
    else tripsByService.set(svc, [tid]);
  }

  // Step 3: build materialized objects
  baseDates.forEach((dateSet, serviceId) => {
    const sortedDates = Array.from(dateSet).sort();
    const tripIds = (tripsByService.get(serviceId) ?? []).sort();
    const routeIds = unique(
      tripIds
        .map((tid) => tripRouteMap.get(tid))
        .filter((r): r is string => r != null),
    );

    result.set(serviceId, {
      service_id: serviceId,
      operativeDates: sortedDates,
      operativeDayCount: sortedDates.length,
      dateRangeString:
        sortedDates.length > 0
          ? `${sortedDates[0]} – ${sortedDates[sortedDates.length - 1]}`
          : 'No dates',
      tripIds,
      routeIds,
    });
  });

  return result;
}

// ── Trip materialization ───────────────────────────────────────────

function materializeTrips(
  tripsTable: ColumnarTable | null,
  stopTimesTable: ColumnarTable | null,
  servicePeriods: Map<string, MaterializedServicePeriod>,
): Map<string, MaterializedTrip> {
  const result = new Map<string, MaterializedTrip>();
  if (!tripsTable || tripsTable.rowCount === 0) return result;

  const tripIdCol = col(tripsTable, 'trip_id');
  const routeIdCol = col(tripsTable, 'route_id');
  const serviceIdCol = col(tripsTable, 'service_id');
  const directionIdCol = col(tripsTable, 'direction_id');
  const shapeIdCol = col(tripsTable, 'shape_id');
  const headsignCol = col(tripsTable, 'trip_headsign');
  const wheelchairCol = col(tripsTable, 'wheelchair_accessible');

  // Build stop_times index by trip_id — using columnar access
  // Returns Map<trip_id, sorted array of {stop_id, departure_time, arrival_time}>
  let stByTrip = new Map<string, Array<{ seq: number; stop_id: string; dep: string; arr: string }>>();
  if (stopTimesTable && stopTimesTable.rowCount > 0) {
    const stTripCol = col(stopTimesTable, 'trip_id');
    const stStopCol = col(stopTimesTable, 'stop_id');
    const stSeqCol = col(stopTimesTable, 'stop_sequence');
    const stDepCol = col(stopTimesTable, 'departure_time');
    const stArrCol = col(stopTimesTable, 'arrival_time');

    for (let i = 0; i < stopTimesTable.rowCount; i++) {
      const tid = stTripCol[i] ?? '';
      const entry = {
        seq: parseInt(stSeqCol[i] ?? '0', 10),
        stop_id: stStopCol[i] ?? '',
        dep: stDepCol[i] ?? '',
        arr: stArrCol[i] ?? '',
      };
      const bucket = stByTrip.get(tid);
      if (bucket) bucket.push(entry);
      else stByTrip.set(tid, [entry]);
    }
    // Sort each bucket by sequence
    stByTrip.forEach((entries) => entries.sort((a, b) => a.seq - b.seq));
  }

  for (let i = 0; i < tripsTable.rowCount; i++) {
    const tripId = tripIdCol[i] ?? '';
    const serviceId = serviceIdCol[i] ?? '';
    const entries = stByTrip.get(tripId) ?? [];
    const stopSequence = entries.map((e) => e.stop_id);
    const firstDep = entries.length > 0 ? (entries[0].dep || null) : null;
    const lastArr = entries.length > 0 ? (entries[entries.length - 1].arr || null) : null;
    const service = servicePeriods.get(serviceId);

    result.set(tripId, {
      trip_id: tripId,
      route_id: routeIdCol[i] ?? '',
      service_id: serviceId,
      direction_id: directionIdCol[i] || undefined,
      shape_id: shapeIdCol[i] || undefined,
      trip_headsign: headsignCol[i] || undefined,
      wheelchair_accessible: wheelchairCol[i] || undefined,
      stopSequence,
      firstDepartureTime: firstDep,
      lastArrivalTime: lastArr,
      operativeDates: service?.operativeDates ?? [],
    });
  }

  // Free the stop_times index — it can be large
  stByTrip = new Map();

  return result;
}

// ── Stop materialization ───────────────────────────────────────────

function materializeStops(
  stopsTable: ColumnarTable | null,
  stopTimesTable: ColumnarTable | null,
  tripRouteMap: Map<string, string>,
): Map<string, MaterializedStop> {
  const result = new Map<string, MaterializedStop>();
  if (!stopsTable || stopsTable.rowCount === 0) return result;

  const stopIdCol = col(stopsTable, 'stop_id');
  const nameCol = col(stopsTable, 'stop_name');
  const latCol = col(stopsTable, 'stop_lat');
  const lonCol = col(stopsTable, 'stop_lon');
  const wheelchairCol = col(stopsTable, 'wheelchair_boarding');
  const parentCol = col(stopsTable, 'parent_station');

  // Build stop → (tripIds) from stop_times columnar data
  const tripsPerStop = new Map<string, Set<string>>();
  if (stopTimesTable && stopTimesTable.rowCount > 0) {
    const stStopCol = col(stopTimesTable, 'stop_id');
    const stTripCol = col(stopTimesTable, 'trip_id');

    for (let i = 0; i < stopTimesTable.rowCount; i++) {
      const sid = stStopCol[i] ?? '';
      const tid = stTripCol[i] ?? '';
      let trips = tripsPerStop.get(sid);
      if (!trips) {
        trips = new Set<string>();
        tripsPerStop.set(sid, trips);
      }
      trips.add(tid);
    }
  }

  for (let i = 0; i < stopsTable.rowCount; i++) {
    const stopId = stopIdCol[i] ?? '';
    const tripSet = tripsPerStop.get(stopId);
    const tripIds = tripSet ? Array.from(tripSet).sort() : [];
    const routeIds = unique(
      tripIds
        .map((tid) => tripRouteMap.get(tid))
        .filter((r): r is string => r != null),
    );

    result.set(stopId, {
      stop_id: stopId,
      stop_name: nameCol[i] || undefined,
      stop_lat: latCol[i] || undefined,
      stop_lon: lonCol[i] || undefined,
      wheelchair_boarding: wheelchairCol[i] || undefined,
      parent_station: parentCol[i] || undefined,
      routeIds,
      tripIds,
    });
  }

  return result;
}

// ── Route materialization ──────────────────────────────────────────

function materializeRoutes(
  routesTable: ColumnarTable | null,
  trips: Map<string, MaterializedTrip>,
  _servicePeriods: Map<string, MaterializedServicePeriod>,
): Map<string, MaterializedRoute> {
  const result = new Map<string, MaterializedRoute>();
  if (!routesTable || routesTable.rowCount === 0) return result;

  const routeIdCol = col(routesTable, 'route_id');
  const agencyIdCol = col(routesTable, 'agency_id');
  const shortNameCol = col(routesTable, 'route_short_name');
  const longNameCol = col(routesTable, 'route_long_name');
  const typeCol = col(routesTable, 'route_type');
  const colorCol = col(routesTable, 'route_color');
  const textColorCol = col(routesTable, 'route_text_color');

  // Build route → trips index
  const tripsByRoute = new Map<string, MaterializedTrip[]>();
  trips.forEach((trip) => {
    const bucket = tripsByRoute.get(trip.route_id);
    if (bucket) bucket.push(trip);
    else tripsByRoute.set(trip.route_id, [trip]);
  });

  for (let i = 0; i < routesTable.rowCount; i++) {
    const routeId = routeIdCol[i] ?? '';
    const routeTrips = tripsByRoute.get(routeId) ?? [];

    const stopUniverse = unique(routeTrips.flatMap((t) => t.stopSequence));
    const serviceIds = unique(routeTrips.map((t) => t.service_id));
    const shapeIds = unique(
      routeTrips.map((t) => t.shape_id).filter((s): s is string => s != null),
    );
    const totalOperativeTripDays = routeTrips.reduce(
      (sum, t) => sum + t.operativeDates.length, 0,
    );

    let averageHeadway: number | null = null;
    const departures = routeTrips
      .map((t) => parseGtfsTime(t.firstDepartureTime ?? undefined))
      .filter((t): t is number => t != null)
      .sort((a, b) => a - b);

    if (departures.length >= 2) {
      const gaps: number[] = [];
      for (let k = 1; k < departures.length; k++) {
        gaps.push((departures[k] - departures[k - 1]) / 60);
      }
      gaps.sort((a, b) => a - b);
      averageHeadway = Math.round(median(gaps) * 10) / 10;
    }

    const perDirectionTrips: Record<string, string[]> = {};
    for (const trip of routeTrips) {
      const dir = trip.direction_id ?? 'unknown';
      if (!perDirectionTrips[dir]) perDirectionTrips[dir] = [];
      perDirectionTrips[dir].push(trip.trip_id);
    }
    for (const dir of Object.keys(perDirectionTrips)) {
      perDirectionTrips[dir].sort();
    }

    result.set(routeId, {
      route_id: routeId,
      agency_id: agencyIdCol[i] || undefined,
      route_short_name: shortNameCol[i] || undefined,
      route_long_name: longNameCol[i] || undefined,
      route_type: typeCol[i] || undefined,
      route_color: colorCol[i] || undefined,
      route_text_color: textColorCol[i] || undefined,
      tripCount: routeTrips.length,
      stopUniverse,
      totalOperativeTripDays,
      averageHeadway,
      shapeIds,
      serviceIds,
      perDirectionTrips,
    });
  }

  return result;
}

// ── Main materialization entry point ───────────────────────────────

/**
 * Materialize a full GTFS feed from its parsed columnar CSV files.
 * Gracefully degrades when files are missing.
 */
export function materializeFeed(
  files: Map<string, ColumnarTable>,
): MaterializedFeed {
  const routesTable = files.get('routes.txt') ?? null;
  const tripsTable = files.get('trips.txt') ?? null;
  const stopTimesTable = files.get('stop_times.txt') ?? null;
  const calendarTable = files.get('calendar.txt') ?? null;
  const calendarDatesTable = files.get('calendar_dates.txt') ?? null;
  const stopsTable = files.get('stops.txt') ?? null;

  // Extract trip columns for service period materialization
  const tripIdCol = col(tripsTable, 'trip_id');
  const tripServiceCol = col(tripsTable, 'service_id');
  const tripRouteCol = col(tripsTable, 'route_id');

  // Trip → route mapping
  const tripRouteMap = new Map<string, string>();
  for (let i = 0; i < tripIdCol.length; i++) {
    tripRouteMap.set(tripIdCol[i], tripRouteCol[i]);
  }

  // Phase 1a: Service periods
  const servicePeriods = materializeServicePeriods(
    calendarTable, calendarDatesTable,
    tripServiceCol, tripIdCol, tripRouteMap,
  );

  // Phase 1b: Trips (needs service periods for operative dates)
  const trips = materializeTrips(tripsTable, stopTimesTable, servicePeriods);

  // Phase 1c: Stops (needs trip-route mapping)
  const stops = materializeStops(stopsTable, stopTimesTable, tripRouteMap);

  // Phase 1d: Routes (needs trips and service periods)
  const routes = materializeRoutes(routesTable, trips, servicePeriods);

  return { routes, servicePeriods, stops, trips };
}
