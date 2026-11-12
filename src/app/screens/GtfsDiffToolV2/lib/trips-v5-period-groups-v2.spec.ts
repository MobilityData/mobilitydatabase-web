import type { TripChangeCounts, TripsCalendarDoc } from './trips-calendar';
import { type ServicePeriod, servicePeriods } from './trips-periods';
import {
  type GroupRowV2,
  daysLabel,
  formatCountRange,
  formatShareRange,
  listedDates,
  periodGroupRowsV2,
} from './trips-v5-period-groups-v2';

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

/** A calendar from date -> comparison, with each comparison's sets. */
function calendarOf(
  days: Record<string, number>,
  sets: Array<[number, number]>,
  mode: TripsCalendarDoc['mode'] = 'shared',
): TripsCalendarDoc {
  const dates = Object.keys(days).sort();
  const n = Math.max(...Object.values(days)) + 1;
  return {
    schema: 1,
    mode,
    first: dates[0],
    last: dates[dates.length - 1],
    days: Object.fromEntries(dates.map((d) => [d, { key: d, s: days[d] }])),
    counts: Array.from({ length: n }, (_, s) => counts(s, 0, 10 * s)),
    sets,
    weekdays: [],
  };
}

// Mon 7 Sep … Mon 5 Oct 2026.
const SHARED_DAYS: Record<string, number> = {
  // Two weeks of the typical weekday schedule.
  ...Object.fromEntries(
    [7, 8, 9, 10, 11, 14, 15, 16, 17, 18].map((d) => [
      `202609${String(d).padStart(2, '0')}`,
      0,
    ]),
  ),
  '20260912': 1, // typical Saturday
  '20260913': 2, // typical Sunday
  '20260919': 2, // a Saturday running the Sunday schedule
  '20260920': 2,
  '20260921': 3, // a week of its own
  '20260922': 3,
  '20260923': 3,
  '20260924': 3,
  '20260925': 3,
  '20260926': 1,
  '20260928': 4, // weekday schedule before, its own after
  '20260929': 5, // two weekdays of their own
  '20260930': 5,
  '20261001': 6, // a Thursday of its own
  '20261002': 2, // a Friday running the Sunday schedule
  '20261005': 7, // a Monday of its own
};

const SHARED_SETS: Array<[number, number]> = [
  [0, 0],
  [1, 1],
  [2, 2],
  [3, 3],
  [0, 4],
  [5, 5],
  [6, 6],
  [7, 7],
];

const SHARED = calendarOf(SHARED_DAYS, SHARED_SETS);

function rowOf(rows: GroupRowV2[], title: string): GroupRowV2 {
  const row = rows.find((r) => r.title === title);
  if (row == null) throw new Error(`No row ${title}`);
  return row;
}

