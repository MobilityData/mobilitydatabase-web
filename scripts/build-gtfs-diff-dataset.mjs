#!/usr/bin/env node
/**
 * Build every diff file for one dataset folder, so it shows up at
 * /gtfs-diff-tool-v2/<folder> (routes are discovered from the folders).
 *
 * Put two GTFS zips in src/app/screens/GtfsDiffTool/data/v2/<folder>/ and run:
 *
 *   node scripts/build-gtfs-diff-dataset.mjs <folder | path> [options]
 *
 * It writes, next to the zips, the layout the backend will publish to object
 * storage (every path from src/app/screens/GtfsDiffToolV2/lib/diff-layout.ts;
 * see lib/datasets.ts):
 *   report.json           the diff's entry point (lib/report.ts). The entity
 *                         step (generate-gtfs-entity-diff.mjs) writes one
 *                         entry per GTFS file (presence, counts, raw table)
 *                         and the analyses (JSON file, counts); the report
 *                         step adds the feeds, the pathways analysis and the
 *                         top highlights
 *   raw/*.parquet         row diffs, one per GTFS file that changed
 *   analysis/             the analyses' JSON and typed tables, queried by
 *                         the pages: stops.*, routes.*, shapes.parquet
 *                         (scripts/lib/map-tables.mjs); services.*,
 *                         service_dates.parquet (scripts/lib/calendar-tables.mjs);
 *                         pathways.json (generate-gtfs-pathways-diff.mjs,
 *                         only when a feed has pathways.txt)
 *   highlights/           index.json (generate-gtfs-highlights.mjs: every
 *                         section's notable highlights in one ranking,
 *                         without their entity lists) and <section>.json
 *                         (stops, routes, services: the entity step; trips:
 *                         the highlights step)
 *   views/trips/          generate-gtfs-trips-diff.mjs: the Trips day index
 *                         (index.json) and each feed's trips by service
 *                         (<side>.parquet); generate-gtfs-trips-calendar.mjs:
 *                         trips added / removed / modified on every date
 *                         (calendar.json)
 *   views/routes-overview.pmtiles
 *                         hand-made, kept on rebuilds (KEEP_OUTPUTS)
 *   .build/               build-only files the next steps read (not published)
 *   manifest.json         every file above, written last; the app only lists
 *                         diffs that have one
 * Each step first removes what it wrote before, and what it wrote in older
 * layouts (report.json, shared by the entity and report steps, is updated in
 * place instead).
 *
 * The older feed is the base and the newer one the new feed, by
 * feed_info.feed_start_date (else the earliest calendar start_date, else the
 * Mobility Database timestamp in the file name). File names starting with
 * "base"/"new" (one is enough) are only used when dates can't tell;
 * --keep-names forces them (e.g. idfm: an agency feed vs its Google export).
 *
 * Options:
 *   --only entity,trips,calendar,pathways,highlights,report   build a subset
 *   --keep-names                   trust the base/new file name prefixes over dates
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { totalmem } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { markStartup, setTimingStep, timed, timer } from './lib/timings.mjs';
import './lib/ts-resolve.mjs';
import {
  ANALYSIS_FILES,
  HIGHLIGHTS_INDEX_FILE,
  MANIFEST_FILE,
  RAW_DIR,
  REPORT_FILE,
  ROUTES_OVERVIEW_TILES,
  ROUTES_TABLE,
  SERVICES_TABLE,
  SERVICE_DATES_TABLE,
  SHAPES_TABLE,
  STOPS_TABLE,
  TRIPS_CALENDAR_FILE,
  TRIPS_DAY_ROUTES_FILE,
  TRIPS_INDEX_FILE,
  TRIPS_SERVICE_FILE,
  highlightsFilePath,
  tripsTablePath,
} from '../src/app/screens/GtfsDiffToolV2/lib/diff-layout.ts';

// Have extensionless imports: loaded once ts-resolve is registered.
const { reportTopHighlights } = await import('../src/app/screens/GtfsDiffToolV2/lib/global-highlights.ts');
const { pathwaysCounts, reportHighlights, reportSummary } = await import(
  '../src/app/screens/GtfsDiffToolV2/lib/report.ts'
);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'src/app/screens/GtfsDiffTool/data/v2');
const ALL_STEPS = ['entity', 'trips', 'calendar', 'pathways', 'highlights', 'report'];

/**
 * What each step writes; cleared before the step runs, so nothing stale
 * survives. Each list ends with what the step wrote in older layouts, so a
 * rebuilt folder holds only the current one.
 */
