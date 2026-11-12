import type { RouteDirDiff } from './trips-types';
import type { MainChangeCategory } from './trips-v2-summary';
import {
  type DayRouteRow,
  NO_DAY_FILTERS,
  dayCategoryCounts,
  filterDayRoutes,
  isFiltering,
} from './trips-v5-day-filter';

function row(
  key: string,
  categories: MainChangeCategory[],
  haystack: string,
): DayRouteRow {
  return {
    r: { key } as RouteDirDiff,
    parts: [],
    categories,
    changed: !categories.includes('minor'),
    haystack: haystack.toLowerCase(),
  };
}

const ROWS = [
  row(
    '1',
    ['new_stop', 'shifted'],
    'Red Line\nNew stop Symphony on every trip',
  ),
  row('2', ['trips_removed'], 'Green Line\nFirst trip removed'),
  row('3', ['new_stop'], 'Route 39\nNew stop Back Bay on 2 trips'),
  row('4', ['minor'], 'Route 1\nMinor time changes only'),
];

const keys = (rows: DayRouteRow[]): string[] => rows.map((x) => x.r.key);

describe('day route filters', () => {
  it('counts rows per category in display order', () => {
    expect(dayCategoryCounts(ROWS)).toEqual([
      { category: 'new_stop', count: 2 },
      { category: 'trips_removed', count: 1 },
      { category: 'shifted', count: 1 },
      { category: 'minor', count: 1 },
    ]);
  });

  it('keeps every row without filters', () => {
    expect(isFiltering(NO_DAY_FILTERS)).toBe(false);
    expect(keys(filterDayRoutes(ROWS, NO_DAY_FILTERS))).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
  });

  it('matches any selected category', () => {
    expect(
      keys(
        filterDayRoutes(ROWS, {
          categories: ['trips_removed', 'shifted'],
          search: '',
        }),
      ),
    ).toEqual(['1', '2']);
  });

  it('matches every search word, case-insensitively, across names and text', () => {
    expect(
      keys(filterDayRoutes(ROWS, { categories: [], search: 'symphony' })),
    ).toEqual(['1']);
    expect(
      keys(filterDayRoutes(ROWS, { categories: [], search: 'new  BAY' })),
    ).toEqual(['3']);
    expect(isFiltering({ categories: [], search: '  ' })).toBe(false);
  });

  it('combines categories and search', () => {
    expect(
      keys(filterDayRoutes(ROWS, { categories: ['new_stop'], search: 'line' })),
    ).toEqual(['1']);
  });
});
