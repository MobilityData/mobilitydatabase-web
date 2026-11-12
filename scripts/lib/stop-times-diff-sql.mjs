/**
 * stop_times.txt rows of the trips family diff (trips-family-diff.mjs),
 * built in SQL over the feed store's <side>__st tables instead of row by
 * row in JS.
 *
 * The routes loop records each trip only (trip() / align()):
 *   same      a pair whose stop lists are identical: row i pairs with row i
 *             (what alignStops gives for equal lists)
 *   aligned   a pair whose stop pattern changed: alignStops' ops, one row
 *             each (the minority of trips)
 *   deleted / added   a trip with no counterpart
 * finish() joins those to the stop_times rows, classifies every row the way
 * fileCollector.compare() does and writes raw/stop_times.parquet.
 *
 * A row is addressed by (route, trip, position): position i is the trip's
 * i-th row in routeStopTimes() order (trip_id, _seq, _line), grouped by the
 * trimmed trip_id like the JS rows, so it is the row the loop saw at index i.
 * Values are compared as the JS sees them: trimmed (String.trim()), '' for
 * NULL.
 */

import { statSync } from 'node:fs';
import { join } from 'node:path';
import { ident } from './feed-store.mjs';
import { ACTIONS, META, RAW_DIR, parquetOptions, tableName } from './raw-diff-parquet.mjs';
import { timer } from './timings.mjs';

/** Every character String.prototype.trim() removes (all in the BMP). */
const JS_WHITESPACE =
  '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';

/**
 * Output rows per SQL pass. The store's DuckDB is memory-capped
 * (feed-store.mjs) and one pass over STM (10.8M rows) runs out of it, so
 * larger diffs are built a batch of routes at a time into a temp table
 * (spills past the cap; faster and leaner than an on-disk one), then sorted
 * and written once.
 */
const BATCH_ROWS = 4000000;

const T = {
  trips: 'st_diff__trips',
  align: 'st_diff__align',
  batch: 'st_diff__batch',
  rows: 'st_diff__rows',
  shapes: 'st_diff__same_shape',
};

function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/**
 * String(v ?? '').trim() of a VARCHAR, as routeStopTimes() reads it. trim()
 * with a character set is slow; most values have nothing to trim.
 */
const jsTrim = (expr) =>
  `CASE WHEN regexp_matches(${expr}, ${sqlString(`^[${JS_WHITESPACE}]|[${JS_WHITESPACE}]$`)}) ` +
  `THEN trim(${expr}, ${sqlString(JS_WHITESPACE)}) ELSE coalesce(${expr}, '') END`;

/**
 * @param o.store       feed store (feed-store.mjs)
 * @param o.baseTable, o.newTable   stop_times.txt of each feed, or null
 * @param o.columns     union of both headers (the raw table's b_/n_ columns)
 * @param o.compared    columns compared (in both feeds)
 * @param o.idColumns   Set of columns whose differences alone are id_only
 * @param o.sameShape   (baseShapeId, newShapeId) -> boolean, or null
 * @param o.parquet     writer from raw-diff-parquet.mjs (its outDir), or null
 * @param o.batchRows   output rows per SQL pass (tests force batches with it)
 */
