'use client';

/**
 * One DuckDB-WASM database per page load, created on first use.
 *
 * The module and its ~7 MB WebAssembly binary load only when Parquet is
 * first read (a raw diff table, a day of trips, a long change list): the JS
 * through a dynamic import, the binary and
 * worker from jsDelivr (pinned to the installed package version), so
 * neither ends up in the app bundle.
 */

import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

let dbPromise: Promise<AsyncDuckDB> | null = null;
let connPromise: Promise<AsyncDuckDBConnection> | null = null;
const registered = new Map<string, Promise<string>>();
/** View names are taken before any await, so concurrent registrations differ. */
let nextView = 0;

async function createDb(): Promise<AsyncDuckDB> {
  const duckdb = await import('@duckdb/duckdb-wasm');
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  if (bundle.mainWorker == null) throw new Error('No DuckDB worker bundle');
  // Cross-origin workers can't be constructed directly: wrap in a blob.
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], {
      type: 'text/javascript',
    }),
  );
  const worker = new Worker(workerUrl);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  // Read Parquet with HTTP range requests: this build forces whole-file
  // reads by default (a 31 MB raw table for a page of 100 rows). Full reads
  // stay allowed as a fallback (the parquet extension's own download).
  // Range support is detected with `HEAD` + `Range: bytes=0-`, answered 206
  // by the diff server and object storage.
  await db.open({
    filesystem: {
      forceFullHTTPReads: false,
      allowFullHTTPReads: true,
      reliableHeadRequests: true,
    },
  });
  return db;
}

export function getDuckDb(): Promise<AsyncDuckDB> {
  dbPromise ??= createDb().catch((e: unknown) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

/** Shared connection; DuckDB-WASM runs its queries one at a time anyway. */
export function getConnection(): Promise<AsyncDuckDBConnection> {
  connPromise ??= getDuckDb()
    .then((db) => db.connect())
    .catch((e: unknown) => {
      connPromise = null;
      throw e;
    });
  return connPromise;
}

/**
 * Files up to this size are downloaded whole and handed to DuckDB from
 * memory: reading them with ranges costs more requests, and often more
 * bytes (overlapping ranges, re-reads), than one GET.
 */
export const WHOLE_FILE_BYTES = 4 * 1024 * 1024;

/** Content-Length from a HEAD request, or null when unknown. */
async function remoteSize(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const n = Number(res.headers.get('content-length'));
    return res.ok && Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * A view over a remote Parquet file: downloaded whole when small
 * (WHOLE_FILE_BYTES), otherwise read with HTTP range requests. Returns the
 * view's name; the same URL is registered once.
 */
export function parquetView(url: string): Promise<string> {
  let p = registered.get(url);
  if (p == null) {
    const name = `raw_${nextView++}`;
    p = (async () => {
      const duckdb = await import('@duckdb/duckdb-wasm');
      const db = await getDuckDb();
      const conn = await getConnection();
      const absolute = new URL(url, window.location.href).toString();
      const size = await remoteSize(absolute);
      if (size != null && size <= WHOLE_FILE_BYTES) {
        const res = await fetch(absolute);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
        await db.registerFileBuffer(
          `${name}.parquet`,
          new Uint8Array(await res.arrayBuffer()),
        );
      } else {
        await db.registerFileURL(
          `${name}.parquet`,
          absolute,
          duckdb.DuckDBDataProtocol.HTTP,
          false,
        );
      }
      await conn.query(
        `CREATE OR REPLACE VIEW ${name} AS SELECT * FROM read_parquet('${name}.parquet')`,
      );
      return name;
    })();
    p.catch(() => registered.delete(url));
    registered.set(url, p);
  }
  return p;
}

/** Runs a prepared statement; rows as plain objects. */
export async function queryObjects(
  sql: string,
  params: unknown[] = [],
): Promise<Array<Record<string, unknown>>> {
  const conn = await getConnection();
  const stmt = await conn.prepare(sql);
  try {
    const table = await stmt.query(...params);
    return table
      .toArray()
      .map((r) => (r as { toJSON(): Record<string, unknown> }).toJSON());
  } finally {
    await stmt.close();
  }
}

/** Tail of the query queue: statements share one connection, run them in turn. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs a prepared statement after every statement queued before it (the
 * pages run several at once: list segments, counts, map points).
 */
export function runQueued(query: {
  sql: string;
  params: unknown[];
}): Promise<Array<Record<string, unknown>>> {
  const exec = (): Promise<Array<Record<string, unknown>>> =>
    queryObjects(query.sql, query.params);
  const result = queue.then(exec, exec);
  queue = result.catch(() => undefined);
  return result;
}