const STEP_OUTPUTS = {
  // report.json is shared: the entity step rewrites its part (files,
  // analyses), the report step its own (feeds, pathways, highlights).
  entity: [
    RAW_DIR,
    ANALYSIS_FILES.stops,
    STOPS_TABLE,
    ANALYSIS_FILES.routes,
    ROUTES_TABLE,
    SHAPES_TABLE,
    ANALYSIS_FILES.services,
    SERVICES_TABLE,
    SERVICE_DATES_TABLE,
    // The sections' highlights files (the trips one is the highlights step's).
    highlightsFilePath('stops'),
    highlightsFilePath('routes'),
    highlightsFilePath('services'),
    // Older layouts: the analyses in maps/ and calendar/ (a hand-made
    // maps/routes-overview.pmtiles is moved to views/ first, see
    // LEGACY_KEEP_OUTPUTS), the file entries before report.json held them,
    // per-page categories and entity change lists, and highlights files.
    'maps',
    'calendar',
    'files.json',
    'entity-diff.json',
    'categories',
    'entities',
    'stops-highlights.json',
    'routes-highlights.json',
    'calendar-highlights.json',
    'highlights/calendar.json',
  ],
  trips: [
    TRIPS_INDEX_FILE,
    tripsTablePath('base'),
    tripsTablePath('new'),
    // Older layouts.
    'trips-diff.json',
    'trips',
    'trips-diff',
  ],
  calendar: [
    TRIPS_CALENDAR_FILE,
    TRIPS_DAY_ROUTES_FILE,
    TRIPS_SERVICE_FILE,
    // Older layouts.
    'trips-calendar.json',
    'trips-service.json',
  ],
  pathways: [
    ANALYSIS_FILES.pathways,
    // Older layouts.
    'pathways-diff.json',
  ],
  highlights: [
    HIGHLIGHTS_INDEX_FILE,
    highlightsFilePath('trips'),
    // Older layouts.
    'highlights.json',
    'trips-highlights.json',
  ],
  report: [],
};

/**
 * Hand-made files inside a step's outputs that clearing keeps: nothing in
 * scripts/ writes them (the routes overview tiles; analysis/routes.json
 * names them in `overview_tiles` when present).
 */
const KEEP_OUTPUTS = new Set([ROUTES_OVERVIEW_TILES]);

/** Hand-made files of older layouts -> where they live now (moved before any step). */
const LEGACY_KEEP_OUTPUTS = { 'maps/routes-overview.pmtiles': ROUTES_OVERVIEW_TILES };

/** Moves LEGACY_KEEP_OUTPUTS to their current path, so clearing the old folders keeps them. */
function moveLegacyKeeps(dir) {
  for (const [from, to] of Object.entries(LEGACY_KEEP_OUTPUTS)) {
    if (!existsSync(join(dir, from))) continue;
    if (existsSync(join(dir, to))) {
      console.log(`Both ${from} and ${to} exist: keeping ${to}, ${from} is cleared with its folder.`);
      continue;
    }
    mkdirSync(dirname(join(dir, to)), { recursive: true });
    renameSync(join(dir, from), join(dir, to));
    console.log(`Moved ${from} to ${to}`);
  }
}

