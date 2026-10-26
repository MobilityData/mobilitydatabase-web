'use client';

import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import useSWRImmutable from 'swr/immutable';
import { getDuckDb } from './duckdb-client';
import { loadRawTable, rawTableUrl } from './useRawDiffRows';
import {
  type RawOverview,
  type RawView,
  rawOverview,
} from './raw-overview-sql';

export type { RawFileOverview, RawOverview } from './raw-overview-sql';

/**
 * Its own connection: the raw tables queue their statements on the shared
 * one, and an interleaved prepared statement there could cut into a page.
 * Views live in the database, so they are visible from here too.
 */
let connection: Promise<AsyncDuckDBConnection> | null = null;

function ownConnection(): Promise<AsyncDuckDBConnection> {
  connection ??= getDuckDb().then((db) => db.connect());
  connection.catch(() => {
    connection = null;
  });
  return connection;
}

async function rows(sql: string): Promise<Array<Record<string, unknown>>> {
  const conn = await ownConnection();
  const table = await conn.query(sql);
  return table
    .toArray()
    .map((r) => (r as { toJSON(): Record<string, unknown> }).toJSON());
}

/** Same statistics as the build's (lib/raw-overview-sql.ts), over HTTP. */
async function fetchOverview(
  datasetId: string,
  files: string[],
): Promise<RawOverview> {
  const open = async (file: string): Promise<RawView | undefined> =>
    files.includes(file)
      ? loadRawTable(rawTableUrl(datasetId, file))
      : undefined;
  // One table at a time: queries on one connection run in turn anyway.
  const trips = await open('trips.txt');
  const stopTimes = await open('stop_times.txt');
  return rawOverview(rows, { trips, stopTimes });
}

/** Loads once per dataset and file list; null files skips loading. */
export function useRawOverview(
  datasetId: string,
  files: string[] | null,
): { data: RawOverview | undefined; error: Error | undefined } {
  const { data, error } = useSWRImmutable<RawOverview, Error>(
    files && files.length > 0 ? ['raw-overview', datasetId, ...files] : null,
    () => fetchOverview(datasetId, files ?? []),
  );
  return { data, error };
}
