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
 *     lib/trips-v2-highlights.ts).
 *
 * Run after the entity and trips steps (it reads their outputs).
 *
 * Usage: node scripts/generate-gtfs-highlights.mjs <dataset folder>
 */

import './lib/ts-resolve.mjs';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';

const LIB = new URL('../src/app/screens/GtfsDiffToolV2/lib/', import.meta.url);
const lib = (file) => import(new URL(file, LIB).href);

function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/** Trips highlights from the raw trip tables, as the Trips page computes them. */
async function tripsHighlights(dir, tripsCat, index, m) {
  const raw = tripsCat?.raw_tables ?? [];
  const tripsTable = raw.find((t) => t.file === 'trips.txt');
  const stopTimesTable = raw.find((t) => t.file === 'stop_times.txt');
  if (!tripsTable && !stopTimesTable) return [];

  const instance = await DuckDBInstance.create(':memory:');
  const con = await instance.connect();
  const query = async (sql) => (await con.runAndReadAll(sql)).getRowObjectsJS();
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
  const overview = await m.rawOverview(query, { trips, stopTimes });
  con.closeSync?.();

  const routes = index?.routes ?? {};
  return m.allHighlights({
    trips: tripsTable,
    stopTimes: stopTimesTable,
    stopTimeColumns: overview.files.find((f) => f.file === 'stop_times.txt')
      ?.columns,
    signals: overview.signals,
    coverage: index ? m.feedCoverage(index) : null,
    routeName: (id) => routes[id]?.short_name || id,
  });
}

async function main() {
  const dir = process.argv[2] ? resolve(process.argv[2]) : null;
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(
      'Usage: node scripts/generate-gtfs-highlights.mjs <dataset folder>',
    );
    process.exit(1);
  }
  const t0 = Date.now();
  const m = Object.assign(
    {},
    ...(await Promise.all([
      lib('entity-diff-codec.ts'),
      lib('global-highlights.ts'),
      lib('raw-overview-sql.ts'),
      lib('raw-diff-query.ts'),
      lib('trips-v2-highlights.ts'),
      lib('trips-anchor.ts'),
      lib('calendar-overview-highlights.ts'),
    ])),
  );
  const read = (f) =>
    existsSync(join(dir, f))
      ? JSON.parse(readFileSync(join(dir, f), 'utf8'))
      : null;

  const entity = read('entity-diff.json');
  if (!entity)
    throw new Error(
      `No entity-diff.json in ${dir}: run the entity step first.`,
    );
  // Categories' detail files (maps, calendar) merged back, as for the report.
  for (const cat of entity.categories ?? [])
    if (cat.detail) Object.assign(cat, m.decodeDeep(read(cat.detail)));
  const cat = (id) => entity.categories?.find((c) => c.id === id);

  const sources = [];
  const add = (section, highlights, rowKind) => {
    if (highlights?.length) sources.push({ section, highlights, rowKind });
  };
  add('stops', cat('stops')?.stops_map?.highlights, () => 'stop');
  add('routes', cat('routes')?.routes_map?.highlights, (id) =>
    id === 'unused_shapes' ? 'shape' : 'route',
  );
  add('calendar', cat('calendar')?.calendar?.overview_highlights, (id) =>
    m.DATE_HIGHLIGHTS.has(id) ? 'date' : 'service',
  );
  add(
    'trips',
    await tripsHighlights(dir, cat('trips'), read('trips-diff.json'), m),
  );

  const items = m.rankGlobalHighlights(sources);
  const doc = m.highlightsDoc(basename(dir), items);
  doc.covered = m.coveredHighlights(sources, items);
  doc.report = m.reportTopHighlights(doc);
  writeFileSync(join(dir, m.HIGHLIGHTS_FILE), JSON.stringify(doc));

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
