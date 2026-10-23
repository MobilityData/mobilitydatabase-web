'use client';

import { useEffect, useRef, useState } from 'react';
import { diffFileUrl } from './datasets';
import { getConnection, parquetView, runQueued } from './duckdb-client';
import {
  RAW_ACTIONS,
  type RawAction,
  type RawDiffFilters,
  type RawDiffRow,
  type RawDiffSort,
  type SqlQuery,
  columnStatsQuery,
  countsQuery,
  gtfsColumns,
  pageQuery,
  routesQuery,
  toRawDiffRow,
} from './raw-diff-query';

/** URL of a GTFS file's raw row table: <diff>/raw/<name>.parquet */
export function rawTableUrl(datasetId: string, file: string): string {
  return diffFileUrl(datasetId, `raw/${file.replace(/\.txt$/, '')}.parquet`);
}

interface TableInfo {
  view: string;
  columns: string[];
  routes: string[];
}

const tableInfo = new Map<string, Promise<TableInfo>>();

/** View name, GTFS columns and route ids of a raw table (once per URL). */
export function loadRawTable(url: string): Promise<TableInfo> {
  let p = tableInfo.get(url);
  if (p == null) {
    p = (async () => {
      const view = await parquetView(url);
      const conn = await getConnection();
      const schema = await conn.query(`DESCRIBE ${view}`);
      const names = schema
        .toArray()
        .map((r) => String((r as { column_name: unknown }).column_name));
      const routes = await conn.query(routesQuery(view));
      return {
        view,
        columns: gtfsColumns(names),
        routes: routes
          .toArray()
          .map((r) => String((r as { route_id: unknown }).route_id)),
      };
    })();
    p.catch(() => tableInfo.delete(url));
    tableInfo.set(url, p);
  }
  return p;
}

const run = (query: SqlQuery): Promise<Array<Record<string, unknown>>> =>
  runQueued(query);

/** One slice of a raw table's rows (the infinite-scroll table loads several). */
export async function fetchRawDiffRows({
  datasetId,
  file,
  filters,
  sort = null,
  offset,
  limit,
}: RawDiffRowsArgs): Promise<RawDiffRow[]> {
  const info = await loadRawTable(rawTableUrl(datasetId, file));
  const rows = await run(
    pageQuery(info.view, filters, info.columns, sort, offset, limit),
  );
  return rows.map((r) => toRawDiffRow(r, info.columns));
}

export interface RawDiffRowsArgs {
  datasetId: string;
  /** GTFS file: trips.txt, stop_times.txt, frequencies.txt */
  file: string;
  filters: RawDiffFilters;
  sort?: RawDiffSort | null;
  offset: number;
  limit: number;
}

export interface RawDiffRowsResult {
  /** GTFS columns of the file (each row has base and new values for them). */
  columns: string[];
  /** Route ids present in the table, for a route filter. */
  routes: string[];
  rows: RawDiffRow[];
  /** Rows matching every filter. */
  total: number;
  /** Rows per action matching every filter except the action one. */
  counts: Record<RawAction, number>;
  /** Modified rows per changed column, same filters as `counts`. */
  columnStats: Array<{ column: string; count: number }>;
  loading: boolean;
  error: Error | null;
}

const EMPTY_COUNTS = Object.fromEntries(
  RAW_ACTIONS.map((a) => [a, 0]),
) as Record<RawAction, number>;

/** Per-action counts and column stats by table + filters (without the action filter). */
const countsCache = new Map<
  string,
  {
    byAction: Record<RawAction, number>;
    columnStats: Array<{ column: string; count: number }>;
  }
>();

/**
 * One page of a raw diff table, queried in the browser with DuckDB-WASM
 * over HTTP range requests. Keeps showing the previous page while the next
 * one loads.
 */
export function useRawDiffRows({
  datasetId,
  file,
  filters,
  sort = null,
  offset,
  limit,
}: RawDiffRowsArgs): RawDiffRowsResult {
  const url = rawTableUrl(datasetId, file);
  const [state, setState] = useState<Omit<RawDiffRowsResult, 'loading'>>({
    columns: [],
    routes: [],
    rows: [],
    total: 0,
    counts: EMPTY_COUNTS,
    columnStats: [],
    error: null,
  });
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  // Primitive dependency: filters and sort are fresh objects every render.
  const key = JSON.stringify([url, filters, sort, offset, limit]);

  useEffect(() => {
    const id = ++request.current;
    setLoading(true);
    loadRawTable(url)
      .then(async (info) => {
        // One connection: run the two statements in turn. Paging doesn't
        // change the counts, so they are cached per filter set.
        const rows = await run(
          pageQuery(info.view, filters, info.columns, sort, offset, limit),
        );
        const countsKey = JSON.stringify([url, { ...filters, actions: [] }]);
        let summary = countsCache.get(countsKey);
        if (summary == null) {
          const byAction = { ...EMPTY_COUNTS };
          for (const c of await run(
            countsQuery(info.view, filters, info.columns),
          ))
            byAction[c.action as RawAction] = Number(c.n);
          const columnStats = (
            await run(columnStatsQuery(info.view, filters, info.columns))
          ).map((c) => ({ column: String(c.col), count: Number(c.n) }));
          summary = { byAction, columnStats };
          countsCache.set(countsKey, summary);
        }
        const { byAction, columnStats } = summary;
        if (id !== request.current) return;
        setState({
          columns: info.columns,
          routes: info.routes,
          rows: rows.map((r) => toRawDiffRow(r, info.columns)),
          total: filters.actions.reduce((s, a) => s + byAction[a], 0),
          counts: byAction,
          columnStats,
          error: null,
        });
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (id !== request.current) return;
        setState((s) => ({
          ...s,
          error: e instanceof Error ? e : new Error(String(e)),
        }));
        setLoading(false);
      });
  }, [key]);

  return { ...state, loading };
}
