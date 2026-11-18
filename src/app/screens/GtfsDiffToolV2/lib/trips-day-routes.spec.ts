import type { TripsCalendarDoc } from './trips-calendar';
import {
  type DayRoutesRow,
  categoryMask,
  maskCategories,
  routeCalendar,
  routeTotals,
  toDayRoutesRow,
} from './trips-day-routes';

function row(over: Partial<DayRoutesRow>): DayRoutesRow {
  return {
    s: 0,
    route: 'R',
    dir: '0',
    headsign: null,
    added: 0,
    removed: 0,
    modified: 0,
    id_only: 0,
    base: 10,
    new: 10,
    mask: 0,
    changed: false,
    ...over,
  };
}

const zero = { added: 0, removed: 0, modified: 0, id_only: 0, base: 0 };

// Comparison 0 on three dates, comparison 1 on one.
const CALENDAR: TripsCalendarDoc = {
  schema: 1,
  mode: 'shared',
  first: '20260901',
  last: '20260904',
  days: {
    '20260901': { key: '20260901', s: 0 },
    '20260902': { key: '20260902', s: 0 },
    '20260903': { key: '20260903', s: 0 },
    '20260904': { key: '20260904', s: 1 },
  },
  counts: [
    { ...zero, new: 0 },
    { ...zero, new: 0 },
  ],
  weekdays: [],
};

describe('main-change masks', () => {
  it('round-trips categories in display order', () => {
    const mask = categoryMask(['shifted', 'new_stop']);
    expect(maskCategories(mask)).toEqual(['new_stop', 'shifted']);
    expect(maskCategories(0)).toEqual([]);
  });
});

describe('routeTotals', () => {
  it('sums each comparison once per date it stands for, most changed first', () => {
    const rows = [
      row({ route: 'A', s: 0, added: 1, mask: categoryMask(['trips_added']) }),
      row({ route: 'A', s: 0, dir: '1', removed: 1 }),
      row({ route: 'A', s: 1 }),
      row({ route: 'B', s: 1, modified: 5, mask: categoryMask(['shifted']) }),
      row({ route: 'C', s: 1, base: 0, new: 0 }),
    ];
    const totals = routeTotals(rows, CALENDAR);
    expect(totals.map((t) => t.route)).toEqual(['A', 'B', 'C']);
    expect(totals[0]).toMatchObject({
      changed: 6,
      added: 3,
      removed: 3,
      modified: 0,
      days: 3,
      serviceDays: 4,
      categories: ['trips_added'],
    });
    expect(totals[1]).toMatchObject({ changed: 5, days: 1, serviceDays: 1 });
    expect(totals[2]).toMatchObject({ changed: 0, days: 0, serviceDays: 0 });
  });

  it('ignores comparisons no date stands for', () => {
    expect(routeTotals([row({ s: 7, added: 9 })], CALENDAR)).toEqual([]);
  });
});

describe('routeCalendar', () => {
  it("keeps the dates and gives each comparison the route's counts", () => {
    const cal = routeCalendar(
      [
        row({ route: 'A', s: 1, added: 2, base: 4, new: 6 }),
        row({ route: 'A', s: 1, dir: '1', removed: 1, base: 3, new: 2 }),
        row({ route: 'B', s: 0, added: 9 }),
      ],
      CALENDAR,
      'A',
    );
    expect(cal.days).toBe(CALENDAR.days);
    expect(cal.counts).toEqual([
      { added: 0, removed: 0, modified: 0, id_only: 0, base: 0, new: 0 },
      { added: 2, removed: 1, modified: 0, id_only: 0, base: 7, new: 8 },
    ]);
  });
});

describe('toDayRoutesRow', () => {
  it('reads DuckDB values', () => {
    expect(
      toDayRoutesRow({
        s: 2,
        route: 'R',
        dir: null,
        headsign: 'X',
        added: BigInt(3),
        changed: true,
      }),
    ).toMatchObject({ s: 2, route: 'R', dir: '', headsign: 'X', added: 3 });
  });
});
