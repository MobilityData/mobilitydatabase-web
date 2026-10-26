/**
 * Whole-feed statistics of the raw trip tables (raw/trips.parquet,
 * raw/stop_times.parquet) and the inputs of the Trips notable highlights.
 *
 * Shared by the browser (lib/useRawOverview.ts, DuckDB-WASM) and the build
 * (scripts/generate-gtfs-highlights.mjs, DuckDB for Node): both run the same
 * SQL through their own `query`, so the highlights ranked at build time
 * match the ones the Trips page computes.
 *
 * Type-only imports besides raw-diff-query: the Node build imports this file.
 */

import { VALUE_TESTS } from './raw-diff-query';
import type { HighlightSignals, Transition } from './trips-v2-highlights';

/** Runs one statement; rows as plain objects. */
export type QueryRows = (
  sql: string,
) => Promise<Array<Record<string, unknown>>>;

/** A raw table opened as a view, with its GTFS columns. */
export interface RawView {
  view: string;
  columns: string[];
}

/** Whole-feed statistics of one raw table. */
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

function checkView(view: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(view)) throw new Error(`Bad view: ${view}`);
  return view;
}

/** Value moved away from `good` (lost) or onto it (gained), in modified rows. */
async function transition(
  query: QueryRows,
  view: string,
  column: string,
  regular: string,
  good: string,
): Promise<Transition> {
  const b = `"b_${column}"`;
  const nn = `"n_${column}"`;
  const [r] = await query(
    `SELECT
       count(*) FILTER (WHERE ${regular.replace(/\$/g, b)} AND NOT ${good.replace(/\$/g, nn)})::INTEGER AS lost,
       count(*) FILTER (WHERE NOT ${good.replace(/\$/g, b)} AND ${regular.replace(/\$/g, nn)})::INTEGER AS gained
     FROM ${checkView(view)} WHERE action = 'modified'`,
  );
  return { lost: Number(r?.lost ?? 0), gained: Number(r?.gained ?? 0) };
}

/** Per-route trip balance and rider-facing value changes, for the highlights. */
export async function rawSignals(
  query: QueryRows,
  tables: { trips?: RawView; stopTimes?: RawView },
): Promise<HighlightSignals> {
  const signals: HighlightSignals = {
    routeTrips: [],
    wheelchair: null,
    bikes: null,
    pickup: null,
    dropOff: null,
  };
  const { trips, stopTimes } = tables;
  if (trips) {
    signals.routeTrips = (
      await query(
        `SELECT route_id,
           count(*) FILTER (WHERE action <> 'added')::INTEGER AS base,
           count(*) FILTER (WHERE action <> 'deleted')::INTEGER AS new
         FROM ${checkView(trips.view)} WHERE route_id IS NOT NULL GROUP BY route_id`,
      )
    ).map((r) => ({
      route: String(r.route_id),
      base: Number(r.base),
      new: Number(r.new),
    }));
    const isOne = VALUE_TESTS.one;
    if (trips.columns.includes('wheelchair_accessible'))
      signals.wheelchair = await transition(
        query,
        trips.view,
        'wheelchair_accessible',
        isOne,
        isOne,
      );
    if (trips.columns.includes('bikes_allowed'))
      signals.bikes = await transition(
        query,
        trips.view,
        'bikes_allowed',
        isOne,
        isOne,
      );
  }
  if (stopTimes) {
    const regular = VALUE_TESTS.regularBoarding;
    const notNone = `NOT ${VALUE_TESTS.noBoarding}`;
    if (stopTimes.columns.includes('pickup_type'))
      signals.pickup = await transition(
        query,
        stopTimes.view,
        'pickup_type',
        regular,
        notNone,
      );
    if (stopTimes.columns.includes('drop_off_type'))
      signals.dropOff = await transition(
        query,
        stopTimes.view,
        'drop_off_type',
        regular,
        notNone,
      );
  }
  return signals;
}

/** Changed columns and changed routes of one raw table. */
export async function rawFileOverview(
  query: QueryRows,
  file: string,
  table: RawView,
): Promise<{ overview: RawFileOverview; routes: string[] }> {
  const view = checkView(table.view);
  const cols = await query(
    `SELECT col, count(*)::INTEGER AS n FROM (
       SELECT unnest(string_split(changed, ',')) AS col FROM ${view}
       WHERE action = 'modified' AND coalesce(changed, '') <> ''
     ) GROUP BY col ORDER BY n DESC, col`,
  );
  const [mod] = await query(
    `SELECT count(*)::INTEGER AS n FROM ${view} WHERE action = 'modified'`,
  );
  const routes = await query(
    `SELECT DISTINCT route_id FROM ${view}
     WHERE action IN ${CHANGES} AND route_id IS NOT NULL`,
  );
  return {
    overview: {
      file,
      columns: cols.map((r) => ({ column: String(r.col), rows: Number(r.n) })),
      modified: Number(mod?.n ?? 0),
    },
    routes: routes.map((r) => String(r.route_id)),
  };
}

/** Every statistic of the trip files, one table at a time. */
export async function rawOverview(
  query: QueryRows,
  tables: { trips?: RawView; stopTimes?: RawView },
): Promise<RawOverview> {
  const routes = new Set<string>();
  const files: RawFileOverview[] = [];
  const pairs: Array<[string, RawView | undefined]> = [
    ['trips.txt', tables.trips],
    ['stop_times.txt', tables.stopTimes],
  ];
  for (const [file, table] of pairs) {
    if (!table) continue;
    const r = await rawFileOverview(query, file, table);
    files.push(r.overview);
    for (const id of r.routes) routes.add(id);
  }
  return {
    files,
    routes: routes.size,
    signals: await rawSignals(query, tables),
  };
}
