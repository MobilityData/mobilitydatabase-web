'use client';

import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import useSWRImmutable from 'swr/immutable';
import { getDuckDb } from './duckdb-client';
import { loadRawTable, rawTableUrl } from './useRawDiffRows';
import type { HighlightSignals, Transition } from './trips-v2-highlights';
import { VALUE_TESTS } from './raw-diff-query';

/** Whole-feed statistics of the raw trip tables, for the Trips v2 overview. */
export interface RawFileOverview {
  file: string;
  /** Modified rows per changed column, most changed first. */
  columns: Array<{ column: string; rows: number }>;
  /** Modified rows (the base of the column shares). */
  modified: number;
}

export interface RawOverview {
  files: RawFileOverview[];
  /** Distinct route_ids with an added, removed or modified row. */
  routes: number;
  /** Inputs of the overview's notable highlights (lib/trips-v2-highlights). */
  signals: HighlightSignals;
}

const CHANGES = "('added', 'deleted', 'modified')";

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

async function fetchOverview(
  datasetId: string,
  files: string[],
): Promise<RawOverview> {
  const routes = new Set<string>();
  const out: RawFileOverview[] = [];
  // One table at a time: queries on one connection run in turn anyway.
  for (const file of files) {
    const { view } = await loadRawTable(rawTableUrl(datasetId, file));
    const cols = await rows(
      `SELECT col, count(*)::INTEGER AS n FROM (
         SELECT unnest(string_split(changed, ',')) AS col FROM ${view}
         WHERE action = 'modified' AND coalesce(changed, '') <> ''
       ) GROUP BY col ORDER BY n DESC, col`,
    );
    const [mod] = await rows(
      `SELECT count(*)::INTEGER AS n FROM ${view} WHERE action = 'modified'`,
    );
    for (const r of await rows(
      `SELECT DISTINCT route_id FROM ${view}
       WHERE action IN ${CHANGES} AND route_id IS NOT NULL`,
    ))
      routes.add(String(r.route_id));
    out.push({
      file,
      columns: cols.map((r) => ({ column: String(r.col), rows: Number(r.n) })),
      modified: Number(mod?.n ?? 0),
    });
  }
  return {
    files: out,
    routes: routes.size,
    signals: await fetchSignals(datasetId, files),
  };
}

/** Value moved away from `good` (lost) or onto it (gained), in modified rows. */
async function transition(
  view: string,
  column: string,
  regular: string,
  good: string,
): Promise<Transition> {
  const b = `"b_${column}"`;
  const nn = `"n_${column}"`;
  const [r] = await rows(
    `SELECT
       count(*) FILTER (WHERE ${regular.replace(/\$/g, b)} AND NOT ${good.replace(/\$/g, nn)})::INTEGER AS lost,
       count(*) FILTER (WHERE NOT ${good.replace(/\$/g, b)} AND ${regular.replace(/\$/g, nn)})::INTEGER AS gained
     FROM ${view} WHERE action = 'modified'`,
  );
  return { lost: Number(r?.lost ?? 0), gained: Number(r?.gained ?? 0) };
}

/** Per-route trip balance and rider-facing value changes, for the highlights. */
async function fetchSignals(
  datasetId: string,
  files: string[],
): Promise<HighlightSignals> {
  const signals: HighlightSignals = {
    routeTrips: [],
    wheelchair: null,
    bikes: null,
    pickup: null,
    dropOff: null,
  };
  if (files.includes('trips.txt')) {
    const { view, columns } = await loadRawTable(
      rawTableUrl(datasetId, 'trips.txt'),
    );
    signals.routeTrips = (
      await rows(
        `SELECT route_id,
           count(*) FILTER (WHERE action <> 'added')::INTEGER AS base,
           count(*) FILTER (WHERE action <> 'deleted')::INTEGER AS new
         FROM ${view} WHERE route_id IS NOT NULL GROUP BY route_id`,
      )
    ).map((r) => ({
      route: String(r.route_id),
      base: Number(r.base),
      new: Number(r.new),
    }));
    const isOne = VALUE_TESTS.one;
    if (columns.includes('wheelchair_accessible'))
      signals.wheelchair = await transition(
        view,
        'wheelchair_accessible',
        isOne,
        isOne,
      );
    if (columns.includes('bikes_allowed'))
      signals.bikes = await transition(view, 'bikes_allowed', isOne, isOne);
  }
  if (files.includes('stop_times.txt')) {
    const { view, columns } = await loadRawTable(
      rawTableUrl(datasetId, 'stop_times.txt'),
    );
    const regular = VALUE_TESTS.regularBoarding;
    const notNone = `NOT ${VALUE_TESTS.noBoarding}`;
    if (columns.includes('pickup_type'))
      signals.pickup = await transition(view, 'pickup_type', regular, notNone);
    if (columns.includes('drop_off_type'))
      signals.dropOff = await transition(
        view,
        'drop_off_type',
        regular,
        notNone,
      );
  }
  return signals;
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