/** Removes a step output (file or folder), except the KEEP_OUTPUTS in it. */
function clearOutput(dir, rel) {
  if (KEEP_OUTPUTS.has(rel)) return;
  const path = join(dir, rel);
  const keeps = [...KEEP_OUTPUTS].some((k) => k.startsWith(`${rel}/`));
  if (keeps && existsSync(path) && statSync(path).isDirectory()) {
    for (const e of readdirSync(path)) clearOutput(dir, `${rel}/${e}`);
    return;
  }
  rmSync(path, { recursive: true, force: true });
}

/** Every output file under `dir`, relative to it (inputs and dotfiles excluded). */
function listOutputs(dir, prefix = '') {
  const out = [];
  for (const e of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.name.startsWith('.') || e.name.toLowerCase().endsWith('.zip') || rel === MANIFEST_FILE) continue;
    if (e.isDirectory()) out.push(...listOutputs(dir, rel));
    else out.push(rel);
  }
  return out.sort();
}

/**
 * manifest.json: what a finished diff holds, written last (like the backend
 * job publishing a diff once every file is in place). The app lists and
 * serves diffs from manifests only; see src/app/screens/GtfsDiffToolV2/lib/datasets.ts.
 */
function writeManifest(dir, feeds) {
  const id = basename(dir);
  // Same rule as datasetLabel() in lib/datasets.ts.
  const mdb = [feeds.base.name, feeds.new.name].map((f) => /mdb-\d+/.exec(f)?.[0]).find(Boolean);
  const files = Object.fromEntries(listOutputs(dir).map((f) => [f, { bytes: statSync(join(dir, f)).size }]));
  const manifest = {
    schema: 1,
    id,
    label: mdb ? `${id} · ${mdb}` : id,
    generated_at: new Date().toISOString(),
    feeds: { base: feeds.base.feed, new: feeds.new.feed },
    files,
  };
  timed(`write ${MANIFEST_FILE}`, () => writeFileSync(join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2)), () => ({
    rows: Object.keys(files).length,
    bytes: statSync(join(dir, MANIFEST_FILE)).size,
  }));
  const mb = Object.values(files).reduce((s, f) => s + f.bytes, 0) / 1048576;
  console.log(`Wrote ${MANIFEST_FILE}: ${Object.keys(files).length} files, ${mb.toFixed(1)} MB`);
}

/** One CSV record (feed_info / calendar rows have no embedded newlines). */
function splitCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(field);
      field = '';
    } else field += c;
  }
  out.push(field);
  return out;
}

/** report.json's highlights from highlights/index.json (older builds stored the block in it). */
function highlightsTop(doc) {
  if (doc == null) return null;
  return doc.report ?? reportTopHighlights(doc);
}

/**
 * report.json's report-step part (lib/report.ts): the feeds, the pathways
 * analysis and the top highlights, added to the entity step's files and
 * analyses. A diff built before report.json held the files (files.json)
 * is converted.
 */
function writeReport(dir, feeds) {
  const read = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);
  const counts = (c) => ({ added: c.added, deleted: c.deleted, modified: c.modified, unchanged: c.unchanged });
  const endRead = timer(`report: read ${REPORT_FILE} + ${ANALYSIS_FILES.pathways} + ${HIGHLIGHTS_INDEX_FILE}`);
  let base = read(REPORT_FILE);
  if (base?.schema !== 4) {
    // Older build: the file entries and analysis paths are in files.json.
    const legacy = read('files.json');
    const analyses = {};
    for (const [name, path] of Object.entries(legacy?.analyses ?? {})) {
      const doc = read(path);
      analyses[name] = { file: path, ...(doc?.counts ? { counts: counts(doc.counts) } : {}) };
    }
    base = { metadata: legacy?.metadata ?? null, files: legacy?.files ?? [], analyses };
  }
  const servicesFile = base.analyses?.services?.file;
  const services = servicesFile ? read(servicesFile) : null;
  const pathways = read(ANALYSIS_FILES.pathways);
  endRead();
  const endBuild = timer('report: feeds, pathways and highlights');
  const { pathways: _stale, ...analyses } = base.analyses ?? {};
  const report = {
    ...base,
    schema: 4,
    dataset: basename(dir),
    generated_at: new Date().toISOString(),
    feeds: { base: feeds.base.feed, new: feeds.new.feed },
    analyses: {
      ...analyses,
      ...(pathways ? { pathways: { file: ANALYSIS_FILES.pathways, counts: pathwaysCounts(pathways) } } : {}),
    },
    // The global ranking's top few (scripts/generate-gtfs-highlights.mjs);
    // older diffs without it fall back to the services analysis's highlights.
    highlights: highlightsTop(read(HIGHLIGHTS_INDEX_FILE)) ?? reportHighlights(services),
  };
  endBuild();
  timed(`write ${REPORT_FILE}`, () => writeFileSync(join(dir, REPORT_FILE), JSON.stringify(report, null, 2)), () => ({
    bytes: statSync(join(dir, REPORT_FILE)).size,
  }));
  const shown = reportSummary(report)
    .sections.filter((s) => s.present)
    .map((s) => `${s.slug} ${s.count ?? '?'}`);
  console.log(`Wrote ${REPORT_FILE}: ${shown.join(', ')}`);
}

