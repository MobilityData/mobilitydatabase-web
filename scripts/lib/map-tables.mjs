/**
 * The stops and routes maps' entity lists as Parquet (<dataset>/maps/):
 * one row per changed stop / per route, with the columns the pages filter,
 * search, list and draw from, plus the entity's full JSON in `detail`
 * (read for one row at a time, when it is selected). The browser queries
 * them with DuckDB-WASM, so a page never holds 55k stops (IDFM) in memory.
 *
 * Highlights need every entity, so they are computed here, with the same
 * helpers the app uses, and stored in the map's JSON instead.
 *
 * Each table is split in two: the list (every column but `detail`, sorted by
 * `ord`, large row groups: the pages scan its filter columns whole, and a
 * small one is downloaded in one request) and <name>_detail.parquet (key +
 * detail, sorted by key, small row groups: a click reads one group).
 *
 * Tables, sorted by `ord` (the order the pages list them in):
 *   maps/stops.parquet   ord, stop_id, status, name, search, lon, lat,
 *                        base_lon, base_lat, new_lon, new_lat, moved_m,
 *                        coord_only, changed, detail (StopChange JSON)
 *   maps/routes.parquet  ord, route_id, status, kind, short_name, long_name,
 *                        color, text_color, search, f_<flag> (6 booleans),
 *                        summary, geom (overview polylines, JSON),
 *                        min_lon, min_lat, max_lon, max_lat, shapes_new,
 *                        shapes_all, detail (RouteImpact + its stops, deep-
 *                        encoded JSON)
 * `search` holds the normalised id and names separated by U+001F;
 * shapes_new / shapes_all are shape ids wrapped in U+001F, so a shape is
 * found with contains(shapes_all, chr(31) || id || chr(31)).
 */

import './ts-resolve.mjs';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';

export const MAPS_DIR = 'maps';
/** List tables: scanned whole by the pages, so few row groups (requests). */
export const LIST_ROW_GROUP_SIZE = 65536;
/** Detail tables: a selected entity's detail is read from one small group. */
export const DETAIL_ROW_GROUP_SIZE = 1024;
const SEP = '\u001f';

const LIB = new URL('../../src/app/screens/GtfsDiffToolV2/lib/', import.meta.url);

/** The app's helpers, so lists, searches and highlights match the UI. */
export async function appHelpers() {
  const [stopsUtils, routesUtils, stopsHl, routesHl, codec, calendarUtils, calendarHl] = await Promise.all([
    import(new URL('stops-utils.ts', LIB).href),
    import(new URL('routes-utils.ts', LIB).href),
    import(new URL('stops-highlights.ts', LIB).href),
    import(new URL('routes-highlights.ts', LIB).href),
    import(new URL('entity-diff-codec.ts', LIB).href),
    import(new URL('calendar-utils.ts', LIB).href),
    import(new URL('calendar-overview-highlights.ts', LIB).href),
  ]);
  return { ...stopsUtils, ...routesUtils, ...stopsHl, ...routesHl, ...codec, ...calendarUtils, ...calendarHl };
}