describe('periodGroupRowsV2', () => {
  const periods = servicePeriods(SHARED);
  const rows = periodGroupRowsV2(periods);

  it('lists typical periods, then substitutes, then summaries', () => {
    expect(rows.map((r) => [r.kind, r.title, r.window, r.days])).toEqual([
      ['typical', 'Typical weekday', '7–18 Sep', '10 days'],
      ['typical', 'Typical Saturday', '12–26 Sep', '2 days'],
      ['typical', 'Typical Sunday', '13–20 Sep', '2 days'],
      ['substitute', 'Runs the Sunday schedule', '19 Sep, 2 Oct', null],
      ['block', 'Unique schedule', '21–30 Sep', '2 periods · 7 days'],
      ['oneoff', 'Unique single date schedule', '28 Sep – 5 Oct', '3 days'],
    ]);
  });

  it('opens typical rows on their first day', () => {
    expect(rows.slice(0, 3).map((r) => [r.openDate, r.children])).toEqual([
      ['20260907', null],
      ['20260912', null],
      ['20260913', null],
    ]);
  });

  it('merges periods running the same schedule into one row', () => {
    const row = rowOf(rows, 'Runs the Sunday schedule');
    expect(row.periodIds).toEqual(['2-saturday', '2-weekday']);
    // Two comparisons: it expands rather than opens.
    expect(row.openDate).toBeNull();
    expect(
      row.children?.map((c) => [c.title, c.window, c.note, c.openDate]),
    ).toEqual([
      ['Exception Saturday', '19 Sep', null, '20260919'],
      ['Exception Friday', '2 Oct', null, '20261002'],
    ]);
    // Both run comparison 2: one value, no range.
    expect(row.change).toBe('22%');
    expect(row.counts.added).toEqual({ label: '2', zero: false });
    expect(row.counts.removed).toEqual({ label: '0', zero: true });
  });

  it('summarises own schedules, children by trip change', () => {
    const block = rowOf(rows, 'Unique schedule');
    expect(block.openDate).toBeNull();
    expect(block.children?.map((c) => [c.title, c.window, c.change])).toEqual([
      ['Special weekday', '29–30 Sep', '52%'],
      ['Special weekday', '21–25 Sep', '32%'],
    ]);
    const oneoff = rowOf(rows, 'Unique single date schedule');
    expect(
      oneoff.children?.map((c) => [c.title, c.window, c.note, c.change]),
    ).toEqual([
      ['Special Monday', '5 Oct', null, '72%'],
      ['Special Thursday', '1 Oct', null, '62%'],
      [
        'Special Monday',
        '28 Sep',
        'Weekday schedule before, a schedule of its own after',
        '42%',
      ],
    ]);
  });

  it('shows ranges when members differ', () => {
    const block = rowOf(rows, 'Unique schedule');
    expect(block.change).toBe('32–52%');
    expect(block.counts.added.label).toBe('3–5');
    expect(block.counts.modified.label).toBe('30–50');
    expect(block.counts.removed).toEqual({ label: '0', zero: true });
    const oneoff = rowOf(rows, 'Unique single date schedule');
    expect(oneoff.change).toBe('42–72%');
    expect(oneoff.periodIds).toHaveLength(3);
  });

  it('gives no-service periods a flagged row first after typical ones', () => {
    const cal = calendarOf(SHARED_DAYS, SHARED_SETS);
    // Comparison 7 (Mon 5 Oct) runs no trips in the new feed.
    cal.counts[7] = counts(0, 100, 0);
    const out = periodGroupRowsV2(servicePeriods(cal));
    expect(out.map((r) => r.kind)).toEqual([
      'typical',
      'typical',
      'typical',
      'none',
      'substitute',
      'block',
      'oneoff',
    ]);
    const none = out[3];
    expect([none.title, none.window, none.days, none.flagged]).toEqual([
      'No service',
      '5 Oct',
      '1 day',
      true,
    ]);
    expect(none.counts.removed.label).toBe('100');
    expect(none.children?.map((c) => [c.title, c.flagged])).toEqual([
      ['Special Monday', true],
    ]);
    expect(out[6].periodIds).toHaveLength(2);
  });

  it('leaves out kinds without periods', () => {
    const typical = periods.filter((p) => p.typical);
    expect(periodGroupRowsV2(typical).map((r) => r.kind)).toEqual([
      'typical',
      'typical',
      'typical',
    ]);
    const noBlocks = periods.filter((p) => p.typical || p.exception);
    expect(periodGroupRowsV2(noBlocks).map((r) => r.kind)).toEqual([
      'typical',
      'typical',
      'typical',
      'substitute',
    ]);
  });

  it('counts the days of a long substitute row, listing the first', () => {
    const more: Record<string, string[]> = {
      '2-saturday': ['20260919', '20261003', '20261010'],
      '2-weekday': ['20261002', '20261009', '20261016'],
    };
    const out = periodGroupRowsV2(
      periods.map(
        (p): ServicePeriod => (more[p.id] ? { ...p, dates: more[p.id] } : p),
      ),
    );
    const row = rowOf(out, 'Runs the Sunday schedule');
    expect([row.window, row.days]).toEqual([
      '19 Sep, 2 Oct, 3 Oct, …',
      '6 days',
    ]);
  });

  it('opens a substitute row of a single period', () => {
    const one = periods.filter((p) => p.id !== '2-weekday');
    const row = rowOf(periodGroupRowsV2(one), 'Runs the Sunday schedule');
    expect([row.openDate, row.children]).toEqual(['20260919', null]);
  });
});

describe('range helpers', () => {
  it('formats a share range, or one value when they agree', () => {
    expect(formatShareRange([0.22, 0.22])).toBe('22%');
    expect(formatShareRange([0.001, 0.002])).toBe('<1%');
    expect(formatShareRange([0.52, 0.32])).toBe('32–52%');
    expect(formatShareRange([0.001, 0.5])).toBe('<1–50%');
  });

  it('formats a count range, muted when all are zero', () => {
    expect(formatCountRange([3, 3])).toEqual({ label: '3', zero: false });
    expect(formatCountRange([5, 3])).toEqual({ label: '3–5', zero: false });
    expect(formatCountRange([0, 0])).toEqual({ label: '0', zero: true });
  });

  it('labels days, with periods when not one per day', () => {
    const periods = servicePeriods(SHARED);
    const singles = periods.filter((p) => p.dates.length === 1);
    expect(daysLabel(singles.slice(0, 1))).toBe('1 day');
    expect(daysLabel(singles)).toBe(`${singles.length} days`);
    expect(daysLabel(periods.slice(0, 2))).toBe('2 periods · 12 days');
  });

  it('lists up to four dates', () => {
    expect(listedDates(['20260919', '20261002'])).toBe('19 Sep, 2 Oct');
    expect(
      listedDates(['20260901', '20260902', '20260903', '20260904', '20260905']),
    ).toBe('1 Sep, 2 Sep, 3 Sep, …');
  });
});
