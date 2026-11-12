#!/usr/bin/env node
/**
 * trips-calendar.json of a diff folder: trips added / removed / modified on
 * every date, for the Trips v3 calendar and weekday table
 * (src/app/screens/GtfsDiffToolV2/lib/trips-calendar.ts).
 *
 * Each distinct comparison (a pair of service sets) is computed once with
 * the same matching as the Trips pages (lib/trips-utils.ts computeDayDiff:
 * stops that only got a new stop_id aliased, then buildRouteDir), one route
 * at a time, so memory stays bounded on large feeds.
 *
 * Also writes trips-service.json: each route's service on the typical days
 * and on the day with the most trips added, which the highlights step turns
 * into highlights (lib/trips-service-highlights.ts). Build-only: the pages
 * don't load it.
 *
 * Run after the trips step (it reads trips-diff.json and trips/*.parquet).
 *
 * Usage: node scripts/generate-gtfs-trips-calendar.mjs <dataset folder>
 */

import './lib/ts-resolve.mjs';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { flushTallies, markStartup, tally, timed, timer } from './lib/timings.mjs';

const LIB = new URL('../src/app/screens/GtfsDiffToolV2/lib/', import.meta.url);
const lib = (file) => import(new URL(file, LIB).href);

function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function groupBy(list, key) {
  const out = new Map();
  for (const x of list) {
    const k = key(x);
    let g = out.get(k);
    if (!g) out.set(k, (g = []));
    g.push(x);
  }
  return out;
}

