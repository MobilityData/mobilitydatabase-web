import type { RouteInfo } from './entity-diff-types';
import type { DayRoutesRow, RouteTotal } from './trips-day-routes';
import {
  filterRouteList,
  routeCategoryCounts,
  routeListRows,
} from './trips-v6-routes';

function total(route: string, over: Partial<RouteTotal> = {}): RouteTotal {
  return {
    route,
    changed: 1,
    added: 1,
    removed: 0,
    modified: 0,
    days: 1,
    serviceDays: 1,
    categories: [],
    ...over,
  };
}

const INFO = {
  A: { short_name: '1', long_name: 'Harvard - Dudley' },
} as unknown as Record<string, RouteInfo>;

const ROWS = [
  { route: 'A', headsign: 'Nubian' },
  { route: 'B', headsign: null },
] as DayRoutesRow[];

describe('route list', () => {
  const rows = routeListRows(
    [
      total('A', { categories: ['new_stop', 'shifted'] }),
      total('B', { categories: ['shifted'] }),
    ],
    INFO,
    ROWS,
  );

  it('searches route ids, names and headsigns', () => {
    const search = (q: string): string[] =>
      filterRouteList(rows, { categories: [], search: q }).map((r) => r.route);
    expect(search('harvard')).toEqual(['A']);
    expect(search('nubian')).toEqual(['A']);
    expect(search('1 dudley')).toEqual(['A']);
    expect(search('')).toEqual(['A', 'B']);
  });

  it('filters and counts by category', () => {
    expect(
      filterRouteList(rows, { categories: ['new_stop'], search: '' }).map(
        (r) => r.route,
      ),
    ).toEqual(['A']);
    expect(routeCategoryCounts(rows)).toEqual([
      { category: 'new_stop', count: 1 },
      { category: 'shifted', count: 2 },
    ]);
  });
});
