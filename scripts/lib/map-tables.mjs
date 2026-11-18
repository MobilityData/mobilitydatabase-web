/**
 * The stops and routes analyses' tables as Parquet (<dataset>/analysis/,
 * paths from src/app/screens/GtfsDiffToolV2/lib/diff-layout.ts), with
 * typed columns only (no JSON in a column). The browser queries them with
 * DuckDB-WASM, so a page never holds 55k stops (IDFM) as JS objects. The
 * column lists are the contract with the pages:
 * src/app/screens/GtfsDiffToolV2/lib/route-tables.ts (ROUTES_COLUMNS,
 * SHAPES_COLUMNS, STOPS_COLUMNS), imported here.
 *
 * Highlights need every entity, so they are computed here, with the same
 * helpers the app uses, and written to highlights/<section>.json
 * (writeHighlightsFile), the only copy: the analysis JSON keeps its path,
 * and the page loads it for its highlight cards.
 *
 * Tables:
 *   analysis/stops.parquet   stop_id, moved_m (base to new position, metres),
 *                            served_base, served_new ((route_id, direction_id)
 *                            pairs of every trip calling there, per feed);
 *                            every stop changed in stops.txt or whose pairs
 *                            differ; sorted by stop_id. Names and positions
 *                            are in raw/stops.parquet (lib/stop-info).
 *   analysis/routes.parquet  one row per route, sorted by `ord` (the order
 *                            the pages list them in), large row groups: what
 *                            the pages filter, search and list, and each
 *                            direction's headsigns, main shape per feed and
 *                            diverging sections (`directions`). Its
 *                            routes.txt rows and field changes are in
 *                            raw/routes.parquet.
 *   analysis/shapes.parquet  one row per shape of either feed (a renamed
 *                            pair: one, under the new id), unused ones too, a
 *                            shape several routes use stored once; main
 *                            shapes first (`main`), then by shape_id, small
 *                            row groups (SHAPES_ROW_GROUP_SIZE) so the
 *                            overview reads the main shapes only. Lines are
 *                            Google encoded polylines (precision 5, latitude
 *                            first; lib/entity-diff-codec.ts).
 * `search` holds the normalised id and names separated by U+001F. A table
 * column whose type is a list or a STRUCT is written from JSON text, cast
 * on COPY.
 */

import './ts-resolve.mjs';
import { deepStrictEqual } from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { parquetOptions } from './raw-diff-parquet.mjs';
import { timed, timer } from './timings.mjs';
import {
  ROUTES_OVERVIEW_TILES,
  ROUTES_TABLE,
  SHAPES_TABLE,
  STOPS_TABLE,
  highlightsFilePath,
} from '../../src/app/screens/GtfsDiffToolV2/lib/diff-layout.ts';

const LIB = new URL('../../src/app/screens/GtfsDiffToolV2/lib/', import.meta.url);

// Have extensionless imports: loaded once ts-resolve is registered.
const { routeInfoFromRows, routeInfoSql } = await import(new URL('route-info.ts', LIB).href);
const { stopNamesFromRows, stopNamesSql } = await import(new URL('stop-info.ts', LIB).href);
const { ROUTES_COLUMNS, SHAPES_COLUMNS, SHAPES_ROW_GROUP_SIZE, STOPS_COLUMNS } = await import(
  new URL('route-tables.ts', LIB).href
);

/** List tables: scanned whole by the pages, so few row groups (requests). */
export const LIST_ROW_GROUP_SIZE = 65536;
const SEP = '\u001f';

/** The app's helpers, so lists, searches and highlights match the UI. */
export async function appHelpers() {
  const [stopsUtils, routesUtils, stopsHl, routesHl, codec, calendarUtils, calendarHl, highlights] = await Promise.all([
    import(new URL('stops-utils.ts', LIB).href),
    import(new URL('routes-utils.ts', LIB).href),
    import(new URL('stops-highlights.ts', LIB).href),
    import(new URL('routes-highlights.ts', LIB).href),
    import(new URL('entity-diff-codec.ts', LIB).href),
    import(new URL('calendar-utils.ts', LIB).href),
    import(new URL('calendar-overview-highlights.ts', LIB).href),
    import(new URL('highlights.ts', LIB).href),
  ]);
  return {
    ...stopsUtils,
    ...routesUtils,
    ...stopsHl,
    ...routesHl,
    ...codec,
    ...calendarUtils,
    ...calendarHl,
    ...highlights,
  };
}

