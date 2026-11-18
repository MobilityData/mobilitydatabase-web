import type { DayEntryRow } from './calendar-query';
import type {
  CalendarRow,
  RouteInfo,
  ServiceDiff,
  ServiceSnapshot,
} from './entity-diff-types';
import {
  activeDates,
  calendarPageHref,
  dayEntryCategory,
  dayEntryCategoryCounts,
  filterDayEntries,
  monthsBetween,
  routePreview,
  serviceDays,
  serviceHref,
  serviceRoutes,
} from './service-detail';

function cal(days: string, start: string, end: string): CalendarRow {
  const [monday, tuesday, wednesday, thursday, friday, saturday, sunday] =
    days.split('');
  return {
    monday,
    tuesday,
    wednesday,
    thursday,
    friday,
    saturday,
    sunday,
    start_date: start,
    end_date: end,
  } as CalendarRow;
}

function snap(
  calendar: CalendarRow | null,
  exceptions: Array<[string, '1' | '2']> = [],
): ServiceSnapshot {
  return {
    calendar,
    exceptions: exceptions.map(([date, exception_type]) => ({
      date,
      exception_type,
    })),
    active_day_count: 0,
    first_date: null,
    last_date: null,
  };
}

function service(
  status: ServiceDiff['status'],
  base: ServiceSnapshot | null,
  next: ServiceSnapshot | null,
): ServiceDiff {
  return {
    service_id: 'S',
    status,
    base,
    new: next,
    route_ids: { base: [], new: [] },
    trip_counts: { base: 0, new: 0 },
    calendar_field_changes: [],
    exception_changes: { added: [], removed: [], modified: [] },
    dates_gained: [],
    dates_lost: [],
  };
}

describe('links', () => {
  it('opens a service page and the calendar on a day or service', () => {
    expect(serviceHref('mbta', 'A/B 1')).toBe(
      '/gtfs-diff-tool-v2/mbta/calendar/A%2FB%201',
    );
    expect(calendarPageHref('mbta')).toBe('/gtfs-diff-tool-v2/mbta/calendar');
    expect(calendarPageHref('mbta', { day: '20261224', service: 'WK' })).toBe(
      '/gtfs-diff-tool-v2/mbta/calendar?day=20261224&service=WK',
    );
  });
});

describe('routePreview', () => {
  it('shows five routes, then "and +N"', () => {
    const ids = ['1', '2', '3', '4', '5', '6', '7', '8'];
    expect(routePreview(ids)).toEqual({
      shown: ['1', '2', '3', '4', '5'],
      more: 3,
    });
  });

  it('shows a sixth route rather than "and +1"', () => {
    const ids = ['1', '2', '3', '4', '5', '6'];
    expect(routePreview(ids)).toEqual({ shown: ids, more: 0 });
  });
});

describe('serviceRoutes', () => {
  it('sorts by short name and says which feeds use each route', () => {
    const routes = {
      a: { short_name: '10' },
      b: { short_name: '9' },
      c: { short_name: '2' },
    } as unknown as Record<string, RouteInfo>;
    expect(
      serviceRoutes(
        { route_ids: { base: ['a', 'b'], new: ['b', 'c'] } },
        routes,
      ),
    ).toEqual([
      { routeId: 'c', presence: 'new' },
      { routeId: 'b', presence: 'both' },
      { routeId: 'a', presence: 'base' },
    ]);
  });
});

describe('activeDates', () => {
  it('expands the weekdays between the dates, then the exceptions', () => {
    // 2026-12-21 is a Monday.
    const s = snap(cal('1111100', '20261221', '20261227'), [
      ['20261225', '2'],
      ['20261226', '1'],
    ]);
    expect([...activeDates(s)].sort()).toEqual([
      '20261221',
      '20261222',
      '20261223',
      '20261224',
      '20261226',
    ]);
  });

  it('is the exceptions alone without a calendar.txt row', () => {
    expect([...activeDates(snap(null, [['20261224', '1']]))]).toEqual([
      '20261224',
    ]);
    expect(activeDates(null).size).toBe(0);
  });
});

describe('serviceDays', () => {
  it('marks every date of an added or removed service', () => {
    const added = serviceDays(
      service('added', null, snap(null, [['20261224', '1']])),
    );
    expect([...added.values()]).toEqual([
      {
        date: '20261224',
        state: 'added',
        exception: { base: null, new: '1' },
      },
    ]);
  });

  it('tells dates run in both feeds from gained, lost and exception-only ones', () => {
    // Base Mon–Fri, new Mon–Thu plus Saturday 26th; a no-service
    // exception added on Sunday 27th, a day neither feed runs.
    const days = serviceDays(
      service(
        'modified',
        snap(cal('1111100', '20261221', '20261227')),
        snap(cal('1111000', '20261221', '20261227'), [
          ['20261226', '1'],
          ['20261227', '2'],
        ]),
      ),
    );
    expect(Object.fromEntries([...days].map(([d, v]) => [d, v.state]))).toEqual(
      {
        '20261221': 'runs',
        '20261222': 'runs',
        '20261223': 'runs',
        '20261224': 'runs',
        '20261225': 'lost',
        '20261226': 'gained',
        '20261227': 'exception',
      },
    );
    expect([...days.keys()]).toEqual([...days.keys()].sort());
  });
});

describe('monthsBetween', () => {
  it('lists every month across a year end', () => {
    expect(monthsBetween('20261115', '20270203')).toEqual([
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
      { year: 2027, month: 0 },
      { year: 2027, month: 1 },
    ]);
    expect(monthsBetween(null, null)).toEqual([]);
  });
});

describe('day popup entries', () => {
  const entry = (
    kind: DayEntryRow['kind'],
    id: string,
    routeIds: string[],
    change?: 'gained' | 'lost' | 'exception_only',
  ): DayEntryRow =>
    ({
      kind,
      entry: {
        service_id: id,
        exception: null,
        ...(change
          ? { change, reason: { code: 'exception_added', detail: '' } }
          : {}),
      },
      routeIds,
      patternBase: '',
      patternNew: '',
      trips: { base: 0, new: 0 },
    }) as DayEntryRow;
  const rows = [
    entry('added', 'XMAS', ['R1']),
    entry('removed', 'OLD', []),
    entry('modified', 'WK', ['R2'], 'lost'),
    entry('modified', 'SAT', ['R2'], 'lost'),
  ];
  const routes = {
    R1: { short_name: '1', long_name: 'Harbour Line' },
    R2: { short_name: '2', long_name: 'Airport' },
  } as unknown as Record<string, RouteInfo>;

  it('categorises modified services by their change', () => {
    expect(rows.map(dayEntryCategory)).toEqual([
      'added',
      'removed',
      'lost',
      'lost',
    ]);
    expect(dayEntryCategoryCounts(rows)).toEqual([
      { category: 'added', count: 1 },
      { category: 'removed', count: 1 },
      { category: 'lost', count: 2 },
    ]);
  });

  it('filters by category and by service_id or route names', () => {
    const ids = (f: Parameters<typeof filterDayEntries>[1]): string[] =>
      filterDayEntries(rows, f, routes).map((r) => r.entry.service_id);
    expect(ids({ search: '', categories: ['lost'] })).toEqual(['WK', 'SAT']);
    expect(ids({ search: 'harbour', categories: [] })).toEqual(['XMAS']);
    expect(ids({ search: 'ol', categories: [] })).toEqual(['OLD']);
    expect(ids({ search: 'air', categories: ['added'] })).toEqual([]);
  });
});
