'use client';

import { useEffect, useState } from 'react';
import { diffFileUrl } from './datasets';
import { parquetView, queryObjects } from './duckdb-client';
import type { GtfsDate } from './entity-diff-types';
import type { CompactTrip, FeedSide, TripsDiffDoc } from './trips-types';
import {
  FEED_SIDES,
  type TripsIndexDoc,
  hasTripTables,
  isByRoute,
  tripsQuery,
  withTrips,
} from './trips-shards';
import { servicesForDate } from './trips-utils';

/** Loaded service sets kept in memory; days mostly share services. */
const MAX_CACHED = 16;
const cache = new Map<string, Promise<CompactTrip[]>>();

/** One feed's trips for a set of services (of one route), read from its Parquet table. */
function loadTrips(
  url: string,
  services: string[],
  route?: string,
): Promise<CompactTrip[]> {
  const key = `${url}|${route ?? ''}|${[...services].sort().join('|')}`;
  const hit = cache.get(key);
  if (hit) {
    // Refresh recency.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const p = (async () => {
    const view = await parquetView(url);
    const q = tripsQuery(view, services, route);
    if (q == null) return [];
    const rows = await queryObjects(q.sql, q.params);
    return rows.map((r) => JSON.parse(String(r.trip)) as CompactTrip);
  })();
  p.catch(() => cache.delete(key));
  cache.set(key, p);
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
  return p;
}

export interface TripsDay {
  /** Document holding the trips running on `date`. */
  doc: TripsDiffDoc | undefined;
  /** Date `doc` was loaded for; lags behind the requested date while loading. */
  date: GtfsDate | null;
  /** By-route datasets: the route `doc` holds (null: none, no trips). */
  route: string | null;
  loading: boolean;
  error?: Error;
}

/**
 * The trips needed to diff one comparison (a date, or "<base>~<new>"): the
 * services each feed runs then, read from the diff's Parquet trip tables.
 * Keeps showing the previous comparison until the next one arrives. An
 * index that holds its trips inline (tests, tiny fixtures) is used as is.
 *
 * By-route datasets (trip_tables.by_route) load only `route`'s trips; with
 * no route the day's document has no trips (the view lists routes from the
 * index instead).
 */
export function useTripsDay(
  datasetId: string,
  index: TripsIndexDoc | undefined,
  date: GtfsDate | null,
  initial?: { doc: TripsDiffDoc; date: GtfsDate; route?: string | null },
  route: string | null = null,
): TripsDay {
  const [loaded, setLoaded] = useState<{
    doc?: TripsDiffDoc;
    date: GtfsDate | null;
    route: string | null;
    error?: Error;
  } | null>(initial ? { ...initial, route: initial.route ?? null } : null);
  const tables = index != null && hasTripTables(index);
  const byRoute = index != null && isByRoute(index);
  const wanted = byRoute ? route : null;

  useEffect(() => {
    if (index == null || !hasTripTables(index) || date == null) return;
    if (loaded?.date === date && loaded.route === wanted && loaded.doc != null)
      return;
    if (byRoute && wanted == null) {
      setLoaded({
        doc: withTrips(index, { base: [], new: [] }),
        date,
        route: null,
      });
      return;
    }
    let alive = true;
    // A previous day's error shouldn't hide this day's loading state.
    setLoaded((prev) =>
      prev?.error
        ? { doc: prev.doc, date: prev.date, route: prev.route }
        : prev,
    );
    const services = servicesForDate(index, date);
    Promise.all(
      FEED_SIDES.map((side) =>
        loadTrips(
          diffFileUrl(datasetId, index.trip_tables[side]),
          services[side],
          wanted ?? undefined,
        ),
      ),
    )
      .then(([base, next]) => {
        const trips: Record<FeedSide, CompactTrip[]> = { base, new: next };
        if (alive)
          setLoaded({ doc: withTrips(index, trips), date, route: wanted });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const error = e instanceof Error ? e : new Error(String(e));
        setLoaded((prev) => ({
          doc: prev?.doc,
          date: prev?.date ?? null,
          route: prev?.route ?? null,
          error,
        }));
      });
    return () => {
      alive = false;
    };
  }, [datasetId, index, tables, date, wanted]);

  if (index == null)
    return { doc: undefined, date: null, route: null, loading: true };
  if (!tables) return { doc: index, date, route: null, loading: false };
  return {
    doc: loaded?.doc,
    date: loaded?.date ?? null,
    route: loaded?.route ?? null,
    loading:
      loaded?.error == null &&
      (loaded?.date !== date || loaded.route !== wanted),
    error: loaded?.error,
  };
}
