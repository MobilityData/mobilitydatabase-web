/**
 * Trips of large feeds are loaded per service, for the day being compared.
 *
 * trips-diff.json is a small index (dates, service sets, day types, names)
 * whose `trip_tables` point at one Parquet file per feed, written by
 * scripts/lib/write-trips-diff.mjs: rows (ord, service, route, trip), sorted
 * by service, `trip` being a CompactTrip as JSON. lib/useTripsDay.ts reads
 * the rows of the services running on the selected day with DuckDB-WASM
 * over HTTP range requests and rebuilds a full TripsDiffDoc for that day.
 *
 * Feeds too large for a whole day in the browser (IDFM: 100k+ trips a day)
 * are written sorted by route (`trip_tables.by_route`): the view lists
 * routes with their trip counts from `route_service_trips` and reads one
 * route's trips at a time.
 *
 * Pure and type-only on imports.
 */

import type { CompactTrip, FeedSide, TripsDiffDoc } from './trips-types';

/** Paths of each feed's trip table, relative to the diff's base URL. */
export interface TripTables {
  base: string;
  new: string;
  /** Sorted by route: load one route of a day at a time. */
  by_route?: boolean;
}

/** route_id -> service_id -> trips, per feed (by_route datasets only). */
export type RouteServiceTrips = Record<
  FeedSide,
  Record<string, Record<string, number>>
>;

/** trips-diff.json: the index; feeds.*.trips are empty when tables exist. */
export type TripsIndexDoc = TripsDiffDoc & {
  trip_tables?: TripTables;
  route_service_trips?: RouteServiceTrips;
};

export const FEED_SIDES: FeedSide[] = ['base', 'new'];

export function hasTripTables(
  doc: TripsIndexDoc,
): doc is TripsIndexDoc & { trip_tables: TripTables } {
  return doc.trip_tables != null;
}

export function isByRoute(doc: TripsIndexDoc): boolean {
  return doc.trip_tables?.by_route === true;
}

/**
 * SQL for the trips of some services, in their original feed order;
 * only `route`'s when given.
 */
export function tripsQuery(
  view: string,
  services: string[],
  route?: string,
): { sql: string; params: string[] } | null {
  if (!/^[A-Za-z0-9_]+$/.test(view)) throw new Error(`Bad view: ${view}`);
  if (services.length === 0) return null;
  const inList = `service IN (${services.map(() => '?').join(', ')})`;
  const params = [...services].sort();
  if (route == null)
    return {
      sql: `SELECT trip FROM "${view}" WHERE ${inList} ORDER BY ord`,
      params,
    };
  return {
    sql: `SELECT trip FROM "${view}" WHERE route = ? AND ${inList} ORDER BY ord`,
    params: [route, ...params],
  };
}

export interface RouteDayCount {
  route: string;
  base: number;
  new: number;
}

/**
 * Trips each route runs on a day, per feed, from the index alone (no trip
 * table read): routes with the largest change first, then by id.
 */
export function routeDayCounts(
  index: TripsIndexDoc,
  services: Record<FeedSide, string[]>,
): RouteDayCount[] {
  const counts = new Map<string, RouteDayCount>();
  for (const side of FEED_SIDES) {
    const active = new Set(services[side]);
    const perRoute = index.route_service_trips?.[side] ?? {};
    for (const [route, perService] of Object.entries(perRoute)) {
      let n = 0;
      for (const [service, trips] of Object.entries(perService))
        if (active.has(service)) n += trips;
      if (n === 0) continue;
      let c = counts.get(route);
      if (!c) counts.set(route, (c = { route, base: 0, new: 0 }));
      c[side] = n;
    }
  }
  return [...counts.values()].sort(
    (a, b) =>
      Math.abs(b.new - b.base) - Math.abs(a.new - a.base) ||
      a.route.localeCompare(b.route, undefined, { numeric: true }),
  );
}

/** The day's document: the index with the loaded trips in place. */
export function withTrips(
  index: TripsIndexDoc,
  trips: Record<FeedSide, CompactTrip[]>,
): TripsDiffDoc {
  const { trip_tables: _tables, ...rest } = index;
  return {
    ...rest,
    feeds: { base: { trips: trips.base }, new: { trips: trips.new } },
  };
}
