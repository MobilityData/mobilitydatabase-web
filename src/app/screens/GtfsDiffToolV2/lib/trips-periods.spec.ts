import type { TripChangeCounts, TripsCalendarDoc } from './trips-calendar';
import {
  changeShare,
  periodByDate,
  periodPhrase,
  periodWhen,
  scheduleNote,
  servicePeriods,
} from './trips-periods';

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
  sets: Array<[number, number]> | undefined,
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
    counts: Array.from({ length: n }, (_, s) => counts(s, 0, 10)),
    ...(sets ? { sets } : {}),
    weekdays: [],
  };
}

// Mon 7 Sep … Mon 28 Sep 2026.
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
  },
  [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [0, 4],
  ],
);

describe('servicePeriods', () => {
  it('groups dates by comparison and day type, typical schedules first', () => {
    const periods = servicePeriods(SHARED);
    expect(
      periods.map((p) => [p.title, p.when, p.dates.length, p.schedule]),
    ).toEqual([
      ['Weekdays', '7–18 Sep', 10, 'Typical schedule'],
      ['Saturdays', '12–26 Sep', 2, 'Typical schedule'],
      ['Sundays', '13–20 Sep', 2, 'Typical schedule'],
      ['Weekdays', '21–25 Sep', 5, 'A schedule of its own'],
      [
        'Monday',
        '28 Sep',
        1,
        'Weekday schedule before, a schedule of its own after',
      ],
      // The exception lists its dates.
      ['Saturday', '19 Sep', 1, 'Runs the Sunday schedule'],
    ]);
    expect(periods.map((p) => [p.typical, p.exception])).toEqual([
      [true, false],
      [true, false],
      [true, false],
      [false, false],
      [false, false],
      [false, true],
    ]);
  });

  it('colours the comparisons covering most days; exceptions share theirs', () => {
    const periods = servicePeriods(SHARED);
    const color = (id: string): number | null | undefined =>
      periods.find((p) => p.id === id)?.color;
    // s0: 10 days, s3: 5, s2: 3 (2 Sundays and the Saturday), s1: 2.
    expect(color('0-weekday')).toBe(0);
    expect(color('3-weekday')).toBe(1);
    expect(color('2-sunday')).toBe(2);
    expect(color('2-saturday')).toBe(2);
    expect(color('1-saturday')).toBe(3);
    // A single day isn't singled out.
    expect(color('4-weekday')).toBeNull();
  });

  it('names periods by the new feed only when the feeds share no dates', () => {
    // New-feed dates against the old feed's typical weekday: base sets
    // differ by weekday, the new feed runs one weekday schedule.
    const cal = calendarOf(
      {
        '20261012': 0, // Mon
        '20261013': 1, // Tue
        '20261014': 1, // Wed
        '20261019': 0,
        '20261020': 1,
        '20261017': 2, // Sat running the new feed's weekday schedule
      },
      [
        [5, 0],
        [6, 0],
        [7, 0],
      ],
      'cross',
    );
    const periods = servicePeriods(cal);
    expect(
      periods.map((p) => [p.title, p.schedule, p.typical, p.exception]),
    ).toEqual([
      ['Weekdays', 'Typical schedule', true, false],
      ['Mondays', 'Typical schedule', true, false],
      ['Saturday', 'Runs the weekday schedule', false, true],
    ]);
  });

  it('falls back to comparisons when the calendar has no sets', () => {
    const { sets: _, ...rest } = SHARED;
    const periods = servicePeriods(rest);
    expect(periods.find((p) => p.id === '2-saturday')?.schedule).toBe(
      'Runs the Sunday schedule',
    );
    // Without sets the two sides can't be told apart.
    expect(periods.find((p) => p.id === '4-weekday')?.schedule).toBe(
      'A schedule of its own',
    );
  });

  it('calls nothing typical when no schedule repeats', () => {
    const cal = calendarOf({ '20260907': 0, '20260908': 1, '20260912': 2 }, [
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    expect(servicePeriods(cal).every((p) => !p.typical)).toBe(true);
    expect(servicePeriods(cal).every((p) => p.color == null)).toBe(true);
  });

  it('maps every date to its period', () => {
    const byDate = periodByDate(servicePeriods(SHARED));
    expect(Object.keys(byDate)).toHaveLength(Object.keys(SHARED.days).length);
    expect(byDate['20260919'].exception).toBe(true);
    expect(byDate['20260919'].runs).toBe('sunday');
  });
});

describe('periodWhen', () => {
  it('shortens ranges within a month or a year', () => {
    expect(periodWhen(['20260815'])).toBe('15 Aug');
    expect(periodWhen(['20260803', '20260831'])).toBe('3–31 Aug');
    expect(periodWhen(['20260828', '20260904'])).toBe('28 Aug – 4 Sep');
    expect(periodWhen(['20260908', '20270618'])).toBe(
      '8 Sep 2026 – 18 Jun 2027',
    );
  });
});

describe('changeShare', () => {
  it('is the trips changed out of every trip of either feed', () => {
    // 365 trips before, 2 added: 149 of 367 changed.
    expect(changeShare(counts(2, 13, 134, 365))).toBeCloseTo(149 / 367);
    expect(changeShare(counts(0, 0, 0, 0))).toBe(0);
  });
});

describe('scheduleNote', () => {
  it('leaves out what the group already says', () => {
    const note = (id: string): string | null | undefined => {
      const p = servicePeriods(SHARED).find((x) => x.id === id);
      return p ? scheduleNote(p) : undefined;
    };
    expect(note('0-weekday')).toBeNull();
    expect(note('3-weekday')).toBeNull();
    expect(note('4-weekday')).toBe(
      'Weekday schedule before, a schedule of its own after',
    );
    expect(note('2-saturday')).toBe('Runs the Sunday schedule');
  });
});

describe('periodPhrase', () => {
  it('reads after "on"', () => {
    const phrase = (id: string): string | undefined => {
      const p = servicePeriods(SHARED).find((x) => x.id === id);
      return p ? periodPhrase(p) : undefined;
    };
    expect(phrase('0-weekday')).toBe('weekdays');
    expect(phrase('2-sunday')).toBe('Sundays');
    expect(phrase('3-weekday')).toBe('weekdays 21–25 Sep');
    expect(phrase('2-saturday')).toBe('Sat 19 Sep');
  });
});