function parseArgs(argv) {
  const opts = { only: ALL_STEPS, keepNames: false, target: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') opts.only = argv[++i].split(',');
    else if (argv[i] === '--keep-names') opts.keepNames = true;
    else opts.target = argv[i];
  }
  return opts;
}

/** feed_info + calendar dates and the file list of a zip, without inflating stop_times. */
function inspectZip(path) {
  const names = [];
  const wanted = new Set(['feed_info.txt', 'calendar.txt', 'calendar_dates.txt']);
  const entries = unzipSync(readFileSync(path), {
    filter: (f) => {
      const name = basename(f.name).toLowerCase();
      if (!f.name.startsWith('__MACOSX')) names.push(name);
      return wanted.has(name) && !f.name.startsWith('__MACOSX');
    },
  });
  const csv = (name) => {
    const key = Object.keys(entries).find((k) => basename(k).toLowerCase() === name);
    if (!key) return [];
    const [header, ...lines] = strFromU8(entries[key]).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
    const cols = splitCsvLine(header).map((h) => h.trim());
    return lines.map((l) => Object.fromEntries(splitCsvLine(l).map((v, i) => [cols[i], v.trim()])));
  };
  const feedStart = csv('feed_info.txt')[0]?.feed_start_date;
  const calStarts = [
    ...csv('calendar.txt').map((r) => r.start_date),
    ...csv('calendar_dates.txt').map((r) => r.date),
  ].filter((d) => /^\d{8}$/.test(d ?? ''));
  const mdbStamp = /mdb-\d+-(\d{8})/.exec(basename(path))?.[1];
  const date = /^\d{8}$/.test(feedStart ?? '') ? feedStart : calStarts.sort()[0] ?? mdbStamp ?? null;
  const info = csv('feed_info.txt')[0] ?? {};
  const feed = { file: basename(path) };
  if (info.feed_publisher_name) feed.publisher = info.feed_publisher_name;
  if (info.feed_version) feed.version = info.feed_version;
  if (info.feed_start_date) feed.start = info.feed_start_date;
  if (info.feed_end_date) feed.end = info.feed_end_date;
  return { path, name: basename(path), date, feed, files: names, hasPathways: names.includes('pathways.txt') };
}

