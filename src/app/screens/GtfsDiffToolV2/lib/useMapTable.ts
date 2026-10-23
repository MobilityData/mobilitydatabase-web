'use client';

import { useEffect, useRef, useState } from 'react';
import { diffFileUrl } from './datasets';
import { parquetView, runQueued } from './duckdb-client';
import type { MapTable } from './entity-diff-types';
import type { SqlQuery } from './map-table-query';

/** URL of a map's Parquet table. */
export function mapTableUrl(datasetId: string, table: MapTable): string {
  return diffFileUrl(datasetId, table.path);
}

/** URL of the table holding the entities' `detail` (its own file when split). */
export function mapDetailUrl(datasetId: string, table: MapTable): string {
  return mapTableUrl(datasetId, table.detail ?? table);
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
  const [state, setState] = useState<MapTableResult<T>>({
    data: undefined,
    loading: url != null,
    error: null,
  });
  const request = useRef(0);
  const args = useRef({ build, read });
  args.current = { build, read };

  useEffect(() => {
    if (url == null) return;
    const id = ++request.current;
    setState((s) => ({ ...s, loading: true }));
    queryMapTable(url, args.current.build)
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
  }, [url, key]);

  return state;
}
