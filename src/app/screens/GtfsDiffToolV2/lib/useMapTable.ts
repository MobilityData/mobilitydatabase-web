'use client';

import { useEffect, useRef, useState } from 'react';
import useSWRImmutable from 'swr/immutable';
import { diffFileUrl } from './datasets';
import { derivedTable, parquetView, runQueued } from './duckdb-client';
import type {
  MapTable,
  RawTable,
  RouteDetail,
  RouteStopInfo,
  RoutesMapDiff,
  UnusedShapeDiff,
} from './entity-diff-types';
import { loadStopInfo } from './lookups';
import {
  type SqlQuery,
  routeDetailQuery,
  routeOfShapeQuery,
  routeServedStopsQuery,
  routeShapesQuery,
  stopsTableQuery,
  unusedShapesQuery,
} from './map-table-query';
import {
  assembleRouteDetail,
  rawFieldChanges,
  toRouteRow,
  toShapeRow,
  toStopServedRow,
  toUnusedShape,
} from './route-detail';
import { STOPS_TABLE } from './diff-layout';
import type { RouteKind } from './routes-utils';

/** URL of a map's Parquet table. */
export function mapTableUrl(datasetId: string, table: MapTable): string {
  return diffFileUrl(datasetId, table.path);
}

/** The routes analysis tables (lib/route-tables) and routes.txt raw table. */
export interface RouteTableUrls {
  /** analysis/routes.parquet */
  routes: string;
  /** analysis/shapes.parquet */
  shapes: string;
  /** analysis/stops.parquet: the stops each route serves. */
  stops: string;
  /** raw/routes.parquet (the routes.txt rows), when routes.txt changed. */
  raw: string | null;
}

export function routeTableUrls(
  datasetId: string,
  routesMap: RoutesMapDiff,
  rawRoutes?: RawTable,
): RouteTableUrls {
  return {
    routes: mapTableUrl(datasetId, routesMap.table),
    shapes: mapTableUrl(datasetId, routesMap.shapes_table),
    stops: diffFileUrl(datasetId, routesMap.stop_moves_file ?? STOPS_TABLE),
    raw: rawRoutes ? diffFileUrl(datasetId, rawRoutes.path) : null,
  };
}

/**
 * The overview queries' tables (routesOverviewQuery, routesV2OverviewQuery):
 * [routes, shapes], for useMapTablesQuery.
 */
export function routesOverviewUrls(
  datasetId: string,
  routesMap: RoutesMapDiff,
): string[] {
  const urls = routeTableUrls(datasetId, routesMap);
  return [urls.routes, urls.shapes];
}

/** Rows of one query on a map table (registered once per URL). */
export async function queryMapTable(
  url: string,
  build: (view: string) => SqlQuery,
): Promise<Array<Record<string, unknown>>> {
  const view = await parquetView(url);
  return runQueued(build(view));
}

/** One query over several tables (joins), each registered once per URL. */
export async function queryMapTables(
  urls: string[],
  build: (views: string[]) => SqlQuery,
): Promise<Array<Record<string, unknown>>> {
  const views = await Promise.all(urls.map((u) => parquetView(u)));
  return runQueued(build(views));
}

export interface MapTableResult<T> {
  /** Last result; kept while the next query runs. */
  data: T | undefined;
  loading: boolean;
  error: Error | null;
}

/**
 * One query on a map table, re-run when `key` changes (the filters, as a
 * string: they are fresh objects every render).
 */
export function useMapTableQuery<T>(
  url: string | null,
  key: string,
  build: (view: string) => SqlQuery,
  read: (rows: Array<Record<string, unknown>>) => T,
): MapTableResult<T> {
  return useMapTablesQuery(
    url == null ? null : [url],
    key,
    ([v]) => build(v),
    read,
  );
}

/** useMapTableQuery over several tables (joins). */
export function useMapTablesQuery<T>(
  urls: string[] | null,
  key: string,
  build: (views: string[]) => SqlQuery,
  read: (rows: Array<Record<string, unknown>>) => T,
): MapTableResult<T> {
  return useViewsQuery(
    urls == null ? null : urls.join('\n'),
    () => Promise.all((urls ?? []).map((u) => parquetView(u))),
    key,
    build,
    read,
  );
}

/**
 * One query on the views `views` resolves (registered files, a derived
 * table), re-run when `source` (what the views are) or `key` changes; null
 * `source` runs nothing.
 */
export function useViewsQuery<T>(
  source: string | null,
  views: () => Promise<string[]>,
  key: string,
  build: (views: string[]) => SqlQuery,
  read: (rows: Array<Record<string, unknown>>) => T,
): MapTableResult<T> {
  const [state, setState] = useState<MapTableResult<T>>({
    data: undefined,
    loading: source != null,
    error: null,
  });
  const request = useRef(0);
  const args = useRef({ views, build, read });
  args.current = { views, build, read };

  useEffect(() => {
    if (source == null) return;
    const id = ++request.current;
    setState((s) => ({ ...s, loading: true }));
    args.current
      .views()
      .then((v) => runQueued(args.current.build(v)))
      .then((rows) => {
        if (id !== request.current) return;
        setState({
          data: args.current.read(rows),
          loading: false,
          error: null,
        });
      })
      .catch((e: unknown) => {
        if (id !== request.current) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e : new Error(String(e)),
        }));
      });
  }, [source, key]);

  return state;
}

