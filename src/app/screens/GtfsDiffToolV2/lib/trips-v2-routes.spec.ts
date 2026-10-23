import type { RouteInfo } from './entity-diff-types';
import type { DayDiff, RouteDirDiff, RouteVerdict } from './trips-types';
import {
  defaultDirection,
  filterRouteRows,
  parseRouteFilters,
  scopeDayToRoute,
  tripsListHref,
  tripsRouteHref,
  verdictCounts,
  writeRouteFilters,
} from './trips-v2-routes';

function row(
  route: string,
  dir: string,
  verdicts: RouteVerdict[],
  over: Partial<RouteDirDiff> = {},
): RouteDirDiff {
  return {
    key: `${route}|${dir}`,
    route,
    dir,
    headsign: '',
    trips: { base: 10, new: 10 },
    verdicts,
    impact: 1,
    class_counts: { added: 0, removed: 0 },
    minor_count: 0,
    ...over,
  } as unknown as RouteDirDiff;
}

const routes: Record<string, RouteInfo> = {
  M1: {
    short_name: 'M1',
    long_name: 'Olesa - Terrassa',
    color: '',
    text_color: '',
    presence: 'both',
  },
  CS2: {
    short_name: 'CS2',
    long_name: 'Castellbisbal - Bus urbà',
    color: '',
    text_color: '',
    presence: 'both',
  },
};

describe('route row filters', () => {
  const rows = [
    row('M1', '0', ['less_service', 'retimed']),
    row('M1', '1', ['retimed']),
    row('CS2', '0', ['pattern']),
  ];

  it('shows every row with no verdict selected, and any-of when some are', () => {
    expect(
      filterRouteRows(rows, { verdicts: [], search: '' }, routes),
    ).toHaveLength(3);
    expect(
      filterRouteRows(
        rows,
        { verdicts: ['less_service', 'pattern'], search: '' },
        routes,
      ).map((r) => r.key),
    ).toEqual(['M1|0', 'CS2|0']);
  });

  it('searches route names without accents', () => {
    expect(
      filterRouteRows(rows, { verdicts: [], search: 'urba' }, routes).map(
        (r) => r.route,
      ),
    ).toEqual(['CS2']);
  });

  it('counts rows per verdict under the search', () => {
    const counts = verdictCounts(rows, 'olesa', routes);
    expect(counts.retimed).toBe(2);
    expect(counts.pattern).toBe(0);
  });

  it('round-trips through the query string', () => {
    const p = new URLSearchParams('day=20260901');
    writeRouteFilters(p, { verdicts: ['retimed', 'pattern'], search: 'M1' });
    expect(p.toString()).toBe('day=20260901&change=retimed%2Cpattern&q=M1');
    expect(parseRouteFilters(p)).toEqual({
      verdicts: ['retimed', 'pattern'],
      search: 'M1',
    });
    writeRouteFilters(p, { verdicts: [], search: '' });
    expect(p.toString()).toBe('day=20260901');
  });

  it('ignores unknown verdicts in the URL', () => {
    expect(
      parseRouteFilters(new URLSearchParams('change=bogus,retimed')).verdicts,
    ).toEqual(['retimed']);
  });
});

describe('route page', () => {
  it('builds route and list links that keep the day', () => {
    expect(
      tripsRouteHref('mbta', 'Green-B', { day: '20260901', dir: '0' }),
    ).toBe('/gtfs-diff-tool-v2/mbta/trips-v2/Green-B?day=20260901&dir=0');
    expect(tripsRouteHref('mbta', 'a/b')).toBe(
      '/gtfs-diff-tool-v2/mbta/trips-v2/a%2Fb',
    );
    expect(tripsListHref('mbta', '20260901')).toBe(
      '/gtfs-diff-tool-v2/mbta/trips-v2?day=20260901',
    );
    const filters = { verdicts: ['retimed' as const], search: 'M1' };
    expect(tripsRouteHref('mbta', 'M1', { day: '20260901', filters })).toBe(
      '/gtfs-diff-tool-v2/mbta/trips-v2/M1?day=20260901&change=retimed&q=M1',
    );
    expect(tripsListHref('mbta', '20260901', filters)).toBe(
      '/gtfs-diff-tool-v2/mbta/trips-v2?day=20260901&change=retimed&q=M1',
    );
  });

  it('scopes a day to one route and recomputes its totals', () => {
    const day = {
      date: '20260901',
      services: { base: [], new: [] },
      routes: [
        row('M1', '0', [], { trips: { base: 5, new: 3 }, minor_count: 1 }),
        row('M1', '1', [], { trips: { base: 4, new: 4 } }),
        row('CS2', '0', [], { trips: { base: 9, new: 9 } }),
      ],
      class_counts: {},
      minor_count: 0,
      trips: { base: 18, new: 16 },
    } as unknown as DayDiff;
    const scoped = scopeDayToRoute(day, 'M1');
    expect(scoped.routes).toHaveLength(2);
    expect(scoped.trips).toEqual({ base: 9, new: 7 });
    expect(scoped.minor_count).toBe(1);
  });

  it('opens the requested direction, else the most impacted', () => {
    const rows = [
      row('M1', '0', [], { impact: 2 }),
      row('M1', '1', [], { impact: 9 }),
    ];
    expect(defaultDirection(rows, '0')?.dir).toBe('0');
    expect(defaultDirection(rows, null)?.dir).toBe('1');
    expect(defaultDirection(rows, 'x')?.dir).toBe('1');
    expect(defaultDirection([], null)).toBeNull();
  });
});
