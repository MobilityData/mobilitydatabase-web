/**
 * Filters for the Trips v5 day popup (DayTripsDialog with `categorized`):
 * each route + direction row carries its main-change categories, and the
 * popup narrows rows by those categories and a free-text search.
 */

import type { RouteInfo } from './entity-diff-types';
import type { RouteDirDiff } from './trips-types';
import {
  MAIN_CHANGE_CATEGORIES,
  type MainChangeCategory,
  type MainChangePart,
  mainChangeCategories,
  mainChangeParts,
  routeHasRiderChanges,
} from './trips-v2-summary';

export interface DayRouteRow {
  r: RouteDirDiff;
  parts: MainChangePart[];
  categories: MainChangeCategory[];
  /** Has a rider-facing change (routeHasRiderChanges). */
  changed: boolean;
  /** Lower-cased route names, headsign and main-change text, for search. */
  haystack: string;
}

export interface DayRouteFilters {
  /** Any of these categories (OR); empty = no category filter. */
  categories: MainChangeCategory[];
  search: string;
}

export const NO_DAY_FILTERS: DayRouteFilters = { categories: [], search: '' };

export function dayRouteRows(
  routes: RouteDirDiff[],
  routeInfo: Record<string, RouteInfo>,
  stopNames: Record<string, string>,
): DayRouteRow[] {
  return routes.map((r) => {
    const parts = mainChangeParts(r, stopNames);
    const info = routeInfo[r.route];
    return {
      r,
      parts,
      categories: mainChangeCategories(parts),
      changed: routeHasRiderChanges(r),
      haystack: [
        r.route,
        info?.short_name,
        info?.long_name,
        r.headsign,
        ...parts.map((p) => p.text),
      ]
        .filter(Boolean)
        .join('\n')
        .toLowerCase(),
    };
  });
}

/** Rows per category, only categories that occur, in display order. */
export function dayCategoryCounts(
  rows: DayRouteRow[],
): Array<{ category: MainChangeCategory; count: number }> {
  const counts = new Map<MainChangeCategory, number>();
  for (const row of rows)
    for (const c of row.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  return MAIN_CHANGE_CATEGORIES.filter((c) => counts.has(c)).map((c) => ({
    category: c,
    count: counts.get(c) as number,
  }));
}

export function isFiltering(f: DayRouteFilters): boolean {
  return f.categories.length > 0 || f.search.trim() !== '';
}

/** Rows matching any selected category and every word of the search. */
export function filterDayRoutes(
  rows: DayRouteRow[],
  f: DayRouteFilters,
): DayRouteRow[] {
  const words = f.search.toLowerCase().split(/\s+/).filter(Boolean);
  const wanted = new Set(f.categories);
  return rows.filter(
    (row) =>
      (wanted.size === 0 || row.categories.some((c) => wanted.has(c))) &&
      words.every((w) => row.haystack.includes(w)),
  );
}
