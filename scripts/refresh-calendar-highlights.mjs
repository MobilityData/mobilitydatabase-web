#!/usr/bin/env node
/**
 * Recompute the service calendar's notable highlights of built datasets,
 * without rebuilding them: reads the full service records from
 * calendar/services_detail.parquet and the day counts / coverage from
 * categories/calendar.json, runs the same rules as the build
 * (src/app/screens/GtfsDiffToolV2/lib/calendar-overview-highlights.ts), and
 * writes calendar.overview_highlights back into categories/calendar.json.
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
import { deepStrictEqual } from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DuckDBInstance } from '@duckdb/node-api';
import './lib/ts-resolve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'src/app/screens/GtfsDiffTool/data/v2');
const LIB = new URL('../src/app/screens/GtfsDiffToolV2/lib/', import.meta.url);

const { encodeDeep, decodeDeep } = await import(new URL('entity-diff-codec.ts', LIB).href);
const { calendarOverviewHighlights } = await import(
  new URL('calendar-overview-highlights.ts', LIB).href
);

function sqlString(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Every service's full record (ServiceDiff), from the detail table. */
async function readServices(datasetDir) {
  const instance = await DuckDBInstance.create(':memory:');
  const con = await instance.connect();
  try {
    const path = join(datasetDir, 'calendar', 'services_detail.parquet');
    const res = await con.runAndReadAll(`SELECT detail FROM read_parquet(${sqlString(path)})`);
    return res.getRowObjectsJS().map((r) => JSON.parse(String(r.detail)));
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
  const file = join(dir, 'categories', 'calendar.json');
  const detail = decodeDeep(JSON.parse(readFileSync(file, 'utf8')));
  const services = await readServices(dir);
  const highlights = calendarOverviewHighlights({
    services,
    active_counts: detail.calendar.active_counts,
    coverage: detail.calendar.coverage,
  });
  detail.calendar.overview_highlights = highlights;

  // Same encoding and check as the build (generate-gtfs-entity-diff.mjs).
  const text = JSON.stringify(encodeDeep(detail));
  deepStrictEqual(decodeDeep(JSON.parse(text)), JSON.parse(JSON.stringify(detail)));
  writeFileSync(file, text);

  console.log(`${id}: ${services.length} services`);
  for (const h of highlights) {
    console.log(`  [${h.severity} ${h.score.toFixed(2)}] ${h.title} (${h.entities?.length ?? 0})`);
  }
}