async function main() {
  const dir = process.argv[2] ? resolve(process.argv[2]) : null;
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error('Usage: node scripts/generate-gtfs-trips-calendar.mjs <dataset folder>');
    process.exit(1);
  }
  markStartup();
  const t0 = Date.now();
  const m = Object.assign(
    {},
    ...(await timed('import TS libs', () =>
      Promise.all([
        lib('trips-calendar.ts'),
        lib('trips-utils.ts'),
        lib('trips-periods.ts'),
        lib('trips-service-highlights.ts'),
        lib('trips-index-codec.ts'),
      ]),
    )),
  );
  const indexPath = join(dir, 'trips-diff.json');
  if (!existsSync(indexPath)) throw new Error(`No trips-diff.json in ${dir}: run the trips step first.`);
  const index = timed('read trips-diff.json (+ expandServiceSets)', () => m.expandServiceSets(JSON.parse(readFileSync(indexPath, 'utf8'))));

  const plan = timed('planTripsCalendar', () => m.planTripsCalendar(index));
  if (!plan) {
    console.log('No date with service: no trips-calendar.json.');
    return;
  }
  const services = (side, set) => new Set(set >= 0 ? index.service_sets[side][set] : []);
  const comparisons = plan.comparisons.map((c) => ({
    ...c,
    baseServices: services('base', c.base),
    newServices: services('new', c.new),
    counts: m.emptyCounts(),
  }));

  // Trips per route, from the Parquet tables or the index itself (small feeds).
  const endOpen = timer('open trip tables + route list');
  const tables = index.trip_tables;
  let routes;
  let routeTrips;
  if (tables) {
    const instance = await DuckDBInstance.create(':memory:');
    const con = await instance.connect();
    const rows = async (sql) => (await con.runAndReadAll(sql)).getRowObjectsJS();
    for (const side of ['base', 'new'])
      await con.run(`CREATE VIEW t_${side} AS SELECT * FROM read_parquet(${sqlString(join(dir, tables[side]))})`);
    routes = (
      await rows(`SELECT DISTINCT route FROM (SELECT route FROM t_base UNION ALL SELECT route FROM t_new) ORDER BY route`)
    ).map((r) => String(r.route));
    routeTrips = async (side, route) =>
      tally(`read route trips (SQL + JSON.parse), pass ${pass}`, async () =>
        (await rows(`SELECT trip FROM t_${side} WHERE route = ${sqlString(route)} ORDER BY ord`)).map((r) =>
          JSON.parse(String(r.trip)),
        ),
      );
  } else {
    const bySide = {
      base: groupBy(index.feeds.base.trips, (t) => t.route),
      new: groupBy(index.feeds.new.trips, (t) => t.route),
    };
    routes = [...new Set([...bySide.base.keys(), ...bySide.new.keys()])].sort();
    routeTrips = async (side, route) => bySide[side].get(route) ?? [];
  }

  endOpen({ rows: routes.length });
  // Which loop reads route trips (the stop sets pass, then the matching pass).
  let pass = 1;

  // Stops each comparison serves, for the stop_id aliases of its day (as
  // computeDayDiff does on the pages) and the stops left without service.
  const endStopSets = timer('stop sets per comparison (route loop): total');
  for (const c of comparisons) {
    c.baseStops = new Set();
    c.newStops = new Set();
  }
  for (const route of routes) {
    const base = await routeTrips('base', route);
    const next = await routeTrips('new', route);
    tally('stop sets: add stops of each comparison', () => {
      for (const c of comparisons) {
        for (const t of base) if (c.baseServices.has(t.service)) for (const st of t.stops) c.baseStops.add(st);
        for (const t of next) if (c.newServices.has(t.service)) for (const st of t.stops) c.newStops.add(st);
      }
    });
  }
  flushTallies();
  endStopSets({ rows: comparisons.length });
  const stopName = (id) => index.stops?.[id];
  const endAliases = timer('stop aliases (stopAliases per comparison)');
  for (const c of comparisons) {
    c.aliases = m.stopAliases(c.baseStops, c.newStops, stopName);
    c.routes = [];
  }
  endAliases({ rows: comparisons.length });
  pass = 2;

  const routeLabel = (id) => index.routes?.[id]?.short_name || id;
  let done = 0;
  const endMatch = timer('matching loop (routes x comparisons): total');
  for (const route of routes) {
    const base = await routeTrips('base', route);
    const next = await routeTrips('new', route);
    for (const c of comparisons) {
      const b = tally('matching: filter + aliasStops', () =>
        m.aliasStops(
          base.filter((t) => c.baseServices.has(t.service)),
          c.aliases,
        ),
      );
      const n = next.filter((t) => c.newServices.has(t.service));
      if (b.length + n.length === 0) continue;
      const svc = {
        route,
        label: routeLabel(route),
        trips: { base: 0, new: 0 },
        added: 0,
        removed: 0,
        span: { base: null, new: null },
        profile: { base: new Array(m.PROFILE_HOURS).fill(0), new: new Array(m.PROFILE_HOURS).fill(0) },
      };
      const dirs = new Set([...b, ...n].map((t) => t.dir));
      for (const dirId of dirs) {
        const r = tally('matching: buildRouteDir', () =>
          m.buildRouteDir(
            route,
            dirId,
            b.filter((t) => t.dir === dirId),
            n.filter((t) => t.dir === dirId),
            m.DEFAULT_MINOR_THRESHOLD_S,
          ),
        );
        m.addCounts(c.counts, m.changeCounts(r.class_counts, r.trips));
        svc.trips.base += r.trips.base;
        svc.trips.new += r.trips.new;
        svc.added += r.class_counts.added;
        svc.removed += r.class_counts.removed;
        for (const side of ['base', 'new']) {
          const sp = r.span[side];
          if (sp)
            svc.span[side] = svc.span[side]
              ? [Math.min(svc.span[side][0], sp[0]), Math.max(svc.span[side][1], sp[1])]
              : [sp[0], sp[1]];
          r.profile[side].forEach((v, h) => (svc.profile[side][h] += v));
        }
      }
      c.routes.push(svc);
    }
    done++;
    if (done % 500 === 0) console.log(`  ${done}/${routes.length} routes, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }

  flushTallies();
  endMatch({ rows: routes.length * comparisons.length });

  const endDoc = timer(`write ${m.TRIPS_CALENDAR_FILE} (doc + typicalWeekdays + write)`);
  const doc = {
    schema: 1,
    mode: plan.mode,
    first: plan.first,
    last: plan.last,
    days: plan.days,
    counts: comparisons.map((c) => c.counts),
    sets: comparisons.map((c) => [c.base, c.new]),
    weekdays: m.typicalWeekdays(plan, comparisons.map((c) => c.counts)),
  };
  writeFileSync(join(dir, m.TRIPS_CALENDAR_FILE), JSON.stringify(doc));
  endDoc(() => ({ bytes: statSync(join(dir, m.TRIPS_CALENDAR_FILE)).size }));
  const endService = timer(`write ${m.TRIPS_SERVICE_FILE} (periods + unserved stops + write)`);

  // Service of the typical days, and of the day with the most trips added.
  const periods = m.servicePeriods(doc);
  const phraseOf = new Map();
  for (const p of periods) if (!phraseOf.has(p.s)) phraseOf.set(p.s, m.periodPhrase(p));
  const typical = new Set(periods.filter((p) => p.typical).map((p) => p.s));
  const net = (c) => c.counts.new - c.counts.base;
  let mostAdded = -1;
  comparisons.forEach((c, s) => {
    if (net(c) > 0 && (mostAdded < 0 || net(c) > net(comparisons[mostAdded]))) mostAdded = s;
  });
  const service = {
    schema: 1,
    days: comparisons
      .map((c, s) => ({ c, s }))
      .filter(({ s }) => typical.has(s) || s === mostAdded)
      .map(({ c, s }) => ({
        s,
        when: phraseOf.get(s) ?? '',
        typical: typical.has(s),
        routes: c.routes,
        unserved: [...c.baseStops]
          .filter((id) => !c.newStops.has(id) && !c.aliases.has(id))
          .sort()
          .map((id) => ({ id, label: stopName(id) ?? id })),
      })),
  };
  writeFileSync(join(dir, m.TRIPS_SERVICE_FILE), JSON.stringify(service));
  endService(() => ({ bytes: statSync(join(dir, m.TRIPS_SERVICE_FILE)).size }));
  const changed = Object.values(doc.days).filter((d) => m.changedTrips(doc.counts[d.s]) > 0).length;
  console.log(
    `Wrote ${m.TRIPS_CALENDAR_FILE}: ${plan.mode}, ${Object.keys(doc.days).length} dates (${changed} with changes), ` +
      `${comparisons.length} distinct comparisons, ${routes.length} routes, ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
  console.log(
    `Wrote ${m.TRIPS_SERVICE_FILE}: ${service.days.map((d) => `${d.when}${d.typical ? '' : ' (most added)'}`).join(', ') || 'no day'}`,
  );
  const NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  for (const w of doc.weekdays) {
    const c = doc.counts[w.s];
    console.log(
      `  ${NAMES[w.weekday]} ${w.key}: +${c.added} −${c.removed} ~${c.modified} (id only ${c.id_only}), ${w.busiest ? 'busiest' : `${w.days}/${w.of} days`}`,
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
