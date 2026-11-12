/**
 * "What's changed" chips of the Trips v5 route page's summary
 * (/gtfs-diff-tool-v2/<dataset>/trips-v5/<route_id>): the day's counts
 * (dayChips) and the route's change categories, without saying a thing
 * twice. A count wins over the category it covers ("2 trips added" over
 * "Trips added", "3 stop pattern changes" over "Different stop pattern"); the routes-changed count is left out, a route page being
 * about one route.
 *
 * Pure; type-only imports besides the helpers.
 */

import {
  type DaySummary,
  type MainChangeCategory,
  type SummaryChip,
  dayChips,
} from './trips-v2-summary';

/** Whether the day's counts already say a category. */
function covered(c: MainChangeCategory, s: DaySummary): boolean {
  switch (c) {
    case 'trips_added':
      return s.added > 0;
    case 'trips_removed':
      return s.removed > 0;
    case 'shifted':
    case 'running_time':
      return s.retimedRoutes > 0;
    case 'id_only':
      return s.idOnly > 0;
    case 'rerouted':
      return s.patternChanges > 0;
    default:
      return false;
  }
}

export function routeChangeChips(
  s: DaySummary,
  categories: MainChangeCategory[],
): { counts: SummaryChip[]; categories: MainChangeCategory[] } {
  return {
    // The first chip is "<changed> of <total> routes changed".
    counts: dayChips(s).slice(1),
    categories: categories.filter((c) => !covered(c, s)),
  };
}
