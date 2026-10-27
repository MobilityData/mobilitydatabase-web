#!/usr/bin/env node
/**
 * trips-calendar.json of a diff folder: trips added / removed / modified on
 * every date, for the Trips v3 calendar and weekday table
 * (src/app/screens/GtfsDiffToolV2/lib/trips-calendar.ts).
 *
 * Each distinct comparison (a pair of service sets) is computed once with
 * the same matching as the Trips pages (lib/trips-utils.ts buildRouteDir),
 * one route at a time, so memory stays bounded on large feeds.
 *
 * Run after the trips step (it reads trips-diff.json and trips/*.parquet).
 *
 * Usage: node scripts/generate-gtfs-trips-calendar.mjs <dataset folder>
 */

import './lib/ts-resolve.mjs';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';

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
  const t0 = Date.now();
  const m = Object.assign({}, ...(await Promise.all([lib('trips-calendar.ts'), lib('trips-utils.ts')])));
  const indexPath = join(dir, 'trips-diff.json');
  if (!existsSync(indexPath)) throw new Error(`No trips-diff.json in ${dir}: run the trips step first.`);
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));

  const plan = m.planTripsCalendar(index);
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
      (await rows(`SELECT trip FROM t_${side} WHERE route = ${sqlString(route)} ORDER BY ord`)).map((r) =>
        JSON.parse(String(r.trip)),
      );
  } else {
    const bySide = {
      base: groupBy(index.feeds.base.trips, (t) => t.route),
      new: groupBy(index.feeds.new.trips, (t) => t.route),
    };
    routes = [...new Set([...bySide.base.keys(), ...bySide.new.keys()])].sort();
    routeTrips = async (side, route) => bySide[side].get(route) ?? [];
  }

  let done = 0;
  for (const route of routes) {
    const base = await routeTrips('base', route);
    const next = await routeTrips('new', route);
    for (const c of comparisons) {
      const b = base.filter((t) => c.baseServices.has(t.service));
      const n = next.filter((t) => c.newServices.has(t.service));
      if (b.length + n.length === 0) continue;
      const dirs = new Set([...b, ...n].map((t) => t.dir));
      for (const dirId of dirs) {
        const r = m.buildRouteDir(
          route,
          dirId,
          b.filter((t) => t.dir === dirId),
          n.filter((t) => t.dir === dirId),
          m.DEFAULT_MINOR_THRESHOLD_S,
        );
        m.addCounts(c.counts, m.changeCounts(r.class_counts, r.trips));
      }
    }
    done++;
    if (done % 500 === 0) console.log(`  ${done}/${routes.length} routes, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }

  const doc = {
    schema: 1,
    mode: plan.mode,
    first: plan.first,
    last: plan.last,
    days: plan.days,
    counts: comparisons.map((c) => c.counts),
    weekdays: m.typicalWeekdays(plan, comparisons.map((c) => c.counts)),
  };
  writeFileSync(join(dir, m.TRIPS_CALENDAR_FILE), JSON.stringify(doc));
  const changed = Object.values(doc.days).filter((d) => m.changedTrips(doc.counts[d.s]) > 0).length;
  console.log(
    `Wrote ${m.TRIPS_CALENDAR_FILE}: ${plan.mode}, ${Object.keys(doc.days).length} dates (${changed} with changes), ` +
      `${comparisons.length} distinct comparisons, ${routes.length} routes, ${((Date.now() - t0) / 1000).toFixed(1)} s`,
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
