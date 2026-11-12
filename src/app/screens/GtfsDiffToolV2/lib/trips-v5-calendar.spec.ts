import type { TripChangeCounts, TripsCalendarDoc } from './trips-calendar';
import { periodByDate, servicePeriods } from './trips-periods';
import {
  changedDays,
  clampToYears,
  compactCount,
  dayAriaLabel,
  exceptionNote,
  exceptionNoteShort,
  tripsDayCell,
  tripsMonthCells,
  yearMonths,
} from './trips-v5-calendar';

function counts(
  added: number,
  removed: number,
  modified: number,
  base = 100,
): TripChangeCounts {
  return {
    added,
    removed,
    modified,
    id_only: 0,
    base,
    new: base + added - removed,
  };
}

// Mon 7 … Sun 20 Sep 2026: two weeks of weekdays (s0), a Saturday of its own
// (s1), Sundays (s2) and a Saturday running the Sunday schedule.
const DAYS: Record<string, number> = {
  ...Object.fromEntries(
    [7, 8, 9, 10, 11, 14, 15, 16, 17, 18].map((d) => [
      `202609${String(d).padStart(2, '0')}`,
      0,
    ]),
  ),
  '20260912': 1,
  '20260913': 2,
  '20260919': 2,
  '20260920': 2,
};

const SHARED: TripsCalendarDoc = {
  schema: 1,
  mode: 'shared',
  first: '20260907',
  last: '20260920',
  days: Object.fromEntries(
    Object.entries(DAYS).map(([d, s]) => [d, { key: d, s }]),
  ),
  counts: [counts(2, 1, 3), counts(0, 0, 0), counts(0, 5, 0, 40)],
  sets: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  weekdays: [],
};

const PERIODS = servicePeriods(SHARED);
const BY_DATE = periodByDate(PERIODS);

describe('tripsMonthCells', () => {
  const cells = tripsMonthCells(SHARED, BY_DATE, { year: 2026, month: 8 });

  it('lays the month out Monday first, padded to whole weeks', () => {
    // 1 Sep 2026 is a Tuesday; 30 Sep a Wednesday.
    expect(cells).toHaveLength(35);
    expect(cells[0]).toBeNull();
    expect(cells[1]?.date).toBe('20260901');
    expect(cells[30]?.date).toBe('20260930');
    expect(cells.slice(31)).toEqual([null, null, null, null]);
  });

  it('gives compared days their period and counts', () => {
    const mon = cells.find((c) => c?.date === '20260907');
    expect(mon?.period?.id).toBe('0-weekday');
    expect(mon?.counts).toEqual(counts(2, 1, 3));
    expect(mon?.changed).toBe(6);
    expect(mon?.base).toBeNull();
    expect(mon?.note).toBeNull();
  });

  it('leaves days outside the compared calendar empty', () => {
    const tue = cells.find((c) => c?.date === '20260901');
    expect(tue).toMatchObject({
      day: 1,
      period: null,
      counts: null,
      changed: 0,
      note: null,
    });
    expect(dayAriaLabel(tue!)).toBe('Tue 1 Sep 2026: not compared');
  });

  it('notes the schedule an exception runs', () => {
    const sat = cells.find((c) => c?.date === '20260919');
    expect(sat?.period?.exception).toBe(true);
    expect(sat?.note).toBe('Sunday schedule');
    expect(sat?.shortNote).toBe('Sun sched.');
  });

  it('counts the days with trips changed', () => {
    // 10 weekdays and 3 days of the Sunday schedule; the Saturday of its own
    // changes nothing.
    expect(changedDays(cells)).toBe(13);
  });
});

describe('tripsDayCell', () => {
  it('names the old feed’s day a new-feed day is compared with (cross)', () => {
    const cross: TripsCalendarDoc = {
      ...SHARED,
      mode: 'cross',
      first: '20261012',
      last: '20261013',
      days: {
        '20261012': { key: '20260907~20261012', s: 0 },
        '20261013': { key: '20260908~20261013', s: 0 },
      },
      sets: [[0, 0]],
    };
    const byDate = periodByDate(servicePeriods(cross));
    const cell = tripsDayCell(cross, byDate, '20261012');
    expect(cell.base).toBe('20260907');
    expect(cell.changed).toBe(6);
    expect(cell.period?.dates).toEqual(['20261012', '20261013']);
  });
});

describe('exceptionNote', () => {
  it('falls back to "Exception" when the schedule runs no single day type', () => {
    const p = { ...PERIODS[0], exception: true, runs: null };
    expect(exceptionNote(p)).toBe('Exception');
    expect(exceptionNoteShort(p)).toBe('Exc.');
    expect(exceptionNote(PERIODS[0])).toBeNull();
    expect(exceptionNote(null)).toBeNull();
  });
});

describe('yearMonths and clampToYears', () => {
  it('keeps the months within the calendar', () => {
    expect(yearMonths(2026, '20260801', '20270731')).toEqual([7, 8, 9, 10, 11]);
    expect(yearMonths(2027, '20260801', '20270731')).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(yearMonths(2028, '20260801', '20270731')).toEqual([]);
  });

  it('moves a cursor outside the calendar’s years into them', () => {
    expect(
      clampToYears({ year: 2025, month: 3 }, '20260801', '20270731'),
    ).toEqual({ year: 2026, month: 7 });
    expect(
      clampToYears({ year: 2029, month: 3 }, '20260801', '20270731'),
    ).toEqual({ year: 2027, month: 6 });
    const inside = { year: 2027, month: 10 };
    expect(clampToYears(inside, '20260801', '20270731')).toBe(inside);
  });
});

describe('dayAriaLabel', () => {
  it('reads out the period and the changes', () => {
    const cell = tripsDayCell(SHARED, BY_DATE, '20260912');
    expect(dayAriaLabel(cell)).toBe(
      'Sat 12 Sep 2026: Saturday, A schedule of its own, no trip changes',
    );
    expect(dayAriaLabel(tripsDayCell(SHARED, BY_DATE, '20260907'))).toBe(
      'Mon 7 Sep 2026: Weekdays, Typical schedule, 2 added, 1 removed, 3 modified trips',
    );
  });
});

describe('compactCount', () => {
  it('shortens thousands', () => {
    expect(compactCount(950)).toBe('950');
    expect(compactCount(12853)).toBe('12.9K');
  });
});
