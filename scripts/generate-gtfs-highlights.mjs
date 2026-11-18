#!/usr/bin/env node
/**
 * highlights/index.json of a diff folder: every entity's notable highlights
 * in one ranking (src/app/screens/GtfsDiffToolV2/lib/global-highlights.ts),
 * for the summary page's top few and the /highlights page. It is an index:
 * the entity lists stay in each section's highlights/<section>.json. Paths
 * from lib/diff-layout.ts.
 *
 *   - stops, routes, services: the highlights files the entity step wrote
 *     (named in each analysis's JSON, which report.json points to);
 *   - trips: computed here from the raw trip tables (raw/*.parquet) with the
 *     same SQL and rules as the Trips page (lib/raw-overview-sql.ts,
 *     lib/trips-v2-highlights.ts), plus the service of typical days
 *     (.build/trips-service.json, lib/trips-service-highlights.ts), and written to
 *     highlights/trips.json.
 *
 * Run after the entity, trips and calendar steps (it reads their outputs).
 *
 * Usage: node scripts/generate-gtfs-highlights.mjs <dataset folder>
 */

import './lib/ts-resolve.mjs';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { markStartup, timed, timingsOn } from './lib/timings.mjs';
import { readRouteInfo } from './lib/map-tables.mjs';
import {
  HIGHLIGHTS_INDEX_FILE,
  REPORT_FILE,
  TRIPS_INDEX_FILE,
  TRIPS_SERVICE_FILE,
  highlightsFilePath,
} from '../src/app/screens/GtfsDiffToolV2/lib/diff-layout.ts';

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

/** stop_ids only the base stops.txt has (raw/stops.parquet action 'deleted'). */
async function deletedStopIds(path) {
  const instance = await DuckDBInstance.create(':memory:');
  const con = await instance.connect();
  try {
    const rows = (
      await con.runAndReadAll(`SELECT trip_key AS stop_id FROM read_parquet(${sqlString(path)}) WHERE action = 'deleted'`)
    ).getRowObjectsJS();
    return rows.map((r) => String(r.stop_id));
  } finally {
    con.closeSync();
    instance.closeSync();
  }
}

