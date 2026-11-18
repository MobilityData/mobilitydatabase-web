/**
 * Writes the Trips view's files into a dataset folder (paths from
 * src/app/screens/GtfsDiffToolV2/lib/diff-layout.ts):
 *
 *   views/trips/index.json     day index: dates, service sets, day types,
 *                              route and stop names; no trips (small, read
 *                              on page load)
 *   views/trips/base.parquet   one row per base trip
 *   views/trips/new.parquet    one row per new trip
 *
 * Parquet rows are (ord, service, route, trip) where `trip` is the
 * CompactTrip as JSON and `ord` its position in the feed's trip list. Trips
 * are appended a route at a time (no feed's trips are ever all in memory)
 * and written sorted by service with small row groups, so the browser reads
 * only the services running on the selected day (DuckDB-WASM over HTTP
 * range requests; see src/app/screens/GtfsDiffToolV2/lib/useTripsDay.ts).
 *
 * Feeds too large to load a whole day (IDFM: 100k+ trips a day) are sorted
 * by route, then service, instead (`trip_tables.by_route`): the browser
 * then reads one route's trips for the day.
 *
 * Every table is read back after writing: counts, and a sample of rows
 * identical to what was appended, so a lossy write fails loudly.
 */

import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { deepStrictEqual } from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { parquetOptions } from './raw-diff-parquet.mjs';
import { timer } from './timings.mjs';
import { compactServiceSets, expandServiceSets } from '../../src/app/screens/GtfsDiffToolV2/lib/trips-index-codec.ts';
import { TRIPS_INDEX_FILE, rawTablePath, tripsTablePath } from '../../src/app/screens/GtfsDiffToolV2/lib/diff-layout.ts';

/** Route names and colours (lib/route-info), and stop names (lib/stop-info). */
const ROUTE_INFO_TABLE = rawTablePath('routes.txt');
const STOP_INFO_TABLE = rawTablePath('stops.txt');
/** Trips per row group: a service's trips span few groups. */
const ROW_GROUP_SIZE = 2048;
/** Every n-th appended trip is kept to compare after writing. */
const VERIFY_EVERY = 997;

function sqlString(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * @param datasetDir the dataset folder
 * @returns { append(side, trips), finish(index, { byRoute }) }
 */
export async function openTripsWriter(datasetDir) {
  const outPath = join(datasetDir, TRIPS_INDEX_FILE);
  mkdirSync(dirname(outPath), { recursive: true });
  for (const side of ['base', 'new']) mkdirSync(dirname(join(datasetDir, tripsTablePath(side))), { recursive: true });
  const dbPath = join(tmpdir(), `gtfs-trips-${process.pid}-${Date.now()}.duckdb`);
  const instance = await DuckDBInstance.create(dbPath);
  const sides = {};
  for (const side of ['base', 'new']) {
    // One connection per side, so both can be appended to route by route.
    const con = await instance.connect();
    await con.run(`CREATE TABLE ${side} (ord INTEGER, service VARCHAR, route VARCHAR, trip VARCHAR)`);
    sides[side] = { con, appender: await con.createAppender(side), count: 0, sample: new Map() };
  }

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    for (const s of Object.values(sides)) s.con.closeSync();
    instance.closeSync();
    rmSync(dbPath, { force: true });
    rmSync(`${dbPath}.wal`, { force: true });
  };

  return {
    /** Appends CompactTrips of one feed (in feed order across calls). */
    append(side, trips) {
      const s = sides[side];
      for (const trip of trips) {
        const ord = s.count++;
        s.appender.appendInteger(ord);
        s.appender.appendVarchar(trip.service);
        s.appender.appendVarchar(trip.route);
        s.appender.appendVarchar(JSON.stringify(trip));
        s.appender.endRow();
        if (ord % VERIFY_EVERY === 0) s.sample.set(ord, trip);
      }
    },

    /**
     * @param index   the TripsDiffDoc without trips (feeds.*.trips empty)
     * @param o.byRoute sort by route then service (huge feeds)
     */
    async finish(index, { byRoute = false } = {}) {
      const tables = { base: tripsTablePath('base'), new: tripsTablePath('new') };
      const result = {};
      try {
        for (const [side, s] of Object.entries(sides)) {
          const endWrite = timer(`write ${tables[side]} (sort + COPY + read-back check)`);
          s.appender.closeSync();
          const path = join(datasetDir, tables[side]);
          await s.con.run(
            `COPY (SELECT * FROM ${side} ORDER BY ${byRoute ? 'route, ' : ''}service, ord) TO ${sqlString(path)} ` +
              `(${parquetOptions(ROW_GROUP_SIZE)})`,
          );
          // Read back: every row once, and the sample identical to what was appended.
          const read = async (sql) => (await s.con.runAndReadAll(sql)).getRowObjectsJS();
          const [{ n, distinct }] = await read(
            `SELECT count(*)::INTEGER AS n, count(DISTINCT ord)::INTEGER AS distinct FROM read_parquet(${sqlString(path)})`,
          );
          if (n !== s.count || distinct !== s.count) {
            throw new Error(`${path}: ${n} rows (${distinct} distinct) for ${s.count} trips`);
          }
          const sample = await read(
            `SELECT ord, trip FROM read_parquet(${sqlString(path)}) WHERE ord % ${VERIFY_EVERY} = 0`,
          );
          if (sample.length !== s.sample.size) throw new Error(`${path}: ${sample.length} sampled rows for ${s.sample.size}`);
          for (const { ord, trip } of sample) deepStrictEqual(JSON.parse(trip), s.sample.get(ord));
          result[side] = { path: tables[side], trips: s.count, bytes: statSync(path).size };
          endWrite({ rows: s.count, bytes: result[side].bytes });
        }
      } finally {
        close();
      }

      // Route names and colours, and stop names, come from the routes.txt and
      // stops.txt raw tables the entity step writes (lib/route-info,
      // lib/stop-info); kept inline only when there are none.
      const { routes, stops, ...indexRest } = index;
      const routeInfo = existsSync(join(datasetDir, ROUTE_INFO_TABLE))
        ? { route_info_file: ROUTE_INFO_TABLE }
        : { routes };
      const stopInfo = existsSync(join(datasetDir, STOP_INFO_TABLE))
        ? { stop_info_file: STOP_INFO_TABLE }
        : { stops };
      // Service sets as indices into one service_id list (lib/trips-index-codec.ts).
      const endIndex = timer(`write ${TRIPS_INDEX_FILE} (encode + checks + write)`);
      const doc = compactServiceSets({
        ...indexRest,
        ...routeInfo,
        ...stopInfo,
        feeds: { base: { trips: [] }, new: { trips: [] } },
        trip_tables: { ...tables, ...(byRoute ? { by_route: true } : {}) },
      });
      const text = JSON.stringify(doc);
      deepStrictEqual(JSON.parse(text), doc);
      deepStrictEqual(expandServiceSets(JSON.parse(text)).service_sets, index.service_sets);
      writeFileSync(outPath, text);
      endIndex({ bytes: text.length });
      return { index_bytes: text.length, tables: result };
    },

    /** Drops the scratch database (on error; finish() already does). */
    abort: close,
  };
}

export function describeWrite(datasetDir, r) {
  const kb = (b) => `${Math.round(b / 1024)} KB`;
  return [
    `Wrote ${join(datasetDir, TRIPS_INDEX_FILE)} (index, ${kb(r.index_bytes)})`,
    ...Object.values(r.tables).map((t) => `  ${t.path}: ${t.trips} trips, ${kb(t.bytes)}`),
  ].join('\n');
}