/**
 * The stops page's table (stopsTableQuery): raw/stops.parquet joined with
 * the stops analysis table, built once per page load. `raw` is the
 * stops.txt raw table, absent when the file didn't change.
 */
export interface StopsTableSource {
  /** Identifies the table (for re-running queries). */
  key: string;
  /** The built table's name. */
  table: () => Promise<string>;
}

export function stopsTableSource(
  datasetId: string,
  analysis: MapTable,
  raw: RawTable | undefined,
): StopsTableSource {
  const analysisUrl = mapTableUrl(datasetId, analysis);
  const rawUrl = raw ? diffFileUrl(datasetId, raw.path) : null;
  const key = `stops\n${analysisUrl}\n${rawUrl ?? ''}`;
  return {
    key,
    table: () =>
      derivedTable(key, async (name) => {
        const [a, r] = await Promise.all([
          parquetView(analysisUrl),
          rawUrl ? parquetView(rawUrl) : Promise.resolve(null),
        ]);
        return stopsTableQuery(name, a, r, raw?.columns ?? []);
      }),
  };
}

/**
 * One route's detail (lib/route-detail assembleRouteDetail): its routes
 * row, its shapes, the stops it serves, the field changes of its routes.txt
 * rows (raw/routes.parquet, when routes.txt changed) and its stops' names
 * and positions (the stops.txt raw table, `stop_info_file`). Null for an
 * unknown route.
 */
export async function loadRouteDetail(
  datasetId: string,
  routesMap: RoutesMapDiff,
  rawRoutes: RawTable | undefined,
  routeId: string,
): Promise<RouteDetail | null> {
  const urls = routeTableUrls(datasetId, routesMap, rawRoutes);
  const [routeRows, shapeRows, stopRows, stopInfo] = await Promise.all([
    queryMapTables(
      urls.raw ? [urls.routes, urls.raw] : [urls.routes],
      ([d, r]) => routeDetailQuery(d, routeId, r ?? null),
    ),
    queryMapTable(urls.shapes, (v) => routeShapesQuery(v, routeId)),
    queryMapTable(urls.stops, (v) => routeServedStopsQuery(v, routeId)),
    routesMap.stop_info_file
      ? loadStopInfo(
          diffFileUrl(datasetId, routesMap.stop_info_file),
          routesMap.stop_moves_file
            ? diffFileUrl(datasetId, routesMap.stop_moves_file)
            : null,
        )
      : Promise.resolve<Record<string, RouteStopInfo>>({}),
  ]);
  const row = routeRows.at(0);
  if (row == null) return null;
  return assembleRouteDetail({
    route: toRouteRow(row),
    shapes: shapeRows.map(toShapeRow),
    stops: stopRows.map(toStopServedRow),
    fieldChanges: urls.raw ? rawFieldChanges(row) : [],
    stopInfo,
  });
}

/** The selected route's detail (loadRouteDetail); nothing while `routeId` is null. */
export function useRouteDetail(
  datasetId: string,
  routesMap: RoutesMapDiff,
  rawRoutes: RawTable | undefined,
  routeId: string | null,
): MapTableResult<RouteDetail | null> {
  const urls = routeTableUrls(datasetId, routesMap, rawRoutes);
  const { data, error, isLoading } = useSWRImmutable<RouteDetail | null, Error>(
    routeId
      ? [
          'route-detail',
          urls.routes,
          urls.shapes,
          urls.stops,
          urls.raw ?? '',
          routesMap.stop_info_file ?? '',
          routeId,
        ]
      : null,
    () => loadRouteDetail(datasetId, routesMap, rawRoutes, routeId ?? ''),
  );
  return { data, loading: isLoading, error: error ?? null };
}

/**
 * The route a shape belongs to (routeOfShapeQuery: `shapeId` its new or
 * base id), or null when no route uses it.
 */
export async function loadRouteOfShape(
  datasetId: string,
  routesMap: RoutesMapDiff,
  shapeId: string,
): Promise<{ route_id: string; kind: RouteKind } | null> {
  const urls = routeTableUrls(datasetId, routesMap);
  const rows = await queryMapTables([urls.routes, urls.shapes], ([r, s]) =>
    routeOfShapeQuery(r, s, shapeId),
  );
  const row = rows.at(0);
  return row
    ? { route_id: String(row.route_id), kind: String(row.kind) as RouteKind }
    : null;
}

/** Shapes no trip uses in either feed (unusedShapesQuery). */
export function useUnusedShapes(
  datasetId: string,
  routesMap: RoutesMapDiff,
): MapTableResult<UnusedShapeDiff[]> {
  return useMapTableQuery(
    mapTableUrl(datasetId, routesMap.shapes_table),
    'unused-shapes',
    (v) => unusedShapesQuery(v),
    (rows) => rows.map(toUnusedShape),
  );
}
