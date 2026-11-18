'use client';

import useSWRImmutable from 'swr/immutable';
import { diffFileUrl } from './datasets';
import { TRIPS_DAY_ROUTES_FILE } from './diff-layout';
import { parquetView, runQueued } from './duckdb-client';
import { type DayRoutesRow, toDayRoutesRow } from './trips-day-routes';

export interface DayRoutesResult {
  /** Undefined while loading or on error. */
  rows: DayRoutesRow[] | undefined;
  error: Error | undefined;
}

async function loadDayRoutes(url: string): Promise<DayRoutesRow[]> {
  const view = await parquetView(url);
  const rows = await runQueued({ sql: `SELECT * FROM ${view}`, params: [] });
  return rows.map(toDayRoutesRow);
}

/** Every row of views/trips/day-routes.parquet (lib/trips-day-routes). */
export function useDayRoutes(datasetId: string): DayRoutesResult {
  const { data, error } = useSWRImmutable<DayRoutesRow[], Error>(
    diffFileUrl(datasetId, TRIPS_DAY_ROUTES_FILE),
    loadDayRoutes,
  );
  return { rows: data, error };
}
