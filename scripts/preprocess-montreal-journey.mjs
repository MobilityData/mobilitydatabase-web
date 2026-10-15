#!/usr/bin/env node
/**
 * scripts/preprocess-montreal-journey.mjs
 *
 * Builds the data behind the Montréal journey hero background
 * (AccessibilityBackgroundSurfaceV3): one trip from a BIXI dock in NDG to
 * Longueuil, by bike to Vendôme, then the Orange line to Berri-UQAM and the
 * Yellow line across the river.
 *
 *   - Metro lines and stations: STM GTFS (route_type 1), one representative
 *     shape per line (the most common one), simplified to ~8 m.
 *   - Bike docks: BIXI GBFS station_information, snapshotted at build time
 *     so the page never calls BIXI live.
 *   - Bike leg: real streets, routed between the two docks by the public
 *     OSRM bike profile (routing.openstreetmap.de, OpenStreetMap data).
 *   - Service alert: faked, pinned to a station on the journey.
 *
 * Run once (a few seconds):
 *   node scripts/preprocess-montreal-journey.mjs [path/to/stm-gtfs.zip]
 *
 * The zip defaults to public/mdb-2126-202511130041.zip (same source as
 * preprocess-montreal-accessibility.mjs) and is not committed.
 *
 * Output:
 *   public/hero-animation/montreal-journey.json
 */

import yauzl from 'yauzl';
import { createInterface } from 'readline';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ZIP_PATH = resolve(
  process.argv[2] ?? resolve(__dirname, '../public/mdb-2126-202511130041.zip'),
);
const OUT_DIR = resolve(__dirname, '../public/hero-animation');

const BIXI_STATIONS_URL =
  'https://gbfs.velobixi.com/gbfs/en/station_information.json';
const OSRM_BIKE_URL =
  'https://routing.openstreetmap.de/routed-bike/route/v1/driving';

const METRO_ROUTE_TYPE = '1';
/** GBFS station_id of the start dock (Benny / Sherbrooke, NDG). */
const ORIGIN_DOCK_ID = '1140';
/** GBFS station_id of the end dock (Métro Vendôme). */
const TRANSFER_DOCK_ID = '115';
/**
 * The journey's metro legs, by GTFS route_id and parent stop_id: Vendôme to
 * Berri-UQAM on the Orange line, then Berri-UQAM to Longueuil on the Yellow.
 */
const METRO_LEGS = [
  { line: '2', from: 'STATION_M242', to: 'STATION_M146' },
  { line: '4', from: 'STATION_M146', to: 'STATION_M454' },
];
/** The fake real-time alert sits on Lionel-Groulx, on the first leg. */
const ALERT_STATION = 'STATION_M132';
/** Share of the start dock's capacity shown as available bikes. */
const DOCK_FILL = 0.7;

/** Everything the scene can show; BIXI docks outside it are dropped. */
const BBOX = { west: -73.7, east: -73.45, south: 45.4, north: 45.6 };
/** Douglas-Peucker tolerance for every polyline, in metres. */
const SIMPLIFY_M = 8;
/** A station within this distance of a line's shape is served by it. */
const STATION_SNAP_M = 120;
const DECIMALS = 5;

// ---------------------------------------------------------------------------
// CSV / zip helpers (same as preprocess-montreal-accessibility.mjs)
// ---------------------------------------------------------------------------

function splitCsv(line) {
  if (!line.includes('"')) return line.split(',');
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(field);
      field = '';
    } else field += ch;
  }
  out.push(field);
  return out;
}

function openCsvEntry(entryName) {
  return new Promise((resolvePromise, reject) => {
    yauzl.open(ZIP_PATH, { lazyEntries: true }, (err, zipFile) => {
      if (err) return reject(err);
      zipFile.readEntry();
      zipFile.on('entry', (entry) => {
        if (entry.fileName !== entryName) {
          zipFile.readEntry();
          return;
        }
        zipFile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr);
          resolvePromise(
            createInterface({ input: stream, crlfDelay: Infinity }),
          );
        });
      });
      zipFile.on('end', () => reject(new Error(`${entryName} not in zip`)));
      zipFile.on('error', reject);
    });
  });
}

