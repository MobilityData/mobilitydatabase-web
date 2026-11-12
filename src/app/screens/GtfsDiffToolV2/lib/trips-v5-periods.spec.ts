import type { TripChangeCounts, TripsCalendarDoc } from './trips-calendar';
import { scheduleNote, servicePeriods } from './trips-periods';
import { formatChangeShare, periodTitles } from './trips-v5-periods';

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
const SHARED = calendarOf(
  {
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
  },
  [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [0, 4],
    [5, 5],
    [6, 6],
    [7, 7],
  ],
);

function rowsOf(
  cal: TripsCalendarDoc,
): Array<[string, string | null, string, string | null]> {
  const periods = servicePeriods(cal);
  const titles = periodTitles(periods);
  return periods.map((p) => [
    titles.get(p.id) ?? '',
    scheduleNote(p),
    p.when,
    p.dates.length > 1 ? `${p.dates.length} days` : null,
  ]);
}

describe('periodTitles by period', () => {
  it('titles each period by kind and day, in the periods’ order', () => {
    expect(rowsOf(SHARED)).toEqual([
      ['Typical weekday', null, '7–18 Sep', '10 days'],
      ['Typical Saturday', null, '12–26 Sep', '2 days'],
      ['Typical Sunday', null, '13–20 Sep', '2 days'],
      // Special periods may share a title: their window tells them apart.
      ['Special weekday', null, '21–25 Sep', '5 days'],
      ['Special weekday', null, '29–30 Sep', '2 days'],
      // Single weekdays get their weekday.
      [
        'Special Monday',
        'Weekday schedule before, a schedule of its own after',
        '28 Sep',
        null,
      ],
      ['Special Thursday', null, '1 Oct', null],
      ['Special Monday', null, '5 Oct', null],
      // Exceptions list their dates and say what runs.
      ['Exception Saturday', 'Runs the Sunday schedule', '19 Sep', null],
      ['Exception Friday', 'Runs the Sunday schedule', '2 Oct', null],
    ]);
  });

  it('formats the share of trips changed', () => {
    const periods = servicePeriods(SHARED);
    // Comparison 0 changes nothing; 3 changes 33 of 103 trips.
    expect(formatChangeShare(periods[0].share)).toBe('0%');
    expect(formatChangeShare(periods[3].share)).toBe('32%');
  });

  it('titles the new feed’s periods when the feeds share no dates', () => {
    const cal = calendarOf(
      {
        '20261012': 0, // Mon
        '20261013': 1, // Tue
        '20261014': 1, // Wed
        '20261019': 0,
        '20261020': 1,
        '20261017': 2, // Sat running the new feed's weekday schedule
        '20261018': 3, // Sun of its own
      },
      [
        [5, 0],
        [6, 0],
        [7, 0],
        [8, 1],
      ],
      'cross',
    );
    // Two typical weekday periods: the Mondays get their weekday.
    expect(rowsOf(cal).map(([title, note]) => [title, note])).toEqual([
      ['Typical weekday', null],
      ['Typical Monday', null],
      ['Special Sunday', null],
      ['Exception Saturday', 'Runs the weekday schedule'],
    ]);
  });
});

describe('periodTitles', () => {
  it('keeps typical titles apart, lets others share theirs', () => {
    const periods = servicePeriods(SHARED);
    const titles = periodTitles(periods);
    const typical = periods
      .filter((p) => p.typical)
      .map((p) => titles.get(p.id));
    expect(new Set(typical).size).toBe(typical.length);
    expect(
      [...titles.values()].filter((t) => t === 'Special weekday'),
    ).toHaveLength(2);
  });
});

describe('formatChangeShare', () => {
  it('rounds to a whole percent, never to 0 or 100', () => {
    expect(formatChangeShare(0)).toBe('0%');
    expect(formatChangeShare(0.001)).toBe('<1%');
    expect(formatChangeShare(0.536)).toBe('54%');
    expect(formatChangeShare(0.998)).toBe('>99%');
    expect(formatChangeShare(1)).toBe('100%');
  });
});