/**
 * Writes a section's highlights with their full entity lists to
 * highlights/<section>.json (plain JSON, HighlightsFile) and returns its path.
 */
export async function writeHighlightsFile(datasetDir, section, highlights) {
  const file = highlightsFilePath(section);
  mkdirSync(dirname(join(datasetDir, file)), { recursive: true });
  timed(
    `write ${file}`,
    () => writeFileSync(join(datasetDir, file), JSON.stringify({ schema: 1, section, highlights })),
    () => ({ bytes: statSync(join(datasetDir, file)).size }),
  );
  return { file };
}

function sqlString(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

/** A list or STRUCT column: appended as JSON text, cast on COPY. */
function isNested(type) {
  return type.endsWith('[]') || /^(STRUCT|MAP)\b/.test(type);
}

/** A row (array in column order) as DuckDB reads it back (getRowObjectsJS). */
function expectedRow(columns, row) {
  return Object.fromEntries(
    columns.map(([c, t], i) => {
      const v = row[i];
      if (v == null) return [c, null];
      if (isNested(t)) return [c, JSON.parse(JSON.stringify(v))];
      if (t === 'VARCHAR') return [c, String(v)];
      return [c, v];
    }),
  );
}

/** Rows given as objects, as arrays in `columns` order (every column required). */
export function rowsOf(columns, objects) {
  return objects.map((o) =>
    columns.map(([c]) => {
      if (!(c in o)) throw new Error(`row without column ${c}`);
      return o[c];
    }),
  );
}

/**
 * Writes rows (arrays in column order) to <datasetDir>/<file> (a
 * lib/diff-layout.ts table path), ordered by `orderBy` (an `ord` column by
 * default). Reads the table back
 * to check its row count, and, with `key` (a unique column), that a few
 * rows read back exactly as given.
 */
export async function writeTable(
  datasetDir,
  file,
  columns,
  rows,
  { orderBy = 'ord', rowGroupSize = LIST_ROW_GROUP_SIZE, key = null } = {},
) {
  const name = basename(file, '.parquet');
  const path = join(datasetDir, file);
  mkdirSync(dirname(path), { recursive: true });
  const end = timer(`write ${file}`);
  const dbPath = join(tmpdir(), `gtfs-map-${name}-${process.pid}-${Date.now()}.duckdb`);
  const instance = await DuckDBInstance.create(dbPath);
  const con = await instance.connect();
  try {
    const nested = columns.filter(([, t]) => isNested(t));
    await con.run(`CREATE TABLE t (${columns.map(([c, t]) => `"${c}" ${isNested(t) ? 'VARCHAR' : t}`).join(', ')})`);
    const a = await con.createAppender('t');
    for (const row of rows) {
      if (row.length !== columns.length) throw new Error(`${name}: row of ${row.length} values for ${columns.length} columns`);
      row.forEach((v, i) => {
        const type = columns[i][1];
        if (v == null) a.appendNull();
        else if (isNested(type)) a.appendVarchar(JSON.stringify(v));
        else if (type === 'INTEGER') a.appendInteger(v);
        else if (type === 'DOUBLE') a.appendDouble(v);
        else if (type === 'BOOLEAN') a.appendBoolean(v);
        else a.appendVarchar(String(v));
      });
      a.endRow();
    }
    a.closeSync();
    const select =
      nested.length > 0 ? `* REPLACE (${nested.map(([c, t]) => `CAST("${c}"::JSON AS ${t}) AS "${c}"`).join(', ')})` : '*';
    await con.run(
      `COPY (SELECT ${select} FROM t ORDER BY ${orderBy}) TO ${sqlString(path)} (${parquetOptions(rowGroupSize)})`,
    );
    const table = `read_parquet(${sqlString(path)})`;
    const [{ n }] = (await con.runAndReadAll(`SELECT count(*)::INTEGER AS n FROM ${table}`)).getRowObjectsJS();
    if (n !== rows.length) throw new Error(`${path}: ${n} rows for ${rows.length}`);
    if (key && rows.length > 0) {
      const ki = columns.findIndex(([c]) => c === key);
      if (ki < 0) throw new Error(`${name}: no key column ${key}`);
      const sample = [...new Set([0, rows.length >> 1, rows.length - 1])].map((i) => rows[i]);
      for (const row of sample) {
        const back = (
          await con.runAndReadAll(`SELECT * FROM ${table} WHERE "${key}" = ${sqlString(String(row[ki]))}`)
        ).getRowObjectsJS();
        deepStrictEqual(back, [expectedRow(columns, row)], `${path}: row ${row[ki]} reads back differently`);
      }
    }
  } finally {
    con.closeSync();
    instance.closeSync();
    rmSync(dbPath, { force: true });
    rmSync(`${dbPath}.wal`, { force: true });
  }
  end(() => ({ rows: rows.length, bytes: statSync(path).size }));
  return { path: file, rows: rows.length, bytes: statSync(path).size };
}

/**
 * stop_id -> name from the file a document's `stop_info_file` names (the
 * stops.txt raw table). Empty when unset or missing.
 */
export async function readStopNames(datasetDir, file) {
  const path = file ? join(datasetDir, file) : null;
  if (!path || !existsSync(path)) return {};
  const instance = await DuckDBInstance.create(':memory:');
  const con = await instance.connect();
  try {
    await con.run(`CREATE VIEW stops_raw AS SELECT * FROM read_parquet(${sqlString(path)})`);
    const reader = await con.runAndReadAll(stopNamesSql('stops_raw'));
    return stopNamesFromRows(reader.getRowObjectsJS());
  } finally {
    con.closeSync?.();
  }
}

/**
 * route_id -> RouteInfo from the file a document's `route_info_file` names:
 * the routes.txt raw table, the routes analysis table or the
 * route_info.json of older builds. Empty when unset or missing.
 */
export async function readRouteInfo(datasetDir, file) {
  const path = file ? join(datasetDir, file) : null;
  if (!path || !existsSync(path)) return {};
  if (path.endsWith('.json')) return JSON.parse(readFileSync(path, 'utf8'));
  const instance = await DuckDBInstance.create(':memory:');
  const con = await instance.connect();
  try {
    const reader = await con.runAndReadAll(routeInfoSql(`read_parquet(${sqlString(path)})`));
    return routeInfoFromRows(reader.getRowObjectsJS());
  } finally {
    con.closeSync?.();
  }
}

/**
 * Writes analysis/stops.parquet (the stops analysis table) and returns the stops
 * map without its stop lists (`table` points at the file; `highlights_file`
 * at its highlights).
 */
export async function writeStopsTable(datasetDir, stopsMap) {
  const h = await appHelpers();
  const highlights = timed('stops: highlights (stopsHighlights)', () =>
    h.stopsHighlights(stopsMap, (id) => stopsMap.routes[id]?.short_name || id),
  );
  const endRows = timer('stops: analysis rows');
  // Changed stops, and stops only their served (route, direction) pairs changed.
  const rows = rowsOf(
    STOPS_COLUMNS,
    [...stopsMap.stops, ...(stopsMap.served_changes ?? [])].map((s) => ({
      stop_id: s.stop_id,
      moved_m: s.moved_m,
      served_base: s.served.base,
      served_new: s.served.new,
    })),
  );
  endRows({ rows: rows.length });
  // A stop's rows are in raw/stops.parquet, so no detail table.
  const table = await writeTable(datasetDir, STOPS_TABLE, STOPS_COLUMNS, rows, { orderBy: 'stop_id', key: 'stop_id' });
  const { stops: _stops, served_changes: _served, ...rest } = stopsMap;
  const { file } = await writeHighlightsFile(datasetDir, 'stops', highlights);
  return { ...rest, highlights_file: file, table };
}

const ROUTE_FLAGS = ROUTES_COLUMNS.filter(([c]) => c.startsWith('f_')).map(([c]) => c.slice(2));

/**
 * Writes analysis/routes.parquet and analysis/shapes.parquet and returns the routes
 * map without its route list, stop lookup and shape rows, plus the path of
 * its highlights file (`highlights_file`) and of the overview tiles
 * (`overview_tiles`) when the dataset has them.
 */
export async function writeRoutesTable(datasetDir, routesMap) {
  const h = await appHelpers();
  const highlights = timed('routes: highlights (routesHighlights)', () => h.routesHighlights(routesMap));
  const pl = (line) => (line && line.length > 1 ? h.encodePolyline(line) : null);
  const sections = (list) => list.filter((sec) => sec.length > 1).map(pl);

  const endRows = timer('routes: list rows');
  const threshold = routesMap.path_change_threshold_m;
  const routes = h.sortRoutes(routesMap.routes).map((r, ord) => {
    const bounds = h.routeBounds([r]);
    return {
      ord,
      route_id: r.route_id,
      status: r.status,
      kind: h.routeKind(r),
      agency_id: r.agency_id ?? '',
      short_name: r.short_name,
      long_name: r.long_name,
      route_type: r.route_type ?? '',
      color: r.color,
      text_color: r.text_color,
      sort_order: r.sort_order ?? null,
      search: [r.route_id, r.short_name, r.long_name].map(h.normalizeText).join(SEP),
      ...Object.fromEntries(ROUTE_FLAGS.map((f) => [`f_${f}`, Boolean(r.flags[f])])),
      summary: h.routeSummary(r, threshold),
      network_base: r.networks.base,
      network_new: r.networks.new,
      stops_base: r.stops.base_count,
      stops_new: r.stops.new_count,
      min_lon: bounds?.[0][0] ?? null,
      min_lat: bounds?.[0][1] ?? null,
      max_lon: bounds?.[1][0] ?? null,
      max_lat: bounds?.[1][1] ?? null,
      directions: r.directions.map((d) => ({
        direction_id: d.direction_id,
        headsign_base: d.headsign.base,
        headsign_new: d.headsign.new,
        shape_base: d.shape_id.base,
        shape_new: d.shape_id.new,
        path_change_m: d.path_change_m,
        diverge_added: sections(d.diverge.added),
        diverge_removed: sections(d.diverge.removed),
      })),
    };
  });
  endRows({ rows: routes.length });

  const endShapes = timer('routes: shape rows (polylines)');
  const shapes = (routesMap.shape_rows ?? []).map((sh) => ({
    shape_id: sh.shape_id,
    main: sh.main.base.length > 0 || sh.main.new.length > 0,
    status: sh.status,
    renamed_from: sh.renamed_from,
    deviation_m: sh.deviation_m,
    points_base: sh.points.base,
    points_new: sh.points.new,
    unused_base: sh.unused.base,
    unused_new: sh.unused.new,
    geom_base: pl(sh.geometry.base),
    geom_new: pl(sh.geometry.new),
    diverge_added: sections(sh.diverge.added),
    diverge_removed: sections(sh.diverge.removed),
    uses_base: sh.uses.base,
    uses_new: sh.uses.new,
    main_base: sh.main.base,
    main_new: sh.main.new,
  }));
  endShapes({ rows: shapes.length });

  const table = await writeTable(datasetDir, ROUTES_TABLE, ROUTES_COLUMNS, rowsOf(ROUTES_COLUMNS, routes), { key: 'route_id' });
  const shapesTable = await writeTable(datasetDir, SHAPES_TABLE, SHAPES_COLUMNS, rowsOf(SHAPES_COLUMNS, shapes), {
    orderBy: 'main DESC, shape_id',
    rowGroupSize: SHAPES_ROW_GROUP_SIZE,
    key: 'shape_id',
  });
  const {
    routes: _routes,
    stops: _stops,
    shape_rows: _shapes,
    unused_shapes: _unused,
    overview_tiles: _tiles,
    ...rest
  } = routesMap;
  const { file } = await writeHighlightsFile(datasetDir, 'routes', highlights);
  return {
    ...rest,
    highlights_file: file,
    table,
    shapes_table: shapesTable,
    ...(existsSync(join(datasetDir, ROUTES_OVERVIEW_TILES)) ? { overview_tiles: ROUTES_OVERVIEW_TILES } : {}),
  };
}
