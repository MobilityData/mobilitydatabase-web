#!/usr/bin/env node
/**
 * highlights.json of a diff folder: every entity's notable highlights in
 * one ranking (src/app/screens/GtfsDiffToolV2/lib/global-highlights.ts), for
 * the summary page's top few and the /highlights page.
 *
 *   - stops, routes, calendar: the highlights their entity step stored
 *     (categories/<id>.json);
 *   - trips: computed here from the raw trip tables (raw/*.parquet) with the
 *     same SQL and rules as the Trips page (lib/raw-overview-sql.ts,
 *     lib/trips-v2-highlights.ts), plus the service of typical days
 *     (trips-service.json, lib/trips-service-highlights.ts).
 *
 * Run after the entity, trips and calendar steps (it reads their outputs).
 *
 * Usage: node scripts/generate-gtfs-highlights.mjs <dataset folder>
 */

import './lib/ts-resolve.mjs';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { markStartup, timed, timingsOn } from './lib/timings.mjs';

const LIB = new URL('../src/app/screens/GtfsDiffToolV2/lib/', import.meta.url);
const lib = (file) => import(new URL(file, LIB).href);

function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/** Timing label of one raw-overview query (lib/raw-overview-sql.ts). */
function queryLabel(sql) {
  const view = /\b(raw_trips|raw_stop_times)\b/.exec(sql)?.[1] ?? '?';
  const what = /^\s*DESCRIBE/.test(sql)
    ? 'describe'
    : /string_split\(changed/.test(sql)
      ? 'rawFileOverview changed columns'
      : /DISTINCT route_id/.test(sql)
        ? 'rawFileOverview changed routes'
        : /GROUP BY route_id/.test(sql)
          ? 'rawSignals route trip balance'
          : /"b_(\w+)"/.test(sql)
            ? `rawSignals transition ${/"b_(\w+)"/.exec(sql)[1]}`
            : /count\(\*\)::INTEGER AS n FROM \S+ WHERE action = 'modified'/.test(sql)
              ? 'rawFileOverview modified count'
              : sql.replace(/\s+/g, ' ').trim().slice(0, 60);
  return `sql ${view}: ${what}`;
}

/** Trips highlights from the raw trip tables, as the Trips page computes them. */
async function tripsHighlights(dir, tripsCat, index, m) {
  const raw = tripsCat?.raw_tables ?? [];
  const tripsTable = raw.find((t) => t.file === 'trips.txt');
  const stopTimesTable = raw.find((t) => t.file === 'stop_times.txt');
  if (!tripsTable && !stopTimesTable) return [];

  const instance = await DuckDBInstance.create(':memory:');
  const con = await instance.connect();
  const run = async (sql) => (await con.runAndReadAll(sql)).getRowObjectsJS();
  // Each query timed on its own when timings are on.
  const query = timingsOn ? (sql) => timed(queryLabel(sql), () => run(sql), (r) => ({ rows: r.length })) : run;
  const open = async (table, view) => {
    if (!table) return undefined;
    await con.run(
      `CREATE VIEW ${view} AS SELECT * FROM read_parquet(${sqlString(join(dir, table.path))})`,
    );
    const names = (await query(`DESCRIBE ${view}`)).map((r) =>
      String(r.column_name),
    );
    return { view, columns: m.gtfsColumns(names) };
  };
  const trips = await open(tripsTable, 'raw_trips');
  const stopTimes = await open(stopTimesTable, 'raw_stop_times');
  const overview = await timed('trips: rawOverview (total)', () => m.rawOverview(query, { trips, stopTimes }));
  con.closeSync?.();

  const routes = index?.routes ?? {};
  return timed('trips: allHighlights (trips-v2 rules)', () => m.allHighlights({
    trips: tripsTable,
    stopTimes: stopTimesTable,
    stopTimeColumns: overview.files.find((f) => f.file === 'stop_times.txt')
      ?.columns,
    signals: overview.signals,
    coverage: index ? m.feedCoverage(index) : null,
    routeName: (id) => routes[id]?.short_name || id,
  }));
}

async function main() {
  const dir = process.argv[2] ? resolve(process.argv[2]) : null;
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(
      'Usage: node scripts/generate-gtfs-highlights.mjs <dataset folder>',
    );
    process.exit(1);
  }
  markStartup();
  const t0 = Date.now();
  const m = Object.assign(
    {},
    ...(await timed('import TS libs', () =>
      Promise.all([
        lib('entity-diff-codec.ts'),
        lib('global-highlights.ts'),
        lib('raw-overview-sql.ts'),
        lib('raw-diff-query.ts'),
        lib('trips-v2-highlights.ts'),
        lib('trips-anchor.ts'),
        lib('calendar-overview-highlights.ts'),
        lib('trips-service-highlights.ts'),
      ]),
    )),
  );
  const read = (f) =>
    existsSync(join(dir, f))
      ? JSON.parse(readFileSync(join(dir, f), 'utf8'))
      : null;

  const entity = timed('read entity-diff.json', () => read('entity-diff.json'));
  if (!entity)
    throw new Error(
      `No entity-diff.json in ${dir}: run the entity step first.`,
    );
  // Categories' detail files (maps, calendar) merged back, as for the report.
  timed('read + decode categories/*.json', () => {
    for (const cat of entity.categories ?? [])
      if (cat.detail) Object.assign(cat, m.decodeDeep(read(cat.detail)));
  });
  const cat = (id) => entity.categories?.find((c) => c.id === id);
  // The categories keep each highlight's first rows only; ranking counts
  // every entity, so read the full lists (<section>-highlights.json).
  const full = (inline, file) =>
    (file ? read(file)?.highlights : null) ?? inline;

  const sources = [];
  const add = (section, highlights, rowKind) => {
    if (highlights?.length) sources.push({ section, highlights, rowKind });
  };
  const stopsMap = cat('stops')?.stops_map;
  const routesMap = cat('routes')?.routes_map;
  const calendar = cat('calendar')?.calendar;
  add(
    'stops',
    timed('stops: read highlights', () => full(stopsMap?.highlights, stopsMap?.highlights_file)),
    () => 'stop',
  );
  add(
    'routes',
    timed('routes: read highlights', () => full(routesMap?.highlights, routesMap?.highlights_file)),
    (id) => (id === 'unused_shapes' ? 'shape' : 'route'),
  );
  add(
    'calendar',
    timed('calendar: read highlights', () => full(calendar?.overview_highlights, calendar?.overview_highlights_file)),
    (id) => (m.DATE_HIGHLIGHTS.has(id) ? 'date' : 'service'),
  );
  // Stops gone from the new stops.txt are the Stops page's removed stops,
  // not stops "left without service".
  const allStopsPath = cat('stops')?.stops_map?.all_stops?.path;
  const allStops = allStopsPath ? timed('read maps/all_stops_data.json', () => read(allStopsPath)) : null;
  const inNew = new Set((allStops?.new ?? []).map((r) => r[0]));
  const removedStops = new Set(
    (allStops?.base ?? []).map((r) => r[0]).filter((id) => !inNew.has(id)),
  );
  const service = timed(`read ${m.TRIPS_SERVICE_FILE}`, () => read(m.TRIPS_SERVICE_FILE));
  add(
    'trips',
    [
      ...(await timed('trips: raw table highlights (total)', async () =>
        tripsHighlights(dir, cat('trips'), timed('read trips-diff.json', () => read('trips-diff.json')), m),
      )),
      ...(service
        ? timed('trips: service highlights (serviceHighlights)', () => m.serviceHighlights(service, { exclude: removedStops }))
        : []),
    ].sort((a, b) => b.score - a.score),
    (id) => (id === 'stops_unserved' ? 'stop' : 'route'),
  );

  const items = timed('global ranking (rankGlobalHighlights)', () => m.rankGlobalHighlights(sources), (r) => ({ rows: r.length }));
  const doc = timed('highlightsDoc + covered + report top', () => {
    const d = m.highlightsDoc(basename(dir), items);
    d.covered = m.coveredHighlights(sources, items);
    d.report = m.reportTopHighlights(d);
    return d;
  });
  timed(
    `write ${m.HIGHLIGHTS_FILE}`,
    () => writeFileSync(join(dir, m.HIGHLIGHTS_FILE), JSON.stringify(doc)),
    () => ({ bytes: statSync(join(dir, m.HIGHLIGHTS_FILE)).size }),
  );

  const bySection = Object.entries(doc.counts.sections)
    .map(([s, n]) => `${s} ${n}`)
    .join(', ');
  console.log(
    `Wrote ${m.HIGHLIGHTS_FILE}: ${doc.counts.total} highlights (${doc.counts.error} critical, ${doc.counts.warning} warnings; ${bySection || 'none'}), ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
  for (const h of items.slice(0, m.SUMMARY_TOP))
    console.log(`  #${h.rank} ${h.score.toFixed(3)} [${h.section}] ${h.title}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
