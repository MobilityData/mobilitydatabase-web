/**
 * Payload for the day-anchored Trips view: both feeds' trips in a compact
 * form, the set of services running on every date, and the inferred day
 * types (Weekday / Saturday / Sunday) to anchor the comparison on.
 *
 * Matching and classification happen client-side for the selected day, see
 * src/app/screens/GtfsDiffToolV2/lib/trips-utils.ts, so any date can be
 * compared without precomputing every one.
 *
 * Input feeds come from lib/feed-store.mjs: { files: Map<name, { header,
 * rows }> } for small files, stop_times.txt in DuckDB (streamed and handed
 * out a route at a time, so feeds with millions of stop_times rows fit in
 * memory).
 */

import { JSDuckDBValueConverter } from '@duckdb/node-api';
import { ident } from './feed-store.mjs';
import { tally } from './timings.mjs';

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** trips.txt columns carried as fields of their own, not as attributes. */
const TRIP_CORE = new Set(['trip_id', 'route_id', 'service_id', 'direction_id', 'trip_headsign']);

/** Day-type groups, by weekday index (0 = Monday). */
const DAY_GROUPS = [
  { id: 'weekday', label: 'Weekday', days: [0, 1, 2, 3, 4] },
  { id: 'saturday', label: 'Saturday', days: [5] },
  { id: 'sunday', label: 'Sunday', days: [6] },
];

/** A day-type variant must cover at least this share of its group. */
const VARIANT_MIN_SHARE = 0.1;

// ── Dates (YYYYMMDD, UTC) ──────────────────────────────────────────

function toDate(s) {
  return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
}

