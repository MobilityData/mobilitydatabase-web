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
 * storage (see src/app/screens/GtfsDiffToolV2/lib/datasets.ts):
 *   entity-diff.json      generate-gtfs-entity-diff.mjs: summaries and maps
 *   raw/*.parquet         full row diffs (trips, stop_times, shapes, …)
 *   categories/*.json     per-category maps, calendar and file diffs, loaded
 *                         with their tab
 *   maps/*.parquet        the stops and routes maps' lists (one row per
 *                         changed stop / route, queried by the pages)
 *   calendar/*.parquet    the service calendar's services and service-day
 *                         changes (queried by the calendar page)
 *   entities/*.parquet    long entity change lists
 *   trips-diff.json       generate-gtfs-trips-diff.mjs: the Trips day index
 *   trips/*.parquet       each feed's trips, sorted by service
 *   pathways-diff.json    generate-gtfs-pathways-diff.mjs, only when a feed
 *                         has pathways.txt
 *   trips-calendar.json   generate-gtfs-trips-calendar.mjs: trips added /
 *                         removed / modified on every date (Trips v3)
 *   highlights.json       generate-gtfs-highlights.mjs: every entity's notable
 *                         highlights in one ranking
 *   report.json           feeds, per-section change counts and the top
 *                         highlights for the summary page
 *   manifest.json         every file above, written last; the app only lists
 *                         diffs that have one
 * Each step first removes what it wrote before.
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
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { totalmem } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { REPORT_FILE, reportHighlights, reportSections } from '../src/app/screens/GtfsDiffToolV2/lib/report.ts';
import { decodeDeep } from '../src/app/screens/GtfsDiffToolV2/lib/entity-diff-codec.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'src/app/screens/GtfsDiffTool/data/v2');
const ALL_STEPS = ['entity', 'trips', 'calendar', 'pathways', 'highlights', 'report'];
const MANIFEST_FILE = 'manifest.json';

/** What each step writes; cleared before the step runs, so nothing stale survives. */
const STEP_OUTPUTS = {
  entity: ['entity-diff.json', 'categories', 'maps', 'calendar', 'raw', 'entities'],
  trips: ['trips-diff.json', 'trips', 'trips-diff'],
  calendar: ['trips-calendar.json'],
  pathways: ['pathways-diff.json'],
  highlights: ['highlights.json'],
  report: [REPORT_FILE],
};

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
  writeFileSync(join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2));
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

/**
 * Each section's files that at least one feed's zip holds: the zips are the
 * truth for presence (the entity diff can list a child file, e.g.
 * fare_rules.txt, that neither feed has).
 */
function withFeedFiles(sections, feeds) {
  const inFeeds = new Set([...(feeds.base.files ?? []), ...(feeds.new.files ?? [])]);
  return sections.map((s) => ({ ...s, present_files: s.files.filter((f) => inFeeds.has(f)) }));
}

/** Feeds and per-section change counts, for the report header (lib/report.ts). */
function writeReport(dir, feeds) {
  const read = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);
  const entity = read('entity-diff.json');
  // Categories' detail files (maps, calendar) merged back for the report.
  for (const cat of entity?.categories ?? []) if (cat.detail) Object.assign(cat, decodeDeep(read(cat.detail)));
  const pathways = read('pathways-diff.json');
  const report = {
    schema: 1,
    dataset: basename(dir),
    generated_at: new Date().toISOString(),
    feeds: { base: feeds.base.feed, new: feeds.new.feed },
    sections: withFeedFiles(reportSections(entity, pathways), feeds),
    // The global ranking's top few (scripts/generate-gtfs-highlights.mjs);
    // older diffs without it fall back to the calendar's highlights.
    highlights: read('highlights.json')?.report ?? reportHighlights(entity),
  };
  writeFileSync(join(dir, REPORT_FILE), JSON.stringify(report, null, 2));
  const shown = report.sections.filter((s) => s.present).map((s) => `${s.slug} ${s.count ?? '?'}`);
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
  const zips = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.zip')).map((f) => inspectZip(join(dir, f)));
  if (zips.length !== 2) throw new Error(`Expected exactly 2 zips in ${dir}, found ${zips.length}`);

  const feeds = orderFeeds(zips, opts.keepNames);
  console.log(`Dataset ${basename(dir)}\n  base: ${feeds.base.name} (${feeds.base.date ?? 'no date'})\n  new:  ${feeds.new.name} (${feeds.new.date ?? 'no date'})\n  ${feeds.note}`);

  const out = (f) => join(dir, f);
  const steps = opts.only.filter((s) => ALL_STEPS.includes(s));
  for (const step of steps) {
    const t0 = Date.now();
    console.log(`\n── ${step} ──`);
    for (const f of STEP_OUTPUTS[step]) rmSync(out(f), { recursive: true, force: true });
    if (step === 'entity') run('generate-gtfs-entity-diff.mjs', [feeds.base.path, feeds.new.path, out('entity-diff.json')]);
    if (step === 'trips') run('generate-gtfs-trips-diff.mjs', [feeds.base.path, feeds.new.path, out('trips-diff.json')]);
    if (step === 'calendar') run('generate-gtfs-trips-calendar.mjs', [dir]);
    if (step === 'highlights') run('generate-gtfs-highlights.mjs', [dir]);
    if (step === 'report') {
      writeReport(dir, feeds);
      continue;
    }
    if (step === 'pathways') {
      if (!feeds.base.hasPathways && !feeds.new.hasPathways) {
        console.log('No pathways.txt in either feed; skipped.');
        continue;
      }
      run('generate-gtfs-pathways-diff.mjs', [feeds.base.path, feeds.new.path, out('pathways-diff.json')]);
    }
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
