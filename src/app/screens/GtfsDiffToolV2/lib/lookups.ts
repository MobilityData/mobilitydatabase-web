'use client';

/**
 * Routes and stops looked up by id in the routes.txt and stops.txt raw
 * tables (raw/routes.parquet, raw/stops.parquet), which hold every route
 * and stop of either feed: documents store ids and name the table with
 * `route_info_file` / `stop_info_file`. Each lookup reads only the columns
 * it needs, with HTTP range requests, and is loaded once per page load.
 */

import { parquetView, runQueued } from './duckdb-client';
import type { RouteInfo, RouteStopInfo } from './entity-diff-types';
import type { PathwaysDiff } from './pathways-types';
import { routeInfoFromRows, routeInfoSql } from './route-info';
import {
  type StopRowSides,
  stopInfoFromRows,
  stopInfoSql,
  stopNamesFromRows,
  stopNamesSql,
  stopRowSides,
  stopRowsQuery,
  pathwaysStopIds,
  withPathwaysStopRows,
} from './stop-info';

const loads = new Map<string, Promise<unknown>>();

/** One load per key and page load (a failed one is retried next time). */
function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = loads.get(key) as Promise<T> | undefined;
  if (p == null) {
    p = load();
    p.catch(() => loads.delete(key));
    loads.set(key, p);
  }
  return p;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

/**
 * Names, colours and feeds of every route: the routes.txt raw table (or the
 * maps/route_info.json of older builds).
 */
export function loadRouteInfo(url: string): Promise<Record<string, RouteInfo>> {
  return once(`routes\n${url}`, async () => {
    if (url.endsWith('.json'))
      return (await fetchJson(url)) as Record<string, RouteInfo>;
    const v = await parquetView(url, { read: 'ranged' });
    return routeInfoFromRows(
      await runQueued({ sql: routeInfoSql(v), params: [] }),
    );
  });
}

/** Every stop's name (the new feed's, else the base one's). */
export function loadStopNames(url: string): Promise<Record<string, string>> {
  return once(`stop names\n${url}`, async () => {
    const v = await parquetView(url, { read: 'ranged' });
    return stopNamesFromRows(
      await runQueued({ sql: stopNamesSql(v), params: [] }),
    );
  });
}

/**
 * Every stop's name, position, change and distance moved (`movesUrl`: the
 * stops analysis table, analysis/stops.parquet; only its stop_id and moved_m
 * are read), for the route maps.
 */
export function loadStopInfo(
  url: string,
  movesUrl: string | null,
): Promise<Record<string, RouteStopInfo>> {
  return once(`stop info\n${url}\n${movesUrl ?? ''}`, async () => {
    const [v, m] = await Promise.all([
      parquetView(url, { read: 'ranged' }),
      movesUrl ? parquetView(movesUrl) : Promise.resolve(null),
    ]);
    return stopInfoFromRows(
      await runQueued({ sql: stopInfoSql(v, m), params: [] }),
    );
  });
}

/** Some stops' base and new stops.txt rows and field changes, by stop_id. */
export async function loadStopRows(
  url: string,
  ids: string[],
): Promise<Map<string, StopRowSides>> {
  const v = await parquetView(url, { read: 'ranged' });
  const rows = await runQueued(stopRowsQuery(v, ids));
  return new Map(rows.map((r) => [String(r.trip_key), stopRowSides(r)]));
}

/**
 * A pathways diff with its station and node stops.txt rows put back from
 * the stops.txt raw table (`stop_info_file`); older builds stored them.
 */
export async function withPathwaysStops(
  doc: PathwaysDiff,
  fileUrl: (path: string) => string,
): Promise<PathwaysDiff> {
  if (doc.stop_info_file == null) return doc;
  const rows = await loadStopRows(
    fileUrl(doc.stop_info_file),
    pathwaysStopIds(doc),
  );
  return withPathwaysStopRows(doc, rows);
}
