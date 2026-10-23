/**
 * Which new trip_id is the same trip as which base trip_id.
 *
 * Schedulers renumber trips on every export (MBTA 76509921 -> 77745105, STM
 * 292460641 -> 299970318): there is no rule to undo, so trips are paired
 * semantically, with the matcher the Trips view runs in the browser
 * (src/app/screens/GtfsDiffToolV2/lib/trips-utils.ts: stop pattern and
 * departure time, optimal assignment).
 *
 * Feeds often cover different periods (a summer feed against a fall feed),
 * so trips are not compared date by date. Each trip gets the weekdays its
 * service runs on in its own feed (Mon–Fri, Sat, Fri only, …), and trips are
 * matched within route + direction + those weekdays. A second pass matches
 * the leftovers within route + direction alone, for services that were
 * split or merged (Mon–Sat becoming Mon–Fri + Sat).
 */

import { matchRouteDirection } from '../../src/app/screens/GtfsDiffToolV2/lib/trips-utils.ts';

/** 0 = Monday … 6 = Sunday */
function weekday(d) {
  return (new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))).getUTCDay() + 6) % 7;
}

/** service_id -> "1111100"-style weekday mask, per side. */
function serviceWeekdays(doc, side) {
  const i = side === 'base' ? 0 : 1;
  const days = new Map(); // service -> Set(weekday)
  for (const [d, idx] of Object.entries(doc.dates)) {
    const set = idx[i];
    if (set < 0) continue;
    const wd = weekday(d);
    for (const s of doc.service_sets[side][set]) {
      let w = days.get(s);
      if (!w) days.set(s, (w = new Set()));
      w.add(wd);
    }
  }
  const out = new Map();
  for (const [s, w] of days) out.set(s, [0, 1, 2, 3, 4, 5, 6].map((d) => (w.has(d) ? '1' : '0')).join(''));
  return out;
}

function groupTrips(trips, keyOf) {
  const out = new Map();
  for (const t of trips) {
    const k = keyOf(t);
    let list = out.get(k);
    if (!list) out.set(k, (list = []));
    list.push(t);
  }
  return out;
}

/** Weekday masks of every service, per feed, from the Trips index (buildTripsIndex). */
export function serviceMasks(index) {
  return { base: serviceWeekdays(index, 'base'), new: serviceWeekdays(index, 'new') };
}

export const MAPPING_PASSES = ['route, direction and weekdays', 'route and direction'];

/**
 * Pairs base and new trips (CompactTrip[]), one-to-one. Matching never
 * crosses routes, so callers pass one route's trips at a time.
 * @returns {{ map: Map<string, string>, perPass: number[] }}
 */
export function mapTrips(baseTrips, newTrips, masks) {
  const map = new Map();
  const taken = new Set();
  const keyFns = [
    (side) => (t) => `${t.route}\u001f${t.dir}\u001f${masks[side].get(t.service) ?? ''}`,
    () => (t) => `${t.route}\u001f${t.dir}`,
  ];
  const perPass = [];
  for (const keyFor of keyFns) {
    const base = groupTrips(baseTrips.filter((t) => !map.has(t.id)), keyFor('base'));
    const next = groupTrips(newTrips.filter((t) => !taken.has(t.id)), keyFor('new'));
    let n = 0;
    for (const [k, bl] of base) {
      const nl = next.get(k);
      if (!nl) continue;
      for (const p of matchRouteDirection(bl, nl)) {
        if (!p.base || !p.new || map.has(p.base.id) || taken.has(p.new.id)) continue;
        map.set(p.base.id, p.new.id);
        taken.add(p.new.id);
        n++;
      }
    }
    perPass.push(n);
  }
  return { map, perPass };
}
