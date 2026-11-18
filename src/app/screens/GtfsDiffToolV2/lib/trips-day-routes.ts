/**
 * Trip changes of every calendar comparison by route and direction:
 * views/trips/day-routes.parquet (lib/diff-layout TRIPS_DAY_ROUTES_FILE),
 * written by scripts/generate-gtfs-trips-calendar.mjs next to
 * views/trips/calendar.json from the same matching (buildRouteDir), so the
 * pages get a route's changes on any date without loading a day of trips.
 *
 * One row per comparison (`s`, the calendar's days[date].s) x route x
 * direction running that comparison in either feed, sorted by s, route, dir.
 *
 * Trips v6 (/gtfs-diff-tool-v2/<dataset>/trips-v6) ranks routes by their
 * trip changes over every compared date (routeTotals) and draws one route's
 * calendar (routeCalendar).
 *
 * Pure; the Node build imports it for the columns.
 */

import {
  type TripChangeCounts,
  type TripsCalendarDoc,
  addCounts,
  changedTrips,
  emptyCounts,
} from './trips-calendar';
import {
  MAIN_CHANGE_CATEGORIES,
  type MainChangeCategory,
} from './trips-v2-summary';

/** DuckDB column name and type, in table order. */
export const DAY_ROUTES_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['s', 'INTEGER'],
  ['route', 'VARCHAR'],
  ['dir', 'VARCHAR'],
  ['headsign', 'VARCHAR'],
  // lib/trips-calendar changeCounts
  ['added', 'INTEGER'],
  ['removed', 'INTEGER'],
  ['modified', 'INTEGER'],
  ['id_only', 'INTEGER'],
  ['base', 'INTEGER'],
  ['new', 'INTEGER'],
  // Main-change categories, bit i = MAIN_CHANGE_CATEGORIES[i]
  ['mask', 'INTEGER'],
  // Rider-facing changes (lib/trips-v2-summary routeHasRiderChanges)
  ['changed', 'BOOLEAN'],
];

export interface DayRoutesRow extends TripChangeCounts {
  s: number;
  route: string;
  dir: string;
  headsign: string | null;
  mask: number;
  changed: boolean;
}

/** A row read back from DuckDB (numbers may come as bigint or null). */
export function toDayRoutesRow(r: Record<string, unknown>): DayRoutesRow {
  const n = (v: unknown): number => Number(v ?? 0);
  const str = (v: unknown): string | null =>
    typeof v === 'string' ? v : v == null ? null : String(v as number);
  return {
    s: n(r.s),
    route: str(r.route) ?? '',
    dir: str(r.dir) ?? '',
    headsign: str(r.headsign),
    added: n(r.added),
    removed: n(r.removed),
    modified: n(r.modified),
    id_only: n(r.id_only),
    base: n(r.base),
    new: n(r.new),
    mask: n(r.mask),
    changed: r.changed === true,
  };
}

export function categoryMask(categories: MainChangeCategory[]): number {
  let mask = 0;
  for (const c of categories) {
    const i = MAIN_CHANGE_CATEGORIES.indexOf(c);
    if (i >= 0) mask |= 1 << i;
  }
  return mask;
}

/** A mask's categories, in MAIN_CHANGE_CATEGORIES order. */
export function maskCategories(mask: number): MainChangeCategory[] {
  return MAIN_CHANGE_CATEGORIES.filter((_, i) => (mask & (1 << i)) !== 0);
}

/** Compared dates of each comparison. */
function datesPerComparison(calendar: TripsCalendarDoc): Map<number, number> {
  const out = new Map<number, number>();
  for (const { s } of Object.values(calendar.days))
    out.set(s, (out.get(s) ?? 0) + 1);
  return out;
}

export interface RouteTotal {
  route: string;
  /** Trips added + removed + modified, summed over every compared date. */
  changed: number;
  added: number;
  removed: number;
  modified: number;
  /** Compared dates with at least one trip changed on the route. */
  days: number;
  /** Compared dates the route runs on in either feed. */
  serviceDays: number;
  /** Main-change categories of any date. */
  categories: MainChangeCategory[];
}

/**
 * Every route's trip changes over the whole calendar (each comparison
 * counted once per date it stands for): most changed first, then by id.
 */
export function routeTotals(
  rows: DayRoutesRow[],
  calendar: TripsCalendarDoc,
): RouteTotal[] {
  const dates = datesPerComparison(calendar);
  // route -> s -> counts over its directions, and the categories' mask.
  const perRoute = new Map<
    string,
    { byS: Map<number, TripChangeCounts>; mask: number }
  >();
  for (const r of rows) {
    if (!dates.has(r.s)) continue;
    let e = perRoute.get(r.route);
    if (e == null) perRoute.set(r.route, (e = { byS: new Map(), mask: 0 }));
    let c = e.byS.get(r.s);
    if (c == null) e.byS.set(r.s, (c = emptyCounts()));
    addCounts(c, r);
    e.mask |= r.mask;
  }
  const out: RouteTotal[] = [];
  for (const [route, { byS, mask }] of perRoute) {
    const t: RouteTotal = {
      route,
      changed: 0,
      added: 0,
      removed: 0,
      modified: 0,
      days: 0,
      serviceDays: 0,
      categories: maskCategories(mask),
    };
    for (const [s, c] of byS) {
      const k = dates.get(s) ?? 0;
      t.added += c.added * k;
      t.removed += c.removed * k;
      t.modified += c.modified * k;
      if (changedTrips(c) > 0) t.days += k;
      if (c.base + c.new > 0) t.serviceDays += k;
    }
    t.changed = t.added + t.removed + t.modified;
    out.push(t);
  }
  return out.sort(
    (a, b) =>
      b.changed - a.changed ||
      a.route.localeCompare(b.route, undefined, { numeric: true }),
  );
}

/**
 * The calendar as one route sees it: the same dates and comparisons, each
 * comparison's counts being the route's (zero where it doesn't run).
 */
export function routeCalendar(
  rows: DayRoutesRow[],
  calendar: TripsCalendarDoc,
  routeId: string,
): TripsCalendarDoc {
  const counts = calendar.counts.map(() => emptyCounts());
  for (const r of rows)
    if (r.route === routeId && counts[r.s] != null) addCounts(counts[r.s], r);
  return { ...calendar, counts };
}
