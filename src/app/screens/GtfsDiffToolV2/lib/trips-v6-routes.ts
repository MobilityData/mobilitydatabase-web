/**
 * The Trips v6 route list (/gtfs-diff-tool-v2/<dataset>/trips-v6): every
 * route with its trip changes over the whole calendar (lib/trips-day-routes
 * routeTotals), searchable and filtered by main-change category like the
 * Trips v5 day popup (lib/trips-v5-day-filter).
 *
 * Pure; type-only imports besides the category order.
 */

import type { RouteInfo } from './entity-diff-types';
import type { DayRoutesRow, RouteTotal } from './trips-day-routes';
import type { DayRouteFilters } from './trips-v5-day-filter';
import {
  MAIN_CHANGE_CATEGORIES,
  type MainChangeCategory,
} from './trips-v2-summary';

export interface RouteListRow extends RouteTotal {
  /** Lower-cased route id, names and headsigns, for search. */
  haystack: string;
}

export function routeListRows(
  totals: RouteTotal[],
  routeInfo: Record<string, RouteInfo>,
  rows: DayRoutesRow[],
): RouteListRow[] {
  const headsigns = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.headsign) continue;
    let set = headsigns.get(r.route);
    if (set == null) headsigns.set(r.route, (set = new Set()));
    set.add(r.headsign);
  }
  return totals.map((t) => {
    const info = routeInfo[t.route];
    return {
      ...t,
      haystack: [
        t.route,
        info?.short_name,
        info?.long_name,
        ...(headsigns.get(t.route) ?? []),
      ]
        .filter(Boolean)
        .join('\n')
        .toLowerCase(),
    };
  });
}

/** Routes per category, only categories that occur, in display order. */
export function routeCategoryCounts(
  rows: RouteListRow[],
): Array<{ category: MainChangeCategory; count: number }> {
  const counts = new Map<MainChangeCategory, number>();
  for (const row of rows)
    for (const c of row.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  return MAIN_CHANGE_CATEGORIES.filter((c) => counts.has(c)).map((c) => ({
    category: c,
    count: counts.get(c) as number,
  }));
}

/** Routes with any selected category and every word of the search. */
export function filterRouteList(
  rows: RouteListRow[],
  f: DayRouteFilters,
): RouteListRow[] {
  const words = f.search.toLowerCase().split(/\s+/).filter(Boolean);
  const wanted = new Set(f.categories);
  return rows.filter(
    (row) =>
      (wanted.size === 0 || row.categories.some((c) => wanted.has(c))) &&
      words.every((w) => row.haystack.includes(w)),
  );
}
