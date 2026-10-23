#!/usr/bin/env node
/**
 * Generate the station pathways + levels diff (v2 POC) from two GTFS feeds.
 *
 * Feeds can be .zip files or unzipped directories. Only stops.txt,
 * levels.txt, pathways.txt and feed_info.txt are read, so large feeds
 * (stop_times.txt in the hundreds of MB) are fine.
 *
 * Usage:
 *   node scripts/generate-gtfs-pathways-diff.mjs <base> <new> <out.json>
 *     [--base-label "MBTA, 15 Jul 2026"] [--new-label "..."] [--note "..."]
 */

import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { diffPathways } from './lib/gtfs-pathways-diff.mjs';

const SCHEMA_VERSION = '2.0.0-poc-pathways';
const FILES = new Set(['stops.txt', 'levels.txt', 'pathways.txt', 'feed_info.txt']);

/** RFC 4180 CSV parser. Returns header + rows as objects keyed by column. */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    records.push(row);
  }
  const header = (records.shift() ?? []).map((h) => h.trim());
  const rows = records
    .filter((r) => !(r.length === 1 && r[0].trim() === ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { header, rows };
}

function loadFeed(path) {
  const files = new Map();
  if (statSync(path).isDirectory()) {
    for (const name of readdirSync(path)) {
      if (FILES.has(name.toLowerCase())) files.set(name.toLowerCase(), parseCsv(readFileSync(join(path, name), 'utf8')));
    }
  } else {
    const entries = unzipSync(readFileSync(path), {
      filter: (f) => !f.name.startsWith('__MACOSX') && FILES.has(basename(f.name).toLowerCase()),
    });
    for (const [p, bytes] of Object.entries(entries)) files.set(basename(p).toLowerCase(), parseCsv(strFromU8(bytes)));
  }
  return { source: basename(path), downloadedAt: statSync(path).mtime.toISOString(), files };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "MBTA, feed of 15 Jul 2026" from feed_info.txt, falling back to the file name. */
function feedLabel(feed) {
  const info = feed.files.get('feed_info.txt')?.rows[0];
  const d = info?.feed_start_date;
  if (info && /^\d{8}$/.test(d ?? '')) {
    return `${info.feed_publisher_name || feed.source}, feed of ${+d.slice(6, 8)} ${MONTHS[+d.slice(4, 6) - 1]} ${d.slice(0, 4)}`;
  }
  return feed.source;
}

function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];
    else positional.push(argv[i]);
  }
  return { positional, opts };
}

function main() {
  const { positional, opts } = parseArgs(process.argv.slice(2));
  const [basePath, newPath, outPath] = positional;
  if (!basePath || !newPath || !outPath) {
    console.error('Usage: node scripts/generate-gtfs-pathways-diff.mjs <base> <new> <out.json> [--base-label ..] [--new-label ..] [--note ..]');
    process.exit(1);
  }
  const baseFeed = loadFeed(basePath);
  const newFeed = loadFeed(newPath);
  const diff = diffPathways(baseFeed, newFeed);
  if (diff == null) {
    console.error('Neither feed has pathways.txt; nothing to diff.');
    process.exit(1);
  }
  const out = {
    metadata: {
      schema_version: SCHEMA_VERSION,
      generated_at: new Date().toISOString(),
      base_feed: { source: baseFeed.source, downloaded_at: baseFeed.downloadedAt, label: opts['base-label'] ?? feedLabel(baseFeed) },
      new_feed: { source: newFeed.source, downloaded_at: newFeed.downloadedAt, label: opts['new-label'] ?? feedLabel(newFeed) },
      note: opts.note ?? null,
    },
    ...diff,
  };
  writeFileSync(outPath, JSON.stringify(out));
  console.log(`Wrote ${outPath} (${Math.round(statSync(outPath).size / 1024)} KB)`);
  console.log(`  ${diff.stations.length} stations changed, ${diff.unchanged_station_ids.length} unchanged`);
  for (const s of diff.stations) {
    const n = (st) => s.links.filter((l) => l.status === st).length;
    console.log(`  ${s.name.padEnd(28)} links +${n('added')} -${n('deleted')} ~${n('modified')} restructured ${n('restructured')}`);
  }
}

main();