/** Calls onRow(fields, header) for every data row. */
async function eachRow(entryName, onRow) {
  const rl = await openCsvEntry(entryName);
  let header = null;
  for await (const line of rl) {
    if (!line) continue;
    if (!header) {
      header = {};
      splitCsv(line.replace(/^﻿/, '')).forEach((name, i) => {
        header[name.trim()] = i;
      });
      continue;
    }
    onRow(splitCsv(line), header);
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers, on [lon, lat] pairs
// ---------------------------------------------------------------------------

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((45.5 * Math.PI) / 180);

const toMetres = ([lon, lat]) => [lon * M_PER_DEG_LON, lat * M_PER_DEG_LAT];

function distanceM(a, b) {
  const [ax, ay] = toMetres(a);
  const [bx, by] = toMetres(b);
  return Math.hypot(ax - bx, ay - by);
}

/** Nearest point on the polyline: { index, t, distance } of segment i. */
function projectOnLine(line, point) {
  const [px, py] = toMetres(point);
  let best = { index: 0, t: 0, distance: Infinity };
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = toMetres(line[i]);
    const [bx, by] = toMetres(line[i + 1]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.min(
      Math.max(((px - ax) * dx + (py - ay) * dy) / len2, 0),
      1,
    );
    const d = Math.hypot(ax + t * dx - px, ay + t * dy - py);
    if (d < best.distance) best = { index: i, t, distance: d };
  }
  return best;
}

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** The part of `line` between the projections of `from` and `to`. */
function sliceLine(line, from, to) {
  let a = projectOnLine(line, from);
  let b = projectOnLine(line, to);
  const reversed = a.index + a.t > b.index + b.t;
  if (reversed) [a, b] = [b, a];
  const out = [lerp(line[a.index], line[a.index + 1], a.t)];
  for (let i = a.index + 1; i <= b.index; i++) out.push(line[i]);
  out.push(lerp(line[b.index], line[b.index + 1], b.t));
  return reversed ? out.reverse() : out;
}

function simplify(line, tolerance) {
  if (line.length < 3) return line;
  const pts = line.map(toMetres);
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = pts[first];
    const [bx, by] = pts[last];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let maxD = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = pts[i];
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (index !== -1 && maxD > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

const round = (value) => Number(value.toFixed(DECIMALS));
const roundPoint = ([lon, lat]) => [round(lon), round(lat)];
const roundLine = (line) => simplify(line, SIMPLIFY_M).map(roundPoint);

// ---------------------------------------------------------------------------
// STM metro
// ---------------------------------------------------------------------------

console.log(`Reading ${ZIP_PATH}…`);

const metroRoutes = new Map();
await eachRow('routes.txt', (f, h) => {
  if (f[h.route_type] !== METRO_ROUTE_TYPE) return;
  metroRoutes.set(f[h.route_id], {
    id: f[h.route_id],
    name: f[h.route_long_name],
    color: `#${f[h.route_color]}`,
  });
});

// Most common shape per line: the full end-to-end run, not short turns.
const shapeCounts = new Map();
await eachRow('trips.txt', (f, h) => {
  const routeId = f[h.route_id];
  if (!metroRoutes.has(routeId)) return;
  const counts = shapeCounts.get(routeId) ?? new Map();
  const shapeId = f[h.shape_id];
  counts.set(shapeId, (counts.get(shapeId) ?? 0) + 1);
  shapeCounts.set(routeId, counts);
});
const shapeToRoute = new Map();
for (const [routeId, counts] of shapeCounts) {
  const [shapeId] = [...counts].sort((a, b) => b[1] - a[1])[0];
  shapeToRoute.set(shapeId, routeId);
}

const shapePoints = new Map();
await eachRow('shapes.txt', (f, h) => {
  const routeId = shapeToRoute.get(f[h.shape_id]);
  if (!routeId) return;
  const points = shapePoints.get(routeId) ?? [];
  points.push({
    seq: Number(f[h.shape_pt_sequence]),
    point: [Number(f[h.shape_pt_lon]), Number(f[h.shape_pt_lat])],
  });
  shapePoints.set(routeId, points);
});
const shapes = new Map(
  [...shapePoints].map(([routeId, points]) => [
    routeId,
    points.sort((a, b) => a.seq - b.seq).map((p) => p.point),
  ]),
);

// Parent stations ("STATION VENDÔME"); boarding areas carry the nice name.
const stations = new Map();
await eachRow('stops.txt', (f, h) => {
  const id = f[h.stop_id];
  const parent = f[h.parent_station];
  const point = [Number(f[h.stop_lon]), Number(f[h.stop_lat])];
  if (f[h.location_type] === '1' && id.startsWith('STATION_M')) {
    stations.set(id, { ...(stations.get(id) ?? {}), id, point });
  } else if (f[h.location_type] === '0' && parent.startsWith('STATION_M')) {
    // Platform names carry suffixes ("... -Zone B"); keep the first seen.
    const name = f[h.stop_name].replace(/^Station /, '');
    const station = stations.get(parent) ?? {};
    stations.set(parent, { name, ...station });
  }
});

const metroStations = [...stations.values()]
  .filter((s) => s.point && s.name)
  .map((s) => ({
    id: s.id,
    name: s.name,
    point: s.point,
    lines: [...shapes]
      .filter(
        ([, line]) => projectOnLine(line, s.point).distance < STATION_SNAP_M,
      )
      .map(([routeId]) => routeId),
  }))
  .filter((s) => s.lines.length > 0);

const stationById = (id) => {
  const station = metroStations.find((s) => s.id === id);
  if (!station) throw new Error(`No metro station ${id}`);
  return station;
};

const legs = METRO_LEGS.map(({ line, from, to }) => {
  const shape = shapes.get(line);
  const a = stationById(from);
  const b = stationById(to);
  const path = sliceLine(shape, a.point, b.point);
  // Stations along the leg, in travel order.
  const along = metroStations
    .filter((s) => s.lines.includes(line))
    .map((s) => {
      const p = projectOnLine(path, s.point);
      return { s, at: p.index + p.t, distance: p.distance };
    })
    .filter((s) => s.distance < STATION_SNAP_M)
    .sort((x, y) => x.at - y.at)
    .map(({ s }) => s.id);
  return { line, from, to, path: roundLine(path), stations: along };
});

// ---------------------------------------------------------------------------
// BIXI (GBFS) and the bike leg
// ---------------------------------------------------------------------------

console.log('Fetching BIXI station_information…');
const gbfs = await (await fetch(BIXI_STATIONS_URL)).json();
const docks = gbfs.data.stations;
const dockById = (id) => {
  const dock = docks.find((d) => d.station_id === id);
  if (!dock) throw new Error(`No BIXI station ${id}`);
  return dock;
};
const originDock = dockById(ORIGIN_DOCK_ID);
const transferDock = dockById(TRANSFER_DOCK_ID);

console.log('Routing the bike leg…');
const coords = [originDock, transferDock].map((d) => `${d.lon},${d.lat}`);
const osrm = await (
  await fetch(
    `${OSRM_BIKE_URL}/${coords.join(';')}?overview=full&geometries=geojson`,
  )
).json();
if (osrm.code !== 'Ok') throw new Error(`OSRM: ${osrm.code}`);
const bikeRoute = osrm.routes[0];

const toDock = (d) => ({
  name: d.name,
  point: roundPoint([d.lon, d.lat]),
  capacity: d.capacity,
});

const inBbox = ([lon, lat]) =>
  lon > BBOX.west && lon < BBOX.east && lat > BBOX.south && lat < BBOX.north;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const out = {
  source: {
    gtfs: ZIP_PATH.split('/').pop(),
    gbfs: BIXI_STATIONS_URL,
    gbfsLastUpdated: new Date(gbfs.last_updated * 1000).toISOString(),
    bikeRouting: 'OSRM bike profile, OpenStreetMap contributors',
  },
  lines: [...metroRoutes.values()]
    .filter((r) => shapes.has(r.id))
    .map((r) => ({ ...r, path: roundLine(shapes.get(r.id)) })),
  stations: metroStations.map((s) => ({
    id: s.id,
    name: s.name,
    point: roundPoint(s.point),
    lines: s.lines,
  })),
  docks: docks
    .map((d) => [d.lon, d.lat])
    .filter(inBbox)
    .map(roundPoint),
  journey: {
    bike: {
      from: {
        ...toDock(originDock),
        bikesAvailable: Math.round(originDock.capacity * DOCK_FILL),
      },
      to: toDock(transferDock),
      distanceM: Math.round(bikeRoute.distance),
      path: roundLine(bikeRoute.geometry.coordinates),
    },
    metro: legs,
    alert: {
      line: METRO_LEGS[0].line,
      station: ALERT_STATION,
      point: roundPoint(stationById(ALERT_STATION).point),
    },
  },
};

mkdirSync(OUT_DIR, { recursive: true });
const outPath = resolve(OUT_DIR, 'montreal-journey.json');
writeFileSync(outPath, JSON.stringify(out));
console.log(
  `Wrote ${outPath}: ${out.lines.length} lines, ${out.stations.length} stations, ` +
    `${out.docks.length} docks, bike ${out.journey.bike.distanceM} m, ` +
    `legs ${legs.map((l) => `${l.line}:${l.stations.length}`).join(' ')}`,
);
