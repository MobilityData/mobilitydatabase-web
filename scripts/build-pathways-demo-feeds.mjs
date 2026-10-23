#!/usr/bin/env node
/**
 * Build a demo feed pair for the pathways + levels diff (v2 POC).
 *
 * No real feed pair we have on hand changes pathways.txt, so this takes a
 * handful of real MBTA stations from one feed and writes:
 *   - base.zip: the stations exactly as published
 *   - new.zip:  the same stations with synthetic, clearly-scripted edits
 *
 * Only stops.txt, levels.txt, pathways.txt and feed_info.txt are written.
 *
 * Usage:
 *   node scripts/build-pathways-demo-feeds.mjs <mbta-feed-dir> <out-dir>
 *   node scripts/generate-gtfs-pathways-diff.mjs <out-dir>/base.zip \
 *     <out-dir>/new.zip <out-dir>/pathways-diff.json --new-label "..." --note "..."
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';

const STATIONS = [
  'place-brdwy', // Broadway: elevators swapped, step-free access lost + gained
  'place-davis', // Davis: stairs closed, slower elevator
  'place-unsqu', // Union Square: signage only
  'place-shmnl', // Savin Hill: pathway_ids renumbered only
  'place-gilmn', // Gilman Square: unchanged
  'place-chncl', // Chinatown: unchanged
];

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
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
  const header = records.shift();
  return {
    header,
    rows: records.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))),
  };
}

function toCsv({ header, rows }) {
  const cell = (v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header.join(','), ...rows.map((r) => header.map((h) => cell(r[h] ?? '')).join(','))].join('\n') + '\n';
}

const clone = (t) => ({ header: [...t.header], rows: t.rows.map((r) => ({ ...r })) });

function extract(dir) {
  const read = (f) => parseCsv(readFileSync(join(dir, f), 'utf8'));
  const stops = read('stops.txt');
  const keep = new Set(STATIONS);
  // Two passes so boarding areas (children of platforms) are kept too.
  for (let pass = 0; pass < 2; pass++) {
    for (const s of stops.rows) if (keep.has(s.parent_station)) keep.add(s.stop_id);
  }
  stops.rows = stops.rows.filter((s) => keep.has(s.stop_id));
  const pathways = read('pathways.txt');
  pathways.rows = pathways.rows.filter((p) => keep.has(p.from_stop_id) && keep.has(p.to_stop_id));
  const levels = read('levels.txt');
  const used = new Set(stops.rows.map((s) => s.level_id));
  levels.rows = levels.rows.filter((l) => used.has(l.level_id));
  return { stops, levels, pathways, feed_info: read('feed_info.txt') };
}

function applyEdits(feed) {
  const f = {
    stops: clone(feed.stops),
    levels: clone(feed.levels),
    pathways: clone(feed.pathways),
    feed_info: clone(feed.feed_info),
  };
  const pw = (id) => f.pathways.rows.find((p) => p.pathway_id === id);
  const drop = (...ids) => {
    f.pathways.rows = f.pathways.rows.filter((p) => !ids.includes(p.pathway_id));
  };
  const blankPathway = (over) => Object.fromEntries(f.pathways.header.map((h) => [h, over[h] ?? '']));
  const blankStop = (over) => Object.fromEntries(f.stops.header.map((h) => [h, over[h] ?? '']));

  // ── Broadway ──
  // Street elevator 868 (Broadway entrance <-> lobby) removed.
  drop('brdwy-036', 'brdwy-037');
  // New elevator 901 at the Traveler St entrance.
  f.stops.rows.push(
    blankStop({ stop_id: 'node-901-street', stop_name: 'Broadway', level_id: 'level_in_street', location_type: '3', parent_station: 'place-brdwy', wheelchair_boarding: '1' }),
    blankStop({ stop_id: 'node-901-lobby', stop_name: 'Broadway', level_id: 'level_-1_lobby', location_type: '3', parent_station: 'place-brdwy', wheelchair_boarding: '1' }),
  );
  const elevator = { pathway_mode: '5', is_bidirectional: '0', traversal_time: '40', wheelchair_traversal_time: '40', facility_id: '901', pathway_code: '901' };
  const walk = (len) => ({ pathway_mode: '1', is_bidirectional: '0', length: len, wheelchair_length: len });
  f.pathways.rows.push(
    blankPathway({ pathway_id: 'brdwy-050', from_stop_id: 'door-brdwy-traveler', to_stop_id: 'node-901-street', ...walk('4.5720000'), signposted_as: 'Elevator' }),
    blankPathway({ pathway_id: 'brdwy-051', from_stop_id: 'node-901-street', to_stop_id: 'door-brdwy-traveler', ...walk('4.5720000'), signposted_as: 'Traveler St' }),
    blankPathway({ pathway_id: 'brdwy-052', from_stop_id: 'node-901-street', to_stop_id: 'node-901-lobby', ...elevator, signposted_as: 'Mezzanine' }),
    blankPathway({ pathway_id: 'brdwy-053', from_stop_id: 'node-901-lobby', to_stop_id: 'node-901-street', ...elevator, signposted_as: 'Street' }),
    blankPathway({ pathway_id: 'brdwy-054', from_stop_id: 'node-901-lobby', to_stop_id: 'node-brdwy-fareunpaid', ...walk('20.1168000'), signposted_as: 'Trains' }),
    blankPathway({ pathway_id: 'brdwy-055', from_stop_id: 'node-brdwy-fareunpaid', to_stop_id: 'node-901-lobby', ...walk('20.1168000'), signposted_as: 'Elevator to Traveler St' }),
  );
  const traveler = f.stops.rows.find((s) => s.stop_id === 'door-brdwy-traveler');
  traveler.wheelchair_boarding = '1';
  // Corridor to the Traveler St stairs rerouted: longer walk.
  for (const id of ['brdwy-023', 'brdwy-024']) {
    pw(id).length = '48.7680000';
    pw(id).wheelchair_length = '48.7680000';
  }
  // Signage at the Broadway entrance stairs.
  pw('brdwy-033').signposted_as = 'Broadway, Buses';
  // Same corridors, new ids.
  pw('brdwy-044').pathway_id = 'brdwy-060';
  pw('brdwy-045').pathway_id = 'brdwy-061';

  // ── Davis ──
  // Holland St stairs closed; elevator 816 replaced by a slower unit.
  drop('davis-096', 'davis-097');
  for (const id of ['davis-026', 'davis-027']) {
    pw(id).traversal_time = '65';
    pw(id).wheelchair_traversal_time = '65';
  }

  // ── Union Square ── signage only.
  pw('unsqu-030').signposted_as = 'Track 1 · Medford/Tufts';
  pw('unsqu-031').signposted_as = 'Track 2 · Medford/Tufts';

  // ── Savin Hill ── every pathway_id renumbered, nothing else.
  for (const p of f.pathways.rows) {
    if (p.pathway_id.startsWith('shmnl-')) p.pathway_id = p.pathway_id.replace('shmnl-', 'savin-hill-');
  }

  // ── Shared levels ── level_-1_lobby is used by several stations.
  f.levels.rows.find((l) => l.level_id === 'level_-1_lobby').level_name = 'Mezzanine';

  return f;
}

function writeZip(path, feed) {
  const files = Object.fromEntries(Object.entries(feed).map(([name, t]) => [`${name}.txt`, strToU8(toCsv(t))]));
  writeFileSync(path, zipSync(files, { level: 9 }));
}

function main() {
  const [dir, outDir] = process.argv.slice(2);
  if (!dir || !outDir) {
    console.error('Usage: node scripts/build-pathways-demo-feeds.mjs <mbta-feed-dir> <out-dir>');
    process.exit(1);
  }
  const base = extract(dir);
  mkdirSync(outDir, { recursive: true });
  writeZip(join(outDir, 'base.zip'), base);
  writeZip(join(outDir, 'new.zip'), applyEdits(base));
  console.log(`Wrote base.zip and new.zip to ${outDir} (${base.stops.rows.length} stops, ${base.pathways.rows.length} pathways)`);
}

main();
