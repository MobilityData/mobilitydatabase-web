import { TRIP_CLASSES } from './trips-utils';
import type { TripClass } from './trips-types';
import {
  changeCounts,
  planTripsCalendar,
  typicalWeekdays,
} from './trips-calendar';

describe('planTripsCalendar', () => {
  it('compares each shared date once per distinct pair of service sets', () => {
    // Mon 7 Sep … Sun 13 Sep 2026; base starts a day later.
    const plan = planTripsCalendar({
      dates: {
        '20260906': [-1, 0], // before the base feed: outside the shared period
        '20260907': [0, 0],
        '20260908': [0, 0],
        '20260909': [0, 1], // a different new set
        '20260912': [2, 2],
        '20260913': [-1, -1], // no service at all
      },
    });
    expect(plan).toMatchObject({
      mode: 'shared',
      first: '20260907',
      // The 13th has no service in either feed.
      last: '20260912',
    });
    expect(Object.keys(plan?.days ?? {})).toEqual([
      '20260907',
      '20260908',
      '20260909',
      '20260912',
    ]);
    expect(plan?.comparisons).toEqual([
      { base: 0, new: 0, key: '20260907' },
      { base: 0, new: 1, key: '20260909' },
      { base: 2, new: 2, key: '20260912' },
    ]);
    // Monday's typical comparison is the only Monday.
    expect(plan?.weekdays.find((w) => w.weekday === 0)).toMatchObject({
      date: '20260907',
      days: 1,
      of: 1,
    });
  });

  it('pairs new-feed dates with the old feed’s typical same weekday', () => {
    // Base: Mondays 3, 10 Aug (set 0), 17 Aug (set 1). New: Mondays in Nov.
    const plan = planTripsCalendar({
      dates: {
        '20260803': [0, -1],
        '20260810': [0, -1],
        '20260817': [1, -1],
        '20261102': [-1, 5],
        '20261109': [-1, 5],
        '20261110': [-1, 6], // a Tuesday: no typical base Tuesday
      },
    });
    expect(plan?.mode).toBe('cross');
    expect(plan?.days['20261102']).toEqual({ key: '20260810~20261102', s: 0 });
    expect(plan?.days['20261109'].s).toBe(0);
    expect(plan?.comparisons).toEqual([
      { base: 0, new: 5, key: '20260810~20261102' },
      { base: -1, new: 6, key: '20261110' },
    ]);
  });
});

describe('changeCounts', () => {
  it('counts rider-facing classes as modified, not ID-only ones', () => {
    const cc = Object.fromEntries(TRIP_CLASSES.map((c) => [c, 0])) as Record<
      TripClass,
      number
    >;
    Object.assign(cc, {
      added: 2,
      removed: 1,
      shifted: 3,
      pattern: 1,
      restructured: 9,
      unchanged: 40,
    });
    expect(changeCounts(cc, { base: 50, new: 51 })).toEqual({
      added: 2,
      removed: 1,
      modified: 4,
      id_only: 9,
      base: 50,
      new: 51,
    });
  });
});

describe('typicalWeekdays', () => {
  it('uses the busiest date when no comparison repeats on a weekday', () => {
    const plan = planTripsCalendar({
      dates: {
        '20260608': [0, 0], // Monday: the old timetable's tail
        '20260615': [1, 1], // Monday: a normal one
      },
    });
    const counts = [
      { added: 1, removed: 1, modified: 1, id_only: 0, base: 50, new: 40 },
      { added: 9, removed: 9, modified: 9, id_only: 0, base: 5000, new: 5100 },
    ];
    const monday = typicalWeekdays(plan!, counts).find((w) => w.weekday === 0);
    expect(monday).toMatchObject({ date: '20260615', s: 1, busiest: true });
  });
});