function orderFeeds(zips, keepNames) {
  // One prefixed zip is enough: the other one is the opposite side.
  const isBase = (z) => z.name.toLowerCase().startsWith('base');
  const isNew = (z) => z.name.toLowerCase().startsWith('new');
  const byName = {
    base: zips.find(isBase) ?? (zips.some(isNew) ? zips.find((z) => !isNew(z)) : undefined),
    new: zips.find(isNew) ?? (zips.some(isBase) ? zips.find((z) => !isBase(z)) : undefined),
  };
  const named = byName.base && byName.new && byName.base !== byName.new ? byName : null;
  if (keepNames) {
    if (!named) throw new Error('--keep-names needs one base*.zip and one new*.zip');
    return { ...named, note: 'order from file names (--keep-names)' };
  }
  const [a, b] = zips;
  if (a.date && b.date && a.date !== b.date) {
    const [older, newer] = a.date < b.date ? [a, b] : [b, a];
    const swapped = named != null && named.base !== older;
    return {
      base: older,
      new: newer,
      note: swapped
        ? `WARNING: ${newer.name} is named as the base feed but is the newer feed (${newer.date} > ${older.date}); using it as the new feed. Pass --keep-names to keep the names' order.`
        : `order from feed dates (${older.date} → ${newer.date})`,
    };
  }
  if (named) return { ...named, note: 'order from file names (feed dates equal or unknown)' };
  throw new Error('Cannot tell which feed is older: name them base*.zip and new*.zip');
}

function run(script, args) {
  // Large feeds (STM, MBTA) need several GB of heap.
  const heapMb = Math.floor((totalmem() / 1024 / 1024) * 0.85);
  const res = spawnSync(
    process.execPath,
    [`--max-old-space-size=${heapMb}`, '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', join(ROOT, 'scripts', script), ...args],
    { stdio: 'inherit' },
  );
  if (res.status !== 0) throw new Error(`${script} failed (exit ${res.status ?? res.signal})`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.target) {
    console.error('Usage: node scripts/build-gtfs-diff-dataset.mjs <folder | path> [--only entity,trips,calendar,pathways,highlights,report] [--keep-names]');
    process.exit(1);
  }
  const dir = existsSync(opts.target) && statSync(opts.target).isDirectory() ? resolve(opts.target) : join(DATA_DIR, opts.target);
  if (!existsSync(dir)) throw new Error(`No such dataset folder: ${dir}`);
  markStartup();
  const zips = timed('inspect zips (feed_info, calendar dates)', () =>
    readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.zip')).map((f) => inspectZip(join(dir, f))),
  );
  if (zips.length !== 2) throw new Error(`Expected exactly 2 zips in ${dir}, found ${zips.length}`);

  const feeds = orderFeeds(zips, opts.keepNames);
  console.log(`Dataset ${basename(dir)}\n  base: ${feeds.base.name} (${feeds.base.date ?? 'no date'})\n  new:  ${feeds.new.name} (${feeds.new.date ?? 'no date'})\n  ${feeds.note}`);

  const out = (f) => join(dir, f);
  const steps = opts.only.filter((s) => ALL_STEPS.includes(s));
  moveLegacyKeeps(dir);
  for (const step of steps) {
    const t0 = Date.now();
    setTimingStep(step);
    // The step's wall time, child process included (not the manifest).
    const endStep = timer('step total (wall, from build)');
    console.log(`\n── ${step} ──`);
    for (const f of STEP_OUTPUTS[step]) clearOutput(dir, f);
    if (step === 'entity') run('generate-gtfs-entity-diff.mjs', [feeds.base.path, feeds.new.path, out(REPORT_FILE)]);
    if (step === 'trips') run('generate-gtfs-trips-diff.mjs', [feeds.base.path, feeds.new.path, dir]);
    if (step === 'calendar') run('generate-gtfs-trips-calendar.mjs', [dir]);
    if (step === 'highlights') run('generate-gtfs-highlights.mjs', [dir]);
    if (step === 'report') {
      writeReport(dir, feeds);
      endStep();
      continue;
    }
    if (step === 'pathways') {
      if (!feeds.base.hasPathways && !feeds.new.hasPathways) {
        console.log('No pathways.txt in either feed; skipped.');
        endStep();
        continue;
      }
      run('generate-gtfs-pathways-diff.mjs', [feeds.base.path, feeds.new.path, dir]);
    }
    endStep();
    console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  console.log('');
  writeManifest(dir, feeds);
  console.log(`\nDone. Route: /gtfs-diff-tool-v2/${basename(dir)} (restart or rebuild Next if the folder is new)`);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
