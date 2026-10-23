/**
 * Full row-level diffs as Parquet, one file per GTFS file, for the raw diff
 * table (DuckDB-WASM in the browser queries them over HTTP range requests).
 *
 * Every row of either feed appears exactly once, with its action:
 *   added | deleted | modified | id_only | unchanged
 * where id_only means the same row whose only differences are identifiers
 * (a renumbered trip_id / block_id / stop_sequence).
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

export const RAW_DIR = 'raw';
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
 * collects rows and writes one Parquet file per table into `<dir>/raw/`.
 */
export async function openRawParquet(datasetDir) {
  const outDir = join(datasetDir, RAW_DIR);
  mkdirSync(outDir, { recursive: true });
  const dbPath = join(tmpdir(), `gtfs-raw-diff-${process.pid}-${Date.now()}.duckdb`);
  const instance = await DuckDBInstance.create(dbPath);
  const con = await instance.connect();

  return {
    /** Directory the Parquet files go to (for tables written straight from SQL). */
    outDir,
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
      return {
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
          for (const c of columns) {
            str(r.base ? (r.base[c] ?? '') : null);
            str(r.new ? (r.new[c] ?? '') : null);
          }
          appender.endRow();
          rows++;
        },
        async finish() {
          appender.closeSync();
          const path = join(outDir, `${name}.parquet`);
          await tcon.run(
            `COPY (SELECT * FROM ${ident(name)} ORDER BY route_id NULLS LAST, trip_key, seq) TO ${sqlString(path)} ` +
              `(FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE ${ROW_GROUP_SIZE})`,
          );
          const res = await tcon.runAndReadAll(`SELECT action, count(*)::INTEGER AS n FROM ${ident(name)} GROUP BY action`);
          const counts = Object.fromEntries(ACTIONS.map((a) => [a, 0]));
          for (const { action, n } of res.getRowObjectsJS()) counts[action] = n;
          await tcon.run(`DROP TABLE ${ident(name)}`);
          tcon.closeSync();
          return { file, path: `${RAW_DIR}/${name}.parquet`, rows, bytes: statSync(path).size, columns, counts };
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

// ── Entity change lists ────────────────────────────────────────────

export const ENTITIES_DIR = 'entities';

/**
 * Writes one entity type's change list (EntityChange[]) to
 * <dir>/entities/<name>.parquet, in its original order, so entity-diff.json
 * keeps only summaries. Columns: ord, key, status, label, and context /
 * field_changes / children as JSON text.
 */
export async function writeChangesTable(datasetDir, file, changes) {
  const outDir = join(datasetDir, ENTITIES_DIR);
  mkdirSync(outDir, { recursive: true });
  const name = file.replace(/\.(txt|geojson)$/, '').replace(/[^a-z0-9_]/gi, '_');
  const path = join(outDir, `${name}.parquet`);
  const dbPath = join(tmpdir(), `gtfs-changes-${process.pid}-${Date.now()}.duckdb`);
  const instance = await DuckDBInstance.create(dbPath);
  const con = await instance.connect();
  try {
    await con.run(
      'CREATE TABLE c (ord INTEGER, key VARCHAR, status VARCHAR, label VARCHAR, context VARCHAR, field_changes VARCHAR, children VARCHAR)',
    );
    const a = await con.createAppender('c');
    const json = (v) => (v == null ? a.appendNull() : a.appendVarchar(JSON.stringify(v)));
    changes.forEach((c, i) => {
      a.appendInteger(i);
      a.appendVarchar(c.key);
      a.appendVarchar(c.status);
      if (c.label == null) a.appendNull();
      else a.appendVarchar(c.label);
      json(c.context);
      json(c.field_changes);
      json(c.children);
      a.endRow();
    });
    a.closeSync();
    await con.run(`COPY (SELECT * FROM c ORDER BY ord) TO ${sqlString(path)} (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE ${ROW_GROUP_SIZE})`);
    const res = await con.runAndReadAll(`SELECT count(*)::INTEGER AS n FROM read_parquet(${sqlString(path)})`);
    const [{ n }] = res.getRowObjectsJS();
    if (n !== changes.length) throw new Error(`${path}: ${n} rows for ${changes.length} changes`);
  } finally {
    con.closeSync();
    instance.closeSync();
    rmSync(dbPath, { force: true });
    rmSync(`${dbPath}.wal`, { force: true });
  }
  return { path: `${ENTITIES_DIR}/${name}.parquet`, rows: changes.length, bytes: statSync(path).size };
}