export async function openStopTimesSql({
  store,
  baseTable,
  newTable,
  columns,
  compared,
  idColumns,
  sameShape,
  parquet,
  batchRows = BATCH_ROWS,
}) {
  await store.run(
    `CREATE OR REPLACE TABLE ${T.trips} (g INTEGER, kind VARCHAR, route VARCHAR, base_tk VARCHAR, new_tk VARCHAR, n INTEGER,
       route_id VARCHAR, service_id VARCHAR, direction_id VARCHAR, trip_key VARCHAR, base_trip_id VARCHAR, new_trip_id VARCHAR)`,
  );
  await store.run(`CREATE OR REPLACE TABLE ${T.align} (g INTEGER, seq INTEGER, bi INTEGER, ni INTEGER)`);
  // One appender per connection.
  const tcon = await store.connect();
  const acon = await store.connect();
  const tripsAp = await tcon.createAppender(T.trips);
  const alignAp = await acon.createAppender(T.align);
  const str = (ap, v) => (v == null ? ap.appendNull() : ap.appendVarchar(String(v)));
  const int = (ap, v) => (v == null ? ap.appendNull() : ap.appendInteger(v));
  let groups = 0;

  /**
   * One feed's rows of the recorded trips' routes (`routes`: SQL list of a
   * batch's routes, or null for all), keyed by (_route, _tk, _pos), with
   * v<i> per union column.
   */
  const sideSql = (table, tkColumn, routes) => {
    if (!table?.sql) {
      return `SELECT NULL::VARCHAR AS _route, NULL::VARCHAR AS _tk, NULL::BIGINT AS _pos, NULL::BIGINT AS _line, NULL::VARCHAR AS _sk${columns
        .map((_, i) => `, NULL::VARCHAR AS v${i}`)
        .join('')} WHERE false`;
    }
    const header = new Set(table.header);
    const tk = jsTrim('st.trip_id');
    const vals = columns.map((c, i) => `${header.has(c) ? jsTrim(`st.${ident(c)}`) : "''"} AS v${i}`);
    // Positions over the key columns only (a window buffers its whole input).
    return `SELECT w._route, w._tk, w._pos, st._line, coalesce(st._stop_key, '') AS _sk, ${vals.join(', ')}
      FROM ${ident(table.sql)} st
      JOIN (
        SELECT st.rowid AS _rid, st._route, ${tk} AS _tk,
          row_number() OVER (PARTITION BY st._route, ${tk} ORDER BY st.trip_id, st._seq, st._line) - 1 AS _pos
        FROM ${ident(table.sql)} st
        WHERE st._route IN (SELECT route FROM ${T.trips} WHERE ${tkColumn} IS NOT NULL)
          ${routes ? `AND st._route IN ${routes}` : ''}
      ) w ON w._rid = st.rowid`;
  };

  /** Which row of each feed every output row takes: (g, seq, bi, ni). */
  const positionsSql = `
    SELECT g, i AS seq, i AS bi, i AS ni FROM (SELECT g, unnest(range(n)) AS i FROM ${T.trips} WHERE kind = 'same')
    UNION ALL SELECT g, seq, bi, ni FROM ${T.align}
    UNION ALL SELECT g, i, i, NULL FROM (SELECT g, unnest(range(n)) AS i FROM ${T.trips} WHERE kind = 'deleted')
    UNION ALL SELECT g, i, NULL, i FROM (SELECT g, unnest(range(n)) AS i FROM ${T.trips} WHERE kind = 'added')`;

  /** FROM ... of the output rows: x (positions), t (trip), b / n (rows). */
  const fromSql = ({ routes = null, join: extraJoin = '', where = [] } = {}) => `
    FROM (${positionsSql}) x
    JOIN ${T.trips} t ON t.g = x.g
    LEFT JOIN (${sideSql(baseTable, 'base_tk', routes)}) b ON b._route = t.route AND b._tk = t.base_tk AND b._pos = x.bi
    LEFT JOIN (${sideSql(newTable, 'new_tk', routes)}) n ON n._route = t.route AND n._tk = t.new_tk AND n._pos = x.ni
    ${extraJoin}
    ${[...(routes ? [`t.route IN ${routes}`] : []), ...where].map((w, i) => `${i === 0 ? 'WHERE' : 'AND'} ${w}`).join(' ')}`;

  return {
    /**
     * Records one trip; returns its group id.
     * @param kind   'same' | 'aligned' | 'deleted' | 'added'
     * @param route  the routes loop's route (<side>__st._route)
     * @param baseTk, newTk  trip_id of its rows in each feed (null when none)
     * @param n      its row count ('same': either side, 'deleted' / 'added': its side)
     * @param ctx    route_id, service_id, direction_id, trip_key, base_trip_id, new_trip_id
     */
    trip(kind, route, baseTk, newTk, n, ctx) {
      const g = groups++;
      tripsAp.appendInteger(g);
      str(tripsAp, kind);
      str(tripsAp, route);
      str(tripsAp, baseTk);
      str(tripsAp, newTk);
      tripsAp.appendInteger(n);
      for (const c of ['route_id', 'service_id', 'direction_id', 'trip_key', 'base_trip_id', 'new_trip_id']) str(tripsAp, ctx[c]);
      tripsAp.endRow();
      return g;
    },
    /** alignStops' ops of an 'aligned' trip. */
    align(g, ops) {
      ops.forEach((o, i) => {
        alignAp.appendInteger(g);
        alignAp.appendInteger(i);
        int(alignAp, o.bi);
        int(alignAp, o.ni);
        alignAp.endRow();
      });
    },

    /**
     * Builds and writes the rows. Returns the raw table description (null
     * without a Parquet writer) and the changed-row counts of paired trips,
     * by their trip key: [{ key, action, n }].
     */
    async finish() {
      tripsAp.closeSync();
      alignAp.closeSync();
      tcon.closeSync();
      acon.closeSync();

      // Routes in batches of about batchRows output rows (a route is never split).
      await store.run(
        `CREATE OR REPLACE TABLE ${T.batch} AS
         SELECT route, ((sum(k) OVER (ORDER BY route ROWS UNBOUNDED PRECEDING) - k) // ${batchRows})::INTEGER AS b
         FROM (
           SELECT t.route, sum(CASE WHEN t.kind = 'aligned' THEN coalesce(a.k, 0) ELSE t.n END) AS k
           FROM ${T.trips} t LEFT JOIN (SELECT g, count(*) AS k FROM ${T.align} GROUP BY g) a ON a.g = t.g
           GROUP BY t.route
         )`,
      );
      const batchIds = (await store.all(`SELECT DISTINCT b FROM ${T.batch} ORDER BY b`)).map((r) => r.b);
      const routesOf = (b) => (batchIds.length > 1 ? `(SELECT route FROM ${T.batch} WHERE b = ${b})` : null);
      const passes = batchIds.length > 0 ? batchIds : [0];

      // A shape_id column in stop_times (an extension) follows the trips.txt
      // rule: a renamed shape on the same path is an identifier change.
      const shapeIdx = columns.indexOf('shape_id');
      const shapeRule = sameShape != null && shapeIdx >= 0 && compared.includes('shape_id');
      if (shapeRule) {
        const endShapes = timer('stop_times: renamed shape_id pairs (SQL + sameShape)');
        const v = `v${shapeIdx}`;
        const pairs = new Map();
        for (const b of passes) {
          const sql = `SELECT DISTINCT b.${v} AS b, n.${v} AS n ${fromSql({ routes: routesOf(b), where: ['x.bi IS NOT NULL', 'x.ni IS NOT NULL', `b.${v} <> n.${v}`] })}`;
          for (const p of await store.all(sql)) pairs.set(JSON.stringify([p.b, p.n]), p);
        }
        await store.run(`CREATE OR REPLACE TABLE ${T.shapes} (b VARCHAR, n VARCHAR)`);
        const same = [...pairs.values()].filter((p) => sameShape(p.b, p.n));
        if (same.length > 0) {
          await store.run(`INSERT INTO ${T.shapes} VALUES ${same.map((p) => `(${sqlString(p.b)}, ${sqlString(p.n)})`).join(', ')}`);
        }
        endShapes({ rows: pairs.size });
      }

      // fileCollector.compare(): per compared column, d = differs, r = a real
      // change (not an identifier: ID columns, a stop renamed through
      // id_mappings.txt, a renamed shape on the same path).
      const cmp = compared.map((c) => {
        const i = columns.indexOf(c);
        let id = 'false';
        if (idColumns.has(c)) id = 'true';
        else if (c === 'shape_id') id = shapeRule ? 'ss.b IS NOT NULL' : 'false';
        else if (c === 'stop_id') id = "(b._sk <> '' AND b._sk = n._sk)";
        return { c, d: `(b.v${i} <> n.v${i})`, r: `(b.v${i} <> n.v${i} AND NOT ${id})` };
      });
      const any = (parts) => (parts.length > 0 ? parts.join(' OR ') : 'false');
      const anyReal = `(x.bi IS NOT NULL AND x.ni IS NOT NULL AND (${any(cmp.map((e) => e.r))}))`;
      const changed =
        cmp.length > 0 ? `concat_ws(',', ${cmp.map((e) => `CASE WHEN ${e.r} THEN ${sqlString(e.c)} END`).join(', ')})` : 'NULL';
      const meta = {
        action: `CASE WHEN x.bi IS NULL THEN 'added' WHEN x.ni IS NULL THEN 'deleted' WHEN ${anyReal} THEN 'modified'
          WHEN ${any(cmp.map((e) => e.d))} THEN 'id_only' ELSE 'unchanged' END`,
        route_id: 't.route_id',
        service_id: 't.service_id',
        direction_id: 't.direction_id',
        trip_key: 't.trip_key',
        base_trip_id: 't.base_trip_id',
        new_trip_id: 't.new_trip_id',
        seq: 'x.seq',
        base_line: 'b._line',
        new_line: 'n._line',
        changed: `CASE WHEN ${anyReal} THEN ${changed} END`,
      };
      const select = [
        'x.g AS _g',
        ...META.map(([c, type]) => `CAST(${meta[c]} AS ${type}) AS ${ident(c)}`),
        ...columns.flatMap((c, i) => [
          `CASE WHEN x.bi IS NOT NULL THEN b.v${i} END AS ${ident(`b_${c}`)}`,
          `CASE WHEN x.ni IS NOT NULL THEN n.v${i} END AS ${ident(`n_${c}`)}`,
        ]),
      ].join(',\n');
      const rowsSql = (routes) =>
        `SELECT ${select} ${fromSql({ routes, join: shapeRule ? `LEFT JOIN ${T.shapes} ss ON ss.b = b.v${shapeIdx} AND ss.n = n.v${shapeIdx}` : '' })}`;

      // One pass: written straight from the query. Several: staged first, in
      // a temp table.
      let source = `(${rowsSql(null)})`;
      if (passes.length > 1) {
        const endStage = timer(`stop_times: staging rows (SQL join + classify, ${passes.length} batches)`);
        for (const [i, b] of passes.entries()) {
          await store.run(`${i === 0 ? `CREATE OR REPLACE TEMP TABLE ${T.rows} AS` : `INSERT INTO ${T.rows}`} ${rowsSql(routesOf(b))}`);
        }
        endStage();
        source = T.rows;
      }
      let path = null;
      if (parquet) {
        const name = tableName('stop_times.txt');
        const end = timer(`write ${RAW_DIR}/${name}.parquet (${passes.length > 1 ? '' : 'SQL join + classify + '}sort + COPY)`);
        path = join(parquet.outDir, `${name}.parquet`);
        const out = [...META.map(([c]) => c), ...columns.flatMap((c) => [`b_${c}`, `n_${c}`])].map(ident).join(', ');
        // _g breaks ties in trip order (the order rows used to be appended in).
        await store.run(
          `COPY (SELECT ${out} FROM ${source} ORDER BY route_id NULLS LAST, trip_key, seq, _g) TO ${sqlString(path)} (${parquetOptions()})`,
        );
        end(() => ({ bytes: statSync(path).size }));
        // Counts are read back from the file.
        source = `read_parquet(${sqlString(path)})`;
      }

      const endCounts = timer('stop_times: counts (actions, changed rows per paired trip)');
      const byAction = await store.all(
        `SELECT action, count(*)::INTEGER AS n,
           count(*) FILTER (WHERE (action <> 'added' AND base_line IS NULL) OR (action <> 'deleted' AND new_line IS NULL))::INTEGER AS lost
         FROM ${source} GROUP BY action`,
      );
      // Every recorded position must have found its row.
      const lost = byAction.reduce((s, r) => s + r.lost, 0);
      if (lost > 0) throw new Error(`stop_times diff: ${lost} rows not found in the stop_times tables`);
      const counts = Object.fromEntries(ACTIONS.map((a) => [a, 0]));
      for (const { action, n } of byAction) counts[action] = n;
      const rows = byAction.reduce((s, r) => s + r.n, 0);
      // A paired trip's rows carry both trip ids; it is counted under the new
      // one (its key in the trips.txt entity). Unpaired trips are counted in
      // the routes loop.
      const childCounts = await store.all(
        `SELECT new_trip_id AS key, action, count(*)::INTEGER AS n FROM ${source}
         WHERE base_trip_id IS NOT NULL AND new_trip_id IS NOT NULL AND action IN ('added', 'deleted', 'modified')
         GROUP BY ALL ORDER BY ALL`,
      );
      endCounts({ rows });
      for (const t of Object.values(T)) await store.run(`DROP TABLE IF EXISTS ${t}`);
      const table = path
        ? { file: 'stop_times.txt', path: `${RAW_DIR}/${tableName('stop_times.txt')}.parquet`, rows, bytes: statSync(path).size, columns, counts }
        : null;
      return { table, childCounts };
    },
  };
}
