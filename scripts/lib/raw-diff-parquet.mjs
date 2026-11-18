/**
 * Full row-level diffs as Parquet, one file per GTFS file, for the raw diff
 * table (DuckDB-WASM in the browser queries them over HTTP range requests).
 *
 * Every row of either feed appears at most once, with its action:
 *   added | deleted | modified | id_only | unchanged
 * where id_only means the same row whose only differences are identifiers
 * (a renumbered trip_id / block_id / stop_sequence). Rows identical in both
 * feeds are stored in the trip files (trips, stop_times, frequencies: the
 * Trips pages and highlights count and show whole trips) and in the files
 * others look entities up in (stops, routes: every stop and route of either
 * feed, once). There, b_<column> is NULL where the base value equals the new
 * one (`compact_unchanged` on the table entry), so an unchanged row costs
 * one side. Elsewhere they are counted but not written (`unchanged_omitted`).
 *
 * Columns (all VARCHAR unless noted):
 *   action, route_id, service_id, direction_id,
 *   trip_key       new trip_id, else the base one (groups a trip's rows)
 *   base_trip_id, new_trip_id,
 *   seq INTEGER    position within the trip (aligned stop order)
 *   base_line INTEGER, new_line INTEGER   1-based CSV lines (header = 1)
 *   changed        comma-separated changed columns (modified rows)
 *   b_<column>, n_<column>   the base / new value of every GTFS column
 *
 * Sorted by route_id, trip_key, seq, so filters on a route or trip only
 * touch a few row groups.
 */

import { mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { timer } from './timings.mjs';
import { RAW_DIR, rawTablePath } from '../../src/app/screens/GtfsDiffToolV2/lib/diff-layout.ts';

export { RAW_DIR, rawTablePath };
export const ACTIONS = ['added', 'deleted', 'modified', 'id_only', 'unchanged'];

/** Leading columns of every raw table, before b_<col> / n_<col> pairs. */
export const META = [
  ['action', 'VARCHAR'],
  ['route_id', 'VARCHAR'],
  ['service_id', 'VARCHAR'],
  ['direction_id', 'VARCHAR'],
  ['trip_key', 'VARCHAR'],
  ['base_trip_id', 'VARCHAR'],
  ['new_trip_id', 'VARCHAR'],
  ['seq', 'INTEGER'],
  ['base_line', 'INTEGER'],
  ['new_line', 'INTEGER'],
  ['changed', 'VARCHAR'],
];

/**
 * Rows per row group of the raw tables (about 2.5-3.5 MB of stop_times).
 * DuckDB-WASM reads each column chunk of each group with its own request, so
 * fewer, larger groups make whole-table scans (the overview counts) cheaper,
 * while a route's rows (tables are sorted by route) still span few groups.
 */
export const ROW_GROUP_SIZE = 250000;

/**
 * COPY options of every Parquet file a diff holds. Format V2 delta-encodes
 * integers and strings (the raw tables' line numbers and times): 38-50%
 * smaller raw tables (STM stop_times 117 -> 72 MB), read by DuckDB-WASM
 * as is.
 */
export function parquetOptions(rowGroupSize = ROW_GROUP_SIZE) {
  return `FORMAT parquet, COMPRESSION zstd, PARQUET_VERSION V2, ROW_GROUP_SIZE ${rowGroupSize}`;
}

function ident(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

function sqlString(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Parquet table name of a GTFS file: stop_times.txt -> stop_times */
export function tableName(file) {
  return file.replace(/\.txt$/, '');
}

/**
 * Opens a scratch DuckDB database (on disk, so large feeds can spill) that
 * collects rows and writes one Parquet file per table into `<dir>/raw/`
 * (lib/diff-layout.ts rawTablePath).
 */
export async function openRawParquet(datasetDir) {
  const outDir = join(datasetDir, RAW_DIR);
  mkdirSync(outDir, { recursive: true });
  const dbPath = join(tmpdir(), `gtfs-raw-diff-${process.pid}-${Date.now()}.duckdb`);
  const instance = await DuckDBInstance.create(dbPath);
  const con = await instance.connect();

  return {
    /** The dataset folder (tables written straight from SQL go to rawTablePath there). */
    datasetDir,
    async table(file, columns) {
      const name = tableName(file);
      const cols = [...META, ...columns.flatMap((c) => [[`b_${c}`, 'VARCHAR'], [`n_${c}`, 'VARCHAR']])];
      // One connection per table, so several files can be appended to at
      // once (the trips diff writes trips, stop_times and frequencies rows
      // route by route).
      const tcon = await instance.connect();
      await tcon.run(`CREATE OR REPLACE TABLE ${ident(name)} (${cols.map(([c, t]) => `${ident(c)} ${t}`).join(', ')})`);
      const appender = await tcon.createAppender(name);
      const str = (v) => (v == null ? appender.appendNull() : appender.appendVarchar(String(v)));
      const int = (v) => (v == null ? appender.appendNull() : appender.appendInteger(v));
      let rows = 0;
      // Rows counted under their action but not written.
      const skipped = Object.fromEntries(ACTIONS.map((a) => [a, 0]));
      let anySkipped = false;
      let anyCompact = false;
      return {
        /** Counts a row without writing it. */
        skip(action) {
          skipped[action]++;
          anySkipped = true;
        },
        append(r) {
          str(r.action);
          str(r.route_id);
          str(r.service_id);
          str(r.direction_id);
          str(r.trip_key);
          str(r.base_trip_id);
          str(r.new_trip_id);
          int(r.seq);
          int(r.base_line);
          int(r.new_line);
          str(r.changed && r.changed.length > 0 ? r.changed.join(',') : null);
          // compactBase: an unchanged row's base values are left NULL where
          // they equal the new ones.
          const compact = r.compactBase === true && r.base != null && r.new != null;
          if (compact) anyCompact = true;
          for (const c of columns) {
            const b = r.base ? (r.base[c] ?? '') : null;
            const n = r.new ? (r.new[c] ?? '') : null;
            str(compact && b === n ? null : b);
            str(n);
          }
          appender.endRow();
          rows++;
        },
        async finish() {
          // Rows were appended along the way; this is the sort + COPY.
          const rel = rawTablePath(file);
          const end = timer(`write ${rel} (sort + COPY)`);
          appender.closeSync();
          const path = join(datasetDir, rel);
          await tcon.run(
            `COPY (SELECT * FROM ${ident(name)} ORDER BY route_id NULLS LAST, trip_key, seq) TO ${sqlString(path)} ` +
              `(${parquetOptions()})`,
          );
          const res = await tcon.runAndReadAll(`SELECT action, count(*)::INTEGER AS n FROM ${ident(name)} GROUP BY action`);
          const counts = { ...skipped };
          for (const { action, n } of res.getRowObjectsJS()) counts[action] += n;
          await tcon.run(`DROP TABLE ${ident(name)}`);
          tcon.closeSync();
          end(() => ({ rows, bytes: statSync(path).size }));
          return {
            file,
            path: rel,
            rows,
            bytes: statSync(path).size,
            columns,
            counts,
            ...(anySkipped ? { unchanged_omitted: true } : {}),
            ...(anyCompact ? { compact_unchanged: true } : {}),
          };
        },
      };
    },
    close() {
      con.closeSync();
      instance.closeSync();
      rmSync(dbPath, { force: true });
      rmSync(`${dbPath}.wal`, { force: true });
    },
  };
}