/** Trips highlights from the raw trip tables, as the Trips page computes them. */
async function tripsHighlights(dir, raw, index, m) {
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

  // Route names: the routes table (lib/route-info); older indexes held them.
  const routes = index?.routes ?? (await readRouteInfo(dir, index?.route_info_file));
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
        lib('global-highlights.ts'),
        lib('raw-overview-sql.ts'),
        lib('raw-diff-query.ts'),
        lib('trips-v2-highlights.ts'),
        lib('trips-anchor.ts'),
        lib('calendar-overview-highlights.ts'),
        lib('trips-service-highlights.ts'),
        lib('highlights.ts'),
      ]),
    )),
  );
  const read = (f) =>
    existsSync(join(dir, f))
      ? JSON.parse(readFileSync(join(dir, f), 'utf8'))
      : null;

  // report.json's file entries and analyses (files.json in older builds).
  const report = timed(`read ${REPORT_FILE}`, () => read(REPORT_FILE));
  const filesDoc = report?.schema === 4 ? report : read('files.json');
  if (!filesDoc?.files)
    throw new Error(`No file entries in ${dir}/${REPORT_FILE}: run the entity step first.`);
  const analysisPath = (name) => {
    const a = filesDoc.analyses?.[name];
    return typeof a === 'string' ? a : a?.file;
  };
  // The analyses' JSON (analysis/stops.json, routes.json, services.json).
  const analysis = (name) =>
    timed(`read ${name} analysis`, () => {
      const path = analysisPath(name);
      return path ? read(path) : null;
    });
  const full = (file) => (file ? read(file)?.highlights : null);
  const rawTable = (file) => filesDoc.files.find((f) => f.file === file)?.raw_table;

  const sources = [];
  const add = (section, highlights, rowKind) => {
    if (highlights?.length) sources.push({ section, highlights, rowKind });
  };
  const stopsMap = analysis('stops');
  const routesMap = analysis('routes');
  const services = analysis('services');
  add(
    'stops',
    timed('stops: read highlights', () => full(stopsMap?.highlights_file)),
    () => 'stop',
  );
  add(
    'routes',
    timed('routes: read highlights', () => full(routesMap?.highlights_file)),
    (id) => (id === 'unused_shapes' ? 'shape' : 'route'),
  );
  add(
    'services',
    timed('services: read highlights', () => full(services?.highlights_file)),
    (id) => (m.DATE_HIGHLIGHTS.has(id) ? 'date' : 'service'),
  );
  // Stops gone from the new stops.txt are the Stops page's removed stops,
  // not stops "left without service".
  const stopsTable = rawTable('stops.txt')?.path;
  const removedStops = new Set(
    stopsTable
      ? await timed('read removed stops (raw/stops.parquet)', () => deletedStopIds(join(dir, stopsTable)))
      : [],
  );
  const service = timed(`read ${TRIPS_SERVICE_FILE}`, () => read(TRIPS_SERVICE_FILE));
  const tripsList = [
    ...(await timed('trips: raw table highlights (total)', async () =>
      tripsHighlights(dir, [rawTable('trips.txt'), rawTable('stop_times.txt')].filter(Boolean), timed(`read ${TRIPS_INDEX_FILE}`, () => read(TRIPS_INDEX_FILE)), m),
    )),
    ...(service
      ? timed('trips: service highlights (serviceHighlights)', () => m.serviceHighlights(service, { exclude: removedStops }))
      : []),
  ].sort((a, b) => b.score - a.score);
  add('trips', tripsList, (id) => (id === 'stops_unserved' ? 'stop' : 'route'));
  // The trips section's highlights file, like the entity step's.
  const tripsFile = highlightsFilePath('trips');
  mkdirSync(dirname(join(dir, tripsFile)), { recursive: true });
  timed(
    `write ${tripsFile}`,
    () => writeFileSync(join(dir, tripsFile), JSON.stringify({ schema: 1, section: 'trips', highlights: tripsList })),
    () => ({ bytes: statSync(join(dir, tripsFile)).size }),
  );
  const files = Object.fromEntries(
    [
      ['stops', stopsMap?.highlights_file],
      ['routes', routesMap?.highlights_file],
      ['services', services?.highlights_file],
      ['trips', tripsFile],
    ].filter(([, file]) => file != null),
  );

  const items = timed('global ranking (rankGlobalHighlights)', () => m.rankGlobalHighlights(sources), (r) => ({ rows: r.length }));
  const doc = timed('highlightsDoc + covered + index', () => {
    const d = m.highlightsDoc(basename(dir), items);
    d.covered = m.coveredHighlights(sources, items);
    return m.highlightsIndex(d, files);
  });
  mkdirSync(dirname(join(dir, HIGHLIGHTS_INDEX_FILE)), { recursive: true });
  timed(
    `write ${HIGHLIGHTS_INDEX_FILE}`,
    () => writeFileSync(join(dir, HIGHLIGHTS_INDEX_FILE), JSON.stringify(doc)),
    () => ({ bytes: statSync(join(dir, HIGHLIGHTS_INDEX_FILE)).size }),
  );

  const bySection = Object.entries(doc.counts.sections)
    .map(([s, n]) => `${s} ${n}`)
    .join(', ');
  console.log(
    `Wrote ${HIGHLIGHTS_INDEX_FILE}: ${doc.counts.total} highlights (${doc.counts.error} critical, ${doc.counts.warning} warnings; ${bySection || 'none'}), ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
  for (const h of items.slice(0, m.SUMMARY_TOP))
    console.log(`  #${h.rank} ${h.score.toFixed(3)} [${h.section}] ${h.title}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
