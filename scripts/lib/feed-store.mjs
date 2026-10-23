/**
 * Both GTFS feeds of a diff, loaded into an on-disk DuckDB database.
 *
 * Large feeds (IDFM: 10M stop_times rows per feed, 1.2 GB files) can't be
 * held as JS strings or row objects, so:
 *
 *   - every file is unpacked to a temp folder and read by DuckDB's CSV
 *     reader (explicit RFC 4180 settings, everything VARCHAR);
 *   - stop_times.txt and shapes.txt stay in DuckDB only (SQL_ONLY_FILES):
 *     consumers query them, a route or a shape set at a time. Reading their
 *     `rows` from JS throws, so no code path silently sees them empty;
 *   - every other file becomes the JS row objects the generators always
 *     used ({ header, rows }, values trimmed, '' for empty), with their
 *     1-based CSV line numbers.
 *
 * Tables, per side ('base' | 'new'):
 *   <side>__<file stem>      the file as loaded (stop_times, trips, …)
 *   <side>__st               stop_times + _line, _seq (int), _route,
 *                            _stop_key (stop_id with id_mappings applied),
 *                            sorted by route, trip, sequence
 *   <side>__shp              shapes + _line, _seq, _lat, _lon, sorted by
 *                            shape and sequence
 *   <side>__stop_alias       (trip_id, stop_id) -> original stop_id from a
 *                            Google-style id_mappings.txt, when present
 */

import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';

/** DuckDB memory cap for the store. */
const MEMORY_LIMIT = '6GB';

export const SQL_ONLY_FILES = new Set(['stop_times.txt', 'shapes.txt']);
export const SIDES = ['base', 'new'];

/** Files read besides the ones a generator asks for (extensions it understands). */
const EXTRA_FILES = new Set(['id_mappings.txt']);

function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

export function ident(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/** "stop_times.txt" -> "base__stop_times" */
export function tableOf(side, file) {
  return `${side}__${file.replace(/\.(txt|geojson)$/, '').replace(/[^a-z0-9_]/gi, '_')}`;
}

/** Member names of a zip (unzip -Z1), by lowercased base name. */
function zipMembers(zipPath) {
  const res = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`unzip -Z1 ${zipPath} failed: ${res.stderr}`);
  const out = new Map();
  for (const m of res.stdout.split('\n')) {
    if (!m || m.endsWith('/') || m.startsWith('__MACOSX')) continue;
    const name = basename(m).toLowerCase();
    if (name.endsWith('.txt') || name.endsWith('.geojson')) out.set(name, m);
  }
  return out;
}

/** Streams one zip member to a file (no JS buffering, any size). */
function extract(zipPath, member, dest) {
  const res = spawnSync('sh', ['-c', `unzip -p "$0" "$1" > "$2"`, zipPath, member, dest]);
  if (res.status !== 0) throw new Error(`unzip -p ${member} failed: ${res.stderr}`);
}

/**
 * Where CSV records start, when that isn't simply rowid + 2: DuckDB skips
 * blank lines and its rowid counts records, while the raw diff shows file
 * lines (STM has blank lines in stop_times.txt). Returns breakpoints
 * [[record, extra]]: data records from `record` on start `extra` lines
 * later than rowid + 2. Empty for well-formed files.
 */
function recordLineBreaks(path) {
  const fd = openSync(path, 'r');
  const buf = Buffer.allocUnsafe(1 << 22);
  const breaks = [];
  let line = 1;
  let record = -2; // the header becomes record -1
  let extra = 0;
  let inQuotes = false;
  let atStart = true; // at the start of a line, outside quotes
  try {
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null);
      if (n === 0) break;
      for (let i = 0; i < n; i++) {
        const c = buf[i];
        if (c === 10) {
          line++;
          if (!inQuotes) atStart = true;
          continue;
        }
        if (atStart && c !== 13) {
          atStart = false;
          record++;
          if (record >= 0 && line - (record + 2) !== extra) {
            extra = line - (record + 2);
            breaks.push([record, extra]);
          }
        }
        if (c === 34) inQuotes = !inQuotes;
      }
    }
  } finally {
    closeSync(fd);
  }
  return { breaks, records: record + 1 };
}

function source(path) {
  return { source: basename(path), downloadedAt: statSync(path).mtime.toISOString() };
}

/**
 * @param o.basePath, o.newPath  feed zips
 * @param o.files     Set of GTFS file names the generator understands
 * @param o.lineOf    WeakMap the generator uses for row line numbers
 */