function addDays(s, n) {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/** 0 = Monday … 6 = Sunday */
function weekdayIndex(s) {
  return (toDate(s).getUTCDay() + 6) % 7;
}

/** service_id -> Set(active dates) */
function activeDates(feed) {
  const out = new Map();
  const get = (id) => {
    if (!out.has(id)) out.set(id, new Set());
    return out.get(id);
  };
  for (const c of feed.files.get('calendar.txt')?.rows ?? []) {
    const dates = get(c.service_id);
    if (!/^\d{8}$/.test(c.start_date) || !/^\d{8}$/.test(c.end_date)) continue;
    const flags = WEEKDAYS.map((d) => c[d] === '1');
    for (let d = c.start_date; d <= c.end_date; d = addDays(d, 1)) if (flags[weekdayIndex(d)]) dates.add(d);
  }
  for (const r of feed.files.get('calendar_dates.txt')?.rows ?? []) {
    if (r.exception_type === '1') get(r.service_id).add(r.date);
    else if (r.exception_type === '2') get(r.service_id).delete(r.date);
  }
  return out;
}

function bounds(set) {
  let lo = null;
  let hi = null;
  for (const v of set) {
    if (lo == null || v < lo) lo = v;
    if (hi == null || v > hi) hi = v;
  }
  return [lo, hi];
}

// ── Compact trips ──────────────────────────────────────────────────

function parseTime(s) {
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(s ?? '');
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
}

/**
 * Compact trips (the Trips view's CompactTrip) of some trips.txt rows.
 * @param tripRows   trips.txt rows, in file order
 * @param stByTrip   Map trip_id -> its stop_times rows, in stop order
 * @param freqRows   frequencies.txt rows (any trips)
 * @param stHeader   stop_times.txt columns (optional ones are only kept when present)
 */
export function compactTrips(tripRows, stByTrip, freqRows, stHeader) {
  const cols = new Set(stHeader ?? []);
  const freq = new Map();
  for (const f of freqRows ?? []) {
    if (!freq.has(f.trip_id)) freq.set(f.trip_id, []);
    freq.get(f.trip_id).push([parseTime(f.start_time) ?? 0, parseTime(f.end_time) ?? 0, Number(f.headway_secs) || 0, f.exact_times ?? '']);
  }

  const trips = [];
  for (const t of tripRows) {
    const rows = stByTrip.get(t.trip_id) ?? [];
    const attrs = {};
    for (const [k, v] of Object.entries(t)) if (!TRIP_CORE.has(k) && v !== '') attrs[k] = v;
    const trip = {
      id: t.trip_id,
      route: t.route_id,
      service: t.service_id,
      dir: t.direction_id ?? '',
      headsign: t.trip_headsign ?? '',
      attrs,
      // id_mappings aliases applied (feed-store.mjs), so renamed stops match.
      stops: rows.map((r) => r._stop_key ?? r.stop_id),
      arr: rows.map((r) => parseTime(r.arrival_time)),
      dep: rows.map((r) => parseTime(r.departure_time)),
      pickup: rows.map((r) => r.pickup_type || '0').join(''),
      dropoff: rows.map((r) => r.drop_off_type || '0').join(''),
    };
    if (cols.has('timepoint')) trip.timepoint = rows.map((r) => r.timepoint || '_').join('');
    if (cols.has('shape_dist_traveled')) {
      trip.dist = rows.map((r) => (r.shape_dist_traveled === '' ? null : Number(r.shape_dist_traveled)));
    }
    if (cols.has('stop_headsign')) trip.stop_headsign = rows.map((r) => r.stop_headsign ?? '');
    if (freq.has(t.trip_id)) trip.freq = freq.get(t.trip_id).sort((a, b) => a[0] - b[0]);
    trips.push(trip);
  }
  return trips;
}

// ── Service sets per date and day types ────────────────────────────

/** For every date: index of the set of services (with trips) running that day. */
function serviceSetsByDate(feed, tripServices) {
  const active = activeDates(feed);
  const byDate = new Map();
  for (const [sid, dates] of active) {
    if (!tripServices.has(sid)) continue;
    for (const d of dates) {
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(sid);
    }
  }
  const sets = [];
  const index = new Map();
  const dateIdx = new Map();
  for (const [d, ids] of byDate) {
    const k = ids.sort().join('|');
    if (!index.has(k)) {
      index.set(k, sets.length);
      sets.push(ids);
    }
    dateIdx.set(d, index.get(k));
  }
  return { sets, dateIdx };
}

/**
 * @param weight date -> trips running (both feeds): when no day pattern
 *   repeats at all (IDFM vs Google: every date has its own services), the
 *   busiest date stands for the group instead of the first one.
 */
function inferDayTypes(dates, overlap, weight = () => 0) {
  const out = [];
  if (!overlap[0] || !overlap[1]) return out;
  for (const g of DAY_GROUPS) {
    const sigs = new Map(); // "b,n" -> dates
    let total = 0;
    for (const [d, [b, n]] of Object.entries(dates)) {
      if (d < overlap[0] || d > overlap[1] || !g.days.includes(weekdayIndex(d))) continue;
      if (b < 0 && n < 0) continue;
      total++;
      const k = `${b},${n}`;
      if (!sigs.has(k)) sigs.set(k, []);
      sigs.get(k).push(d);
    }
    let ranked = [...sigs.values()].sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
    if (ranked[0]?.length === 1) ranked = ranked.sort((a, b) => weight(b[0]) - weight(a[0]) || a[0].localeCompare(b[0]));
    ranked.forEach((ds, i) => {
      if (i > 0 && ds.length < Math.max(2, total * VARIANT_MIN_SHARE)) return;
      ds.sort();
      out.push({
        id: i === 0 ? g.id : `${g.id}-${i + 1}`,
        label: g.label,
        date: ds[0],
        day_count: ds.length,
        group_count: total,
        first: ds[0],
        last: ds[ds.length - 1],
        primary: i === 0,
      });
    });
  }
  return out;
}

// ── Lookups ────────────────────────────────────────────────────────

function routeLookup(baseFeed, newFeed) {
  const ids = (f) => new Set((f.files.get('routes.txt')?.rows ?? []).map((r) => r.route_id));
  const b = ids(baseFeed);
  const n = ids(newFeed);
  const out = {};
  for (const feed of [baseFeed, newFeed]) {
    for (const r of feed.files.get('routes.txt')?.rows ?? []) {
      out[r.route_id] = {
        short_name: r.route_short_name ?? '',
        long_name: r.route_long_name ?? '',
        color: r.route_color ?? '',
        text_color: r.route_text_color ?? '',
        presence: b.has(r.route_id) && n.has(r.route_id) ? 'both' : b.has(r.route_id) ? 'base' : 'new',
      };
    }
  }
  return out;
}

function stopNames(baseFeed, newFeed, used) {
  const out = {};
  for (const feed of [baseFeed, newFeed]) {
    for (const s of feed.files.get('stops.txt')?.rows ?? []) if (used.has(s.stop_id)) out[s.stop_id] = s.stop_name ?? '';
  }
  return out;
}

// ── Reading a route at a time ──────────────────────────────────────

/** stop_times rows of one route (all columns + _line, _seq, _stop_key), by trip and stop order. */
export async function routeStopTimes(store, side, routeId) {
  const st = store[side].files.get('stop_times.txt');
  if (!st?.sql) return [];
  const header = st.header;
  const rows = await store.all(
    `SELECT * FROM ${ident(st.sql)} WHERE _route = '${routeId.replace(/'/g, "''")}' ORDER BY trip_id, _seq, _line`,
  );
  return rows.map((r) => {
    const o = { _line: Number(r._line), _stop_key: r._stop_key == null ? '' : String(r._stop_key) };
    for (const h of header) o[h] = r[h] == null ? '' : String(r[h]).trim();
    return o;
  });
}

/** Routes per INSERT into a stream's route order table. */
const ROUTE_ORDER_BATCH = 1000;

/**
 * Whether <side>__st's stored order (feed-store.mjs: by _route, trip_id,
 * _seq) already hands out `ordOf`'s routes in their order: each listed
 * route's rows contiguous, the routes in ascending ord. DuckDB's VARCHAR
 * order isn't JS's (UTF-16) sort order for every string, so this is
 * checked, not assumed.
 */
async function storedRouteOrderMatches(con, table, ordOf) {
  const groups = (
    await con.runAndReadAll(
      `SELECT _route, min(rowid) AS first, max(rowid) AS last, count(*) AS n FROM ${ident(table)}
       WHERE _route IS NOT NULL GROUP BY _route`,
    )
  ).getRowObjectsJS();
  const listed = groups.filter((g) => ordOf.has(g._route)).sort((a, b) => (a.first < b.first ? -1 : 1));
  return listed.every(
    (g, i) => g.last - g.first + 1n === BigInt(g.n) && (i === 0 || ordOf.get(g._route) > ordOf.get(listed[i - 1]._route)),
  );
}

/** Equal _seq values, as ORDER BY sees them (NULL = NULL, NaN = NaN). */
const sameSeq = (a, b) => a === b || (Number.isNaN(a) && Number.isNaN(b));

/**
 * One feed's stop_times rows of `routes`, read by a single streamed query
 * on a connection of its own (callers keep querying the store meanwhile)
 * and handed out a route at a time: `take(i)` returns the rows of
 * routes[i], the same objects routeStopTimes() returns (in its trip_id,
 * _seq, _line order), for i = 0, 1, 2, … in turn. Rows whose route isn't
 * in `routes` (or is NULL) never come. Only the current chunk (and route)
 * is held in JS.
 *
 * Usually a plain scan of the table in its stored order (no sort, so
 * DuckDB holds next to nothing); rows tied on (trip_id, _seq) are put in
 * _line order here. When the stored route order doesn't match `routes`
 * (storedRouteOrderMatches), the query sorts instead, routes in `routes`
 * order through a joined ordinal table.
 */
async function openRouteStopTimes(store, side, routes) {
  const st = store[side].files.get('stop_times.txt');
  if (!st?.sql || routes.length === 0) return { take: async () => [], close() {} };
  const header = st.header;
  const ordOf = new Map(routes.map((r, i) => [r, i]));
  const con = await store.connect();
  try {
    const scan = await storedRouteOrderMatches(con, st.sql, ordOf);
    let result;
    if (scan) {
      result = await con.stream(`SELECT *, rowid AS __rowid FROM ${ident(st.sql)}`);
    } else {
      console.log(`  ${side} stop_times: stored route order differs from JS sort order, streaming sorted`);
      // TEMP: one per connection, so both feeds' streams can run at once.
      await con.run('CREATE TEMP TABLE __route_order (ord INTEGER, route VARCHAR)');
      for (let i = 0; i < routes.length; i += ROUTE_ORDER_BATCH) {
        const values = routes
          .slice(i, i + ROUTE_ORDER_BATCH)
          .map((r, j) => `(${i + j}, '${r.replace(/'/g, "''")}')`)
          .join(', ');
        await con.run(`INSERT INTO __route_order VALUES ${values}`);
      }
      result = await con.stream(
        `SELECT st.*, o.ord AS __route_ord FROM ${ident(st.sql)} st JOIN __route_order o ON st._route = o.route
         ORDER BY o.ord, st.trip_id, st._seq, st._line`,
      );
    }
    // Column indexes by (deduplicated) name, as routeStopTimes() reads them;
    // the last column is __rowid (scan) or __route_ord (sort).
    const names = result.deduplicatedColumnNames();
    const col = (name) => names.indexOf(name);
    const at = {
      line: col('_line'),
      stopKey: col('_stop_key'),
      route: col('_route'),
      seq: col('_seq'),
      tripId: col('trip_id'),
      last: names.length - 1,
      header: header.map(col),
    };
    let cols = null; // the current chunk's converted columns
    let ords = null; // its rows' route ord (-1: not delivered)
    let n = 0;
    let pos = 0;
    let done = false;
    let lastRowid = -1n;
    const fill = async () => {
      const chunk = await result.fetchChunk();
      pos = 0;
      if (!chunk || chunk.rowCount === 0) {
        done = true;
        cols = ords = null;
        n = 0;
        return;
      }
      const conv = (c) => (c < 0 ? null : chunk.convertColumnValues(c, JSDuckDBValueConverter));
      n = chunk.rowCount;
      cols = { line: conv(at.line), stopKey: conv(at.stopKey), header: at.header.map(conv) };
      if (scan) {
        // The scan must come in stored order, or routes would interleave.
        for (const rowid of conv(at.last)) {
          if (rowid <= lastRowid) throw new Error(`${side} stop_times stream: rows not in stored order`);
          lastRowid = rowid;
        }
        cols.seq = conv(at.seq);
        cols.tripId = conv(at.tripId);
        const route = conv(at.route);
        ords = new Array(n);
        let prev;
        let prevOrd = -1;
        for (let k = 0; k < n; k++) {
          if (k === 0 || route[k] !== prev) prevOrd = route[k] == null ? -1 : (ordOf.get((prev = route[k])) ?? -1);
          ords[k] = prevOrd;
        }
      } else {
        ords = conv(at.last);
      }
      // Values are copied out: let go of the chunk's native data now. The
      // chunk itself is only freed on a (rare, major) GC, and thousands of
      // unfreed chunks hold GBs on large feeds.
      chunk.reset();
    };
    let next = 0;
    return {
      async take(ord) {
        if (ord !== next++) throw new Error(`${side} stop_times stream: route ${ord} asked, ${next - 1} expected`);
        const out = [];
        const keys = []; // scan: [trip_id, _seq] per row, for ties
        for (;;) {
          if (pos >= n) {
            if (done) break;
            await fill();
            continue;
          }
          const o = ords[pos];
          if (o !== ord) {
            if (o === -1) {
              pos++;
              continue;
            }
            if (o < ord) throw new Error(`${side} stop_times stream: rows out of route order`);
            break;
          }
          const row = { _line: Number(cols.line?.[pos]), _stop_key: cols.stopKey?.[pos] == null ? '' : String(cols.stopKey[pos]) };
          for (let k = 0; k < header.length; k++) {
            const v = cols.header[k]?.[pos];
            row[header[k]] = v == null ? '' : String(v).trim();
          }
          out.push(row);
          if (scan) keys.push([cols.tripId?.[pos], cols.seq?.[pos]]);
          pos++;
        }
        // Stored order is (trip_id, _seq) only: runs tied on both, by _line.
        for (let i = 0; scan && i < out.length; ) {
          let j = i + 1;
          while (j < out.length && keys[j][0] === keys[i][0] && sameSeq(keys[j][1], keys[i][1])) j++;
          if (j - i > 1) out.slice(i, j).sort((a, b) => a._line - b._line).forEach((r, k) => (out[i + k] = r));
          i = j;
        }
        return out;
      },
      close: () => con.closeSync(),
    };
  } catch (e) {
    con.closeSync();
    throw e;
  }
}

export function groupByTrip(rows) {
  const out = new Map();
  for (const r of rows) {
    let list = out.get(r.trip_id);
    if (!list) out.set(r.trip_id, (list = []));
    list.push(r);
  }
  return out;
}

/**
 * Calls `fn` for every route of either feed (sorted), with each feed's
 * trips.txt rows and stop_times rows of that route. One route in memory at
 * a time: each feed's stop_times are one streamed query, read in step with
 * the routes (openRouteStopTimes).
 */
export async function forEachRoute(store, fn) {
  const tripsOf = (side) => {
    const out = new Map();
    for (const t of store[side].files.get('trips.txt')?.rows ?? []) {
      let list = out.get(t.route_id);
      if (!list) out.set(t.route_id, (list = []));
      list.push(t);
    }
    return out;
  };
  const trips = { base: tripsOf('base'), new: tripsOf('new') };
  const routes = [...new Set([...trips.base.keys(), ...trips.new.keys()])].sort();
  // Stream setup (order check, sort if needed) and every route's rows: one
  // total, comparable with the per-route queries it replaced.
  const label = 'routes loop: stop_times query (per route, both feeds)';
  const streams = {};
  try {
    for (const side of ['base', 'new']) streams[side] = await tally(label, () => openRouteStopTimes(store, side, routes));
    let i = 0;
    for (const route of routes) {
      const sides = {};
      for (const side of ['base', 'new']) {
        sides[side] = {
          trips: trips[side].get(route) ?? [],
          stopTimes: await tally(label, () => streams[side].take(i)),
        };
      }
      await fn(route, sides, i++, routes.length);
    }
  } finally {
    for (const s of Object.values(streams)) s.close();
  }
}

/** Compact trips of one route and feed, from forEachRoute's rows. */
export function routeCompactTrips(store, side, rows) {
  const feed = store[side];
  const ids = new Set(rows.trips.map((t) => t.trip_id));
  return compactTrips(
    rows.trips,
    groupByTrip(rows.stopTimes),
    feed.files.get('frequencies.txt')?.rows?.filter((f) => ids.has(f.trip_id)) ?? [],
    feed.files.get('stop_times.txt')?.header,
  );
}

/** Stops any trip visits, either feed (for the Trips view's names). */
export async function usedStops(store) {
  const parts = ['base', 'new']
    .map((side) => store[side].files.get('stop_times.txt')?.sql)
    .filter(Boolean)
    .map((t) => `SELECT DISTINCT _stop_key AS s FROM ${ident(t)}`);
  if (parts.length === 0) return new Set();
  return new Set((await store.all(parts.join(' UNION '))).map((r) => String(r.s)));
}

// ── Entry point ────────────────────────────────────────────────────

/**
 * Everything of the Trips payload except the trips themselves: route and
 * stop names, the services running on every date, day types. Trips are
 * written per route by the callers (forEachRoute + routeCompactTrips).
 */
export function buildTripsIndex(baseFeed, newFeed, used) {
  const services = (feed) => new Set((feed.files.get('trips.txt')?.rows ?? []).map((t) => t.service_id));
  const base = serviceSetsByDate(baseFeed, services(baseFeed));
  const next = serviceSetsByDate(newFeed, services(newFeed));
  // Trips running on each service set, for picking representative days.
  for (const [feed, sets] of [[baseFeed, base], [newFeed, next]]) {
    const perService = new Map();
    for (const t of feed.files.get('trips.txt')?.rows ?? []) perService.set(t.service_id, (perService.get(t.service_id) ?? 0) + 1);
    sets.setTrips = sets.sets.map((set) => set.reduce((n, sid) => n + (perService.get(sid) ?? 0), 0));
  }

  const all = [...new Set([...base.dateIdx.keys(), ...next.dateIdx.keys()])].sort();
  const dates = {};
  for (const d of all) dates[d] = [base.dateIdx.get(d) ?? -1, next.dateIdx.get(d) ?? -1];

  // Day types are inferred where both feeds publish service.
  const [bLo, bHi] = bounds(base.dateIdx.keys());
  const [nLo, nHi] = bounds(next.dateIdx.keys());
  const overlap = [bLo && nLo ? (bLo > nLo ? bLo : nLo) : null, bHi && nHi ? (bHi < nHi ? bHi : nHi) : null];

  return {
    routes: routeLookup(baseFeed, newFeed),
    stops: stopNames(baseFeed, newFeed, used),
    service_sets: { base: base.sets, new: next.sets },
    dates,
    day_types: inferDayTypes(dates, overlap, (d) => {
      const [b, n] = dates[d];
      return (b >= 0 ? base.setTrips[b] : 0) + (n >= 0 ? next.setTrips[n] : 0);
    }),
    feeds: { base: { trips: [] }, new: { trips: [] } },
  };
}
