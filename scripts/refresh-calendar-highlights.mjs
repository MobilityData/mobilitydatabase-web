#!/usr/bin/env node
/**
 * Recompute the services section's notable highlights of built datasets,
 * without rebuilding them: puts every service's full record back together
 * from the services analysis tables and the calendar raw tables
 * (lib/calendar-rows), reads the day counts / coverage from
 * analysis/services.json, runs the same rules as the build
 * (src/app/screens/GtfsDiffToolV2/lib/calendar-overview-highlights.ts), and
 * writes highlights/services.json (analysis/services.json keeps its path).
 * Paths from lib/diff-layout.ts.
 *
 * Useful after tuning the rules, or for a dataset built before they existed
 * (rebuilding IDFM takes far longer and far more memory). Run
 * `build-gtfs-diff-dataset.mjs <dataset> --only report` afterwards so
 * manifest.json records the new file size.
 *
 * Usage:
 *   node scripts/refresh-calendar-highlights.mjs <dataset>...
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DuckDBInstance } from '@duckdb/node-api';
import './lib/ts-resolve.mjs';
import { writeHighlightsFile } from './lib/map-tables.mjs';
import { ANALYSIS_FILES } from '../src/app/screens/GtfsDiffToolV2/lib/diff-layout.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'src/app/screens/GtfsDiffTool/data/v2');
const LIB = new URL('../src/app/screens/GtfsDiffToolV2/lib/', import.meta.url);

const { calendarOverviewHighlights } = await import(
  new URL('calendar-overview-highlights.ts', LIB).href
);
const { serviceRowsQueries } = await import(new URL('calendar-query.ts', LIB).href);
const { serviceDiffFromRows } = await import(new URL('calendar-rows.ts', LIB).href);

function sqlString(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

/** rows grouped by service_id. */
function byService(rows) {
  const out = new Map();
  for (const r of rows) {
    const id = String(r.service_id);
    if (!out.has(id)) out.set(id, []);
    out.get(id).push(r);
  }
  return out;
}

/** Every service's full record (ServiceDiff), from the services analysis tables and raw tables. */
async function readServices(datasetDir, calendar) {
  const instance = await DuckDBInstance.create(':memory:');
  const con = await instance.connect();
  try {
    const register = async (name, rel) => {
      if (!rel) return null;
      await con.run(`CREATE VIEW ${name} AS SELECT * FROM read_parquet(${sqlString(join(datasetDir, rel))})`);
      return name;
    };
    const views = {
      services: await register('services', calendar.tables.services.path),
      days: await register('days', calendar.tables.days.path),
      calendar: await register('raw_calendar', calendar.calendar_rows_file),
      dates: await register('raw_dates', calendar.calendar_dates_rows_file),
    };
    const q = serviceRowsQueries(views, null);
    const read = async ({ sql }) => (await con.runAndReadAll(sql)).getRowObjectsJS();
    const [services, calendars, exceptions, days] = await Promise.all([
      read(q.service),
      read(q.calendar),
      read(q.exceptions),
      read(q.days),
    ]);
    const calendarOf = byService(calendars);
    const exceptionsOf = byService(exceptions);
    const daysOf = byService(days);
    return services.map((service) => {
      const id = String(service.service_id);
      return serviceDiffFromRows({
        service,
        calendar: calendarOf.get(id)?.[0] ?? null,
        exceptions: exceptionsOf.get(id) ?? [],
        days: daysOf.get(id) ?? [],
      });
    });
  } finally {
    con.closeSync();
    instance.closeSync();
  }
}

const datasets = process.argv.slice(2);
if (datasets.length === 0) {
  console.error('Usage: node scripts/refresh-calendar-highlights.mjs <dataset>...');
  process.exit(1);
}

for (const id of datasets) {
  const dir = join(DATA_DIR, id);
  const file = join(dir, ANALYSIS_FILES.services);
  const calendar = JSON.parse(readFileSync(file, 'utf8'));
  if (calendar.calendar_rows_file === undefined)
    throw new Error(`${id}: older services layout, rebuild it (--only entity,report)`);
  const services = await readServices(dir, calendar);
  const highlights = calendarOverviewHighlights({
    services,
    active_counts: calendar.active_counts,
    coverage: calendar.coverage,
  });
  const { file: highlightsFile } = await writeHighlightsFile(dir, 'services', highlights);
  calendar.highlights_file = highlightsFile;

  writeFileSync(file, JSON.stringify(calendar));

  console.log(`${id}: ${services.length} services`);
  for (const h of highlights) {
    console.log(`  [${h.severity} ${h.score.toFixed(2)}] ${h.title} (${h.entities?.length ?? 0})`);
  }
}
