#!/usr/bin/env node
/**
 * Generate the day-anchored Trips payload (v2 POC) from two GTFS feeds.
 *
 * Only the files the Trips view needs are read (trips, stop_times,
 * frequencies, calendar, routes, stops, and id_mappings when a feed renames
 * stops per trip), into DuckDB (lib/feed-store.mjs). <out.json> is a small
 * day index; each feed's trips go to trips/<side>.parquet next to it, a
 * route at a time, sorted by service so the Trips view reads only the
 * services running on the selected day (lib/write-trips-diff.mjs).
 *
 * Usage:
 *   node scripts/generate-gtfs-trips-diff.mjs <base.zip> <new.zip> <out.json>
 */

import { openFeedStore, SIDES } from './lib/feed-store.mjs';
import { buildTripsIndex, forEachRoute, routeCompactTrips, usedStops } from './lib/gtfs-trips-diff.mjs';
import { describeWrite, openTripsWriter } from './lib/write-trips-diff.mjs';
import { flushTallies, markStartup, tally, timed, timer } from './lib/timings.mjs';

const SCHEMA_VERSION = '2.1.0-poc-trips';
const FILES = new Set([
  'trips.txt',
  'stop_times.txt',
  'frequencies.txt',
  'calendar.txt',
  'calendar_dates.txt',
  'routes.txt',
  'stops.txt',
]);
/**
 * Above this many trips on one day (either feed), the browser can't load a
 * whole day: trips are sorted by route and read one route at a time.
 */
const BY_ROUTE_DAY_TRIPS = 50000;

/** Most trips running on any one date, per feed. */
function busiestDay(index, feeds) {
  const out = {};
  for (const [i, side] of SIDES.entries()) {
    const perService = new Map();
    for (const t of feeds[side].files.get('trips.txt')?.rows ?? []) {
      perService.set(t.service_id, (perService.get(t.service_id) ?? 0) + 1);
    }
    const perSet = index.service_sets[side].map((set) => set.reduce((n, s) => n + (perService.get(s) ?? 0), 0));
    let best = { date: null, trips: 0 };
    for (const [date, idx] of Object.entries(index.dates)) {
      const n = idx[i] >= 0 ? perSet[idx[i]] : 0;
      if (n > best.trips) best = { date, trips: n };
    }
    out[side] = best;
  }
  return out;
}

/** route_id -> service_id -> trips, per feed: the by-route view's route list. */
function routeServiceTrips(feeds) {
  const out = {};
  for (const side of SIDES) {
    const routes = {};
    for (const t of feeds[side].files.get('trips.txt')?.rows ?? []) {
      const perService = (routes[t.route_id] ??= {});
      perService[t.service_id] = (perService[t.service_id] ?? 0) + 1;
    }
    out[side] = routes;
  }
  return out;
}

async function main() {
  const [basePath, newPath, outPath] = process.argv.slice(2);
  if (!basePath || !newPath || !outPath) {
    console.error('Usage: node scripts/generate-gtfs-trips-diff.mjs <base.zip> <new.zip> <out.json>');
    process.exit(1);
  }
  markStartup();
  const store = await timed('feed store: open (total)', () => openFeedStore({ basePath, newPath, files: FILES }));
  try {
    const used = await timed('used stops (SQL)', () => usedStops(store), (u) => ({ rows: u.size }));
    const index = timed('index: buildTripsIndex', () => buildTripsIndex(store.base, store.new, used));
    const busiest = timed('index: busiest day', () => busiestDay(index, store));
    const byRoute = SIDES.some((side) => busiest[side].trips > BY_ROUTE_DAY_TRIPS);
    console.log(
      `Busiest day: base ${busiest.base.trips} trips (${busiest.base.date}), new ${busiest.new.trips} trips (${busiest.new.date})` +
        (byRoute ? `; over ${BY_ROUTE_DAY_TRIPS}, so trips are sorted by route` : ''),
    );

    const writer = await openTripsWriter(outPath);
    let written;
    try {
      const t0 = Date.now();
      // Per-route parts, summed (flushTallies() below).
      const endLoop = timer('routes loop (compact trips + append): total');
      await forEachRoute(store, async (route, sides, i, total) => {
        for (const side of SIDES) {
          const trips = tally('routes loop: compact trips (routeCompactTrips)', () => routeCompactTrips(store, side, sides[side]));
          tally('routes loop: append to trips writer', () => writer.append(side, trips));
        }
        if ((i + 1) % 200 === 0 || i + 1 === total) {
          console.log(`  ${i + 1}/${total} routes, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
        }
      });
      endLoop();
      flushTallies();
      const doc = {
        metadata: {
          schema_version: SCHEMA_VERSION,
          generated_at: new Date().toISOString(),
          base_feed: { source: store.base.source },
          new_feed: { source: store.new.source },
        },
        ...index,
        ...(byRoute ? { route_service_trips: routeServiceTrips(store) } : {}),
      };
      written = await timed('trips writer: finish (total)', () => writer.finish(doc, { byRoute }));
    } catch (e) {
      writer.abort();
      throw e;
    }
    console.log(describeWrite(outPath, written));
    console.log(`  service sets: base ${index.service_sets.base.length}, new ${index.service_sets.new.length}`);
    for (const d of index.day_types) {
      console.log(`  ${d.primary ? '*' : ' '} ${d.label.padEnd(9)} ${d.date}  ${d.day_count}/${d.group_count} days  (${d.first}–${d.last})`);
    }
  } finally {
    timed('feed store: close', () => store.close());
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