export async function openFeedStore({ basePath, newPath, files, lineOf }) {
  const work = mkdtempSync(join(tmpdir(), 'gtfs-store-'));
  const dbPath = join(work, 'store.duckdb');
  // Capped so large aggregates spill to disk instead of aborting the process
  // (the generators' own heap needs the rest of the machine).
  const instance = await DuckDBInstance.create(dbPath, {
    preserve_insertion_order: 'true',
    memory_limit: MEMORY_LIMIT,
    temp_directory: join(work, 'spill'),
  });
  const con = await instance.connect();
  const run = (sql) => con.run(sql);
  const all = async (sql) => (await con.runAndReadAll(sql)).getRowObjectsJS();
  const t0 = Date.now();

  const feeds = {};
  const lineBreaks = new Map(); // table -> recordLineBreaks().breaks
  /** SQL file line of `alias`'s rows, with `join` to add to its FROM. */
  const lineSql = (table, alias) =>
    lineBreaks.get(table)?.length > 0
      ? { expr: `${alias}.rowid + 2 + coalesce(${alias}__l.extra, 0)`, join: `ASOF LEFT JOIN ${ident(`${table}__lines`)} ${alias}__l ON ${alias}.rowid >= ${alias}__l.rec` }
      : { expr: `${alias}.rowid + 2`, join: '' };
  for (const [side, zipPath] of [['base', basePath], ['new', newPath]]) {
    const members = zipMembers(zipPath);
    const dir = join(work, side);
    mkdirSync(dir);
    const feed = { ...source(zipPath), side, files: new Map(), allFiles: [...members.keys()].sort() };
    for (const [name, member] of members) {
      if (!files.has(name) && !EXTRA_FILES.has(name)) continue;
      const path = join(dir, name);
      extract(zipPath, member, path);
      if (name.endsWith('.geojson')) {
        feed.files.set(name, JSON.parse(readFileSync(path, 'utf8')));
        continue;
      }
      const table = tableOf(side, name);
      // Empty files have no header: present, with no columns or rows.
      if (statSync(path).size === 0) {
        feed.files.set(name, { header: [], rows: [] });
        continue;
      }
      await run(
        `CREATE TABLE ${ident(table)} AS SELECT * FROM read_csv(${sqlString(path)}, all_varchar=true, header=true, ` +
          `delim=',', quote='"', escape='"', strict_mode=false, null_padding=true, parallel=false)`,
      );
      const header = [];
      for (const r of await all(`DESCRIBE ${ident(table)}`)) {
        const raw = String(r.column_name);
        const clean = raw.replace(/^\uFEFF/, '').trim();
        // SQL consumers use the clean names too.
        if (clean !== raw) await run(`ALTER TABLE ${ident(table)} RENAME COLUMN ${ident(raw)} TO ${ident(clean)}`);
        header.push(clean);
      }
      const [{ n }] = await all(`SELECT count(*)::INTEGER AS n FROM ${ident(table)}`);
      const lines = recordLineBreaks(path);
      if (lines.records !== n) {
        console.warn(`  ${side} ${name}: ${lines.records} records scanned, ${n} loaded; line numbers are approximate`);
        lines.breaks = [];
      }
      if (lines.breaks.length > 0) {
        await run(`CREATE TABLE ${ident(`${table}__lines`)} (rec BIGINT, extra BIGINT)`);
        await run(`INSERT INTO ${ident(`${table}__lines`)} VALUES ${lines.breaks.map(([r, e]) => `(${r}, ${e})`).join(', ')}`);
      }
      lineBreaks.set(table, lines.breaks);
      if (SQL_ONLY_FILES.has(name)) {
        feed.files.set(name, {
          header,
          count: n,
          // The query-ready derived table (see the header comment).
          sql: `${side}__${name === 'shapes.txt' ? 'shp' : 'st'}`,
          get rows() {
            throw new Error(`${name} is only in DuckDB (feed-store.mjs); query ${side}__st / ${side}__shp instead`);
          },
        });
        continue;
      }
      // rowid follows insertion (file) order: line = rowid + 2 (header is
      // line 1), plus the blank / multi-line offset from recordLineBreaks.
      let next = 0;
      let extra = 0;
      const rows = (await all(`SELECT *, rowid AS __rowid FROM ${ident(table)} ORDER BY rowid`)).map((r) => {
        const obj = {};
        for (const h of header) {
          const v = r[h];
          obj[h] = v == null ? '' : String(v).trim();
        }
        const rowid = Number(r.__rowid);
        while (next < lines.breaks.length && lines.breaks[next][0] <= rowid) extra = lines.breaks[next++][1];
        lineOf?.set(obj, rowid + 2 + extra);
        return obj;
      });
      feed.files.set(name, { header, rows });
    }
    feeds[side] = feed;
  }

  // Derived tables for the SQL-only files.
  for (const side of SIDES) {
    const t = (f) => ident(tableOf(side, f));
    const has = (f) => feeds[side].files.get(f)?.header.length > 0;
    if (has('id_mappings.txt')) {
      // Google exports rename stops per trip: from_id "###TRIPID:<trip>###_<stop>"
      // (or a plain stop id) -> to_id. Reversed: (trip, new stop) -> original stop.
      await run(
        `CREATE TABLE ${ident(`${side}__stop_alias`)} AS
         SELECT DISTINCT
           CASE WHEN from_id LIKE '###TRIPID:%###\\_%' ESCAPE '\\' THEN regexp_extract(from_id, '^###TRIPID:(.*)###_', 1) END AS trip_id,
           to_id AS stop_id,
           regexp_replace(from_id, '^###TRIPID:.*###_', '') AS original
         FROM ${t('id_mappings.txt')} WHERE table_name = 'stops'`,
      );
      // A plain to_id merging several original stops is ambiguous: keep it as is.
      await run(
        `DELETE FROM ${ident(`${side}__stop_alias`)} a WHERE a.trip_id IS NULL AND
           (SELECT count(DISTINCT original) FROM ${ident(`${side}__stop_alias`)} b WHERE b.trip_id IS NULL AND b.stop_id = a.stop_id) > 1`,
      );
    }
    if (has('stop_times.txt')) {
      const alias = has('id_mappings.txt');
      const line = lineSql(tableOf(side, 'stop_times.txt'), 'st');
      await run(
        `CREATE TABLE ${ident(`${side}__st`)} AS
         SELECT st.*, ${line.expr} AS _line, TRY_CAST(st.stop_sequence AS DOUBLE) AS _seq, tr.route_id AS _route,
           ${alias ? 'coalesce(a1.original, a2.original, st.stop_id)' : 'st.stop_id'} AS _stop_key
         FROM ${t('stop_times.txt')} st ${line.join}
         LEFT JOIN (SELECT DISTINCT trip_id, route_id FROM ${has('trips.txt') ? t('trips.txt') : '(SELECT NULL::VARCHAR AS trip_id, NULL::VARCHAR AS route_id)'}) tr ON tr.trip_id = st.trip_id
         ${alias ? `LEFT JOIN ${ident(`${side}__stop_alias`)} a1 ON a1.trip_id = st.trip_id AND a1.stop_id = st.stop_id
                    LEFT JOIN (SELECT * FROM ${ident(`${side}__stop_alias`)} WHERE trip_id IS NULL) a2 ON a2.stop_id = st.stop_id` : ''}
         ORDER BY _route NULLS LAST, st.trip_id, _seq`,
      );
      await run(`DROP TABLE ${t('stop_times.txt')}`);
    }
    if (has('shapes.txt')) {
      const line = lineSql(tableOf(side, 'shapes.txt'), 's');
      await run(
        `CREATE TABLE ${ident(`${side}__shp`)} AS
         SELECT s.*, ${line.expr} AS _line, TRY_CAST(s.shape_pt_sequence AS DOUBLE) AS _seq,
           TRY_CAST(s.shape_pt_lat AS DOUBLE) AS _lat, TRY_CAST(s.shape_pt_lon AS DOUBLE) AS _lon
         FROM ${t('shapes.txt')} s ${line.join} ORDER BY s.shape_id, _seq`,
      );
      await run(`DROP TABLE ${t('shapes.txt')}`);
    }
  }
  // The unpacked CSVs are no longer needed.
  for (const side of SIDES) rmSync(join(work, side), { recursive: true, force: true });
  console.log(`Feed store: loaded in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

  return {
    base: feeds.base,
    new: feeds.new,
    con,
    all,
    run,
    /** A second connection (e.g. one Parquet appender per connection). */
    connect: () => instance.connect(),
    close() {
      con.closeSync();
      instance.closeSync();
      rmSync(work, { recursive: true, force: true });
    },
  };
}