function sqlString(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Writes rows (arrays in column order) to <datasetDir>/<dir>/<name>.parquet,
 * ordered by `orderBy` (an `ord` column by default).
 */
export async function writeTable(
  datasetDir,
  name,
  columns,
  rows,
  { dir = MAPS_DIR, orderBy = 'ord', rowGroupSize = LIST_ROW_GROUP_SIZE } = {},
) {
  const outDir = join(datasetDir, dir);
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${name}.parquet`);
  const dbPath = join(tmpdir(), `gtfs-map-${name}-${process.pid}-${Date.now()}.duckdb`);
  const instance = await DuckDBInstance.create(dbPath);
  const con = await instance.connect();
  try {
    await con.run(`CREATE TABLE t (${columns.map(([c, t]) => `"${c}" ${t}`).join(', ')})`);
    const a = await con.createAppender('t');
    for (const row of rows) {
      row.forEach((v, i) => {
        if (v == null) a.appendNull();
        else if (columns[i][1] === 'INTEGER') a.appendInteger(v);
        else if (columns[i][1] === 'DOUBLE') a.appendDouble(v);
        else if (columns[i][1] === 'BOOLEAN') a.appendBoolean(v);
        else a.appendVarchar(String(v));
      });
      a.endRow();
    }
    a.closeSync();
    await con.run(
      `COPY (SELECT * FROM t ORDER BY ${orderBy}) TO ${sqlString(path)} (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE ${rowGroupSize})`,
    );
    const [{ n }] = (await con.runAndReadAll(`SELECT count(*)::INTEGER AS n FROM read_parquet(${sqlString(path)})`)).getRowObjectsJS();
    if (n !== rows.length) throw new Error(`${path}: ${n} rows for ${rows.length}`);
  } finally {
    con.closeSync();
    instance.closeSync();
    rmSync(dbPath, { force: true });
    rmSync(`${dbPath}.wal`, { force: true });
  }
  return { path: `${dir}/${name}.parquet`, rows: rows.length, bytes: statSync(path).size };
}

/**
 * Writes <name>.parquet (every column but `detail`) and <name>_detail.parquet
 * (`key` + `detail`, sorted by key) and returns the list table's info with
 * the detail table's as `detail`.
 */
export async function writeSplitTable(datasetDir, name, columns, rows, { dir = MAPS_DIR, key }) {
  const di = columns.findIndex(([c]) => c === 'detail');
  const ki = columns.findIndex(([c]) => c === key);
  if (di < 0 || ki < 0) throw new Error(`${name}: needs ${key} and detail columns`);
  const list = await writeTable(
    datasetDir,
    name,
    columns.filter((_, i) => i !== di),
    rows.map((r) => r.filter((_, i) => i !== di)),
    { dir },
  );
  const detail = await writeTable(datasetDir, `${name}_detail`, [columns[ki], columns[di]], rows.map((r) => [r[ki], r[di]]), {
    dir,
    orderBy: key,
    rowGroupSize: DETAIL_ROW_GROUP_SIZE,
  });
  return { ...list, detail };
}

const STOP_COLUMNS = [
  ['ord', 'INTEGER'],
  ['stop_id', 'VARCHAR'],
  ['status', 'VARCHAR'],
  ['name', 'VARCHAR'],
  ['search', 'VARCHAR'],
  ['lon', 'DOUBLE'],
  ['lat', 'DOUBLE'],
  ['base_lon', 'DOUBLE'],
  ['base_lat', 'DOUBLE'],
  ['new_lon', 'DOUBLE'],
  ['new_lat', 'DOUBLE'],
  ['moved_m', 'DOUBLE'],
  ['coord_only', 'BOOLEAN'],
  ['changed', 'VARCHAR'],
  ['detail', 'VARCHAR'],
];

const COORD_FIELDS = new Set(['stop_lat', 'stop_lon']);

/**
 * Writes maps/stops.parquet and returns the stops map without its stop list
 * (`table` points at the Parquet file; `highlights` are precomputed).
 */
export async function writeStopsTable(datasetDir, stopsMap) {
  const h = await appHelpers();
  const highlights = h.stopsHighlights(stopsMap, (id) => stopsMap.routes[id]?.short_name || id);
  const rows = stopsMap.stops.map((s, ord) => {
    const display = s.new_coord ?? s.base_coord;
    const fields = s.field_changes.map((c) => c.field);
    return [
      ord,
      s.stop_id,
      s.status,
      s.name,
      [s.stop_id, s.base?.stop_name ?? '', s.new?.stop_name ?? ''].map(h.normalizeText).join(SEP),
      display?.[0] ?? null,
      display?.[1] ?? null,
      s.base_coord?.[0] ?? null,
      s.base_coord?.[1] ?? null,
      s.new_coord?.[0] ?? null,
      s.new_coord?.[1] ?? null,
      s.moved_m,
      fields.length > 0 && fields.every((f) => COORD_FIELDS.has(f)),
      fields.join(','),
      JSON.stringify(s),
    ];
  });
  const table = await writeSplitTable(datasetDir, 'stops', STOP_COLUMNS, rows, { key: 'stop_id' });
  const { stops: _stops, ...rest } = stopsMap;
  return { ...rest, highlights, table };
}

const ROUTE_FLAGS = ['path', 'stops', 'trips', 'services', 'attributes', 'network'];

const ROUTE_COLUMNS = [
  ['ord', 'INTEGER'],
  ['route_id', 'VARCHAR'],
  ['status', 'VARCHAR'],
  ['kind', 'VARCHAR'],
  ['short_name', 'VARCHAR'],
  ['long_name', 'VARCHAR'],
  ['color', 'VARCHAR'],
  ['text_color', 'VARCHAR'],
  ['search', 'VARCHAR'],
  ...ROUTE_FLAGS.map((f) => [`f_${f}`, 'BOOLEAN']),
  ['summary', 'VARCHAR'],
  ['geom', 'VARCHAR'],
  ['min_lon', 'DOUBLE'],
  ['min_lat', 'DOUBLE'],
  ['max_lon', 'DOUBLE'],
  ['max_lat', 'DOUBLE'],
  ['shapes_new', 'VARCHAR'],
  ['shapes_all', 'VARCHAR'],
  ['detail', 'VARCHAR'],
];

/**
 * Writes maps/routes.parquet and returns the routes map without its route
 * list and stop lookup (each route's stops travel in its `detail`), plus
 * `route_info` (names and colours of every route, for chips) and the
 * precomputed `highlights`.
 */
export async function writeRoutesTable(datasetDir, routesMap) {
  const h = await appHelpers();
  const highlights = h.routesHighlights(routesMap);
  const threshold = routesMap.path_change_threshold_m;
  const pl = (line) => h.encodePolyline(line);
  const rows = h.sortRoutes(routesMap.routes).map((r, ord) => {
    const kind = h.routeKind(r);
    // What the overview draws: each direction's line, and where it diverges.
    const geom = { l: [], a: [], r: [] };
    for (const d of r.directions) {
      const g = kind === 'removed' ? d.geometry.base : (d.geometry.new ?? d.geometry.base);
      if (g && g.length > 1) geom.l.push(pl(g));
      for (const s of d.diverge.added) if (s.length > 1) geom.a.push(pl(s));
      for (const s of d.diverge.removed) if (s.length > 1) geom.r.push(pl(s));
    }
    const bounds = h.routeBounds([r]);
    const shapes = r.shapes ?? [];
    const wrap = (ids) => (ids.length > 0 ? `${SEP}${ids.join(SEP)}${SEP}` : '');
    const stopInfo = {};
    for (const { stop_id: id } of h.routeStops(r)) if (routesMap.stops[id]) stopInfo[id] = routesMap.stops[id];
    return [
      ord,
      r.route_id,
      r.status,
      kind,
      r.short_name,
      r.long_name,
      r.color,
      r.text_color,
      [r.route_id, r.short_name, r.long_name].map(h.normalizeText).join(SEP),
      ...ROUTE_FLAGS.map((f) => Boolean(r.flags[f])),
      h.routeSummary(r, threshold),
      JSON.stringify(geom),
      bounds?.[0][0] ?? null,
      bounds?.[0][1] ?? null,
      bounds?.[1][0] ?? null,
      bounds?.[1][1] ?? null,
      wrap(shapes.filter((sh) => sh.trips.new > 0).map((sh) => sh.shape_id)),
      wrap(shapes.flatMap((sh) => [sh.shape_id, ...(sh.renamed_from ? [sh.renamed_from] : [])])),
      JSON.stringify(h.encodeDeep({ ...r, stop_info: stopInfo })),
    ];
  });
  const table = await writeSplitTable(datasetDir, 'routes', ROUTE_COLUMNS, rows, { key: 'route_id' });
  const routeInfo = {};
  for (const r of routesMap.routes) {
    routeInfo[r.route_id] = {
      short_name: r.short_name,
      long_name: r.long_name,
      color: r.color,
      text_color: r.text_color,
      presence: r.status === 'deleted' ? 'base' : r.status === 'added' ? 'new' : 'both',
    };
  }
  const { routes: _routes, stops: _stops, ...rest } = routesMap;
  return { ...rest, highlights, route_info: routeInfo, table };
}
