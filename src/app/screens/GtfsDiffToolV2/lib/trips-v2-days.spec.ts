import type { DayTypeOption } from './trips-types';
import {
  datesText,
  dayCatalog,
  dayGroupOf,
  describeDay,
  whenText,
} from './trips-v2-days';

function dayType(
  id: string,
  label: string,
  date: string,
  primary = true,
): DayTypeOption {
  return {
    id,
    label,
    date,
    day_count: 2,
    group_count: 2,
    first: date,
    last: date,
    primary,
  };
}

// Mon 7 Sep … Sun 13 Sep 2026, plus Mon 14 Sep (base only).
// Sets: base 0 = weekday, 1 = saturday, 2 = sunday, 3 = special;
//       new  0 = weekday, 1 = saturday, 2 = sunday, 3 = special.
const dates: Record<string, [number, number]> = {
  '20260907': [2, 2], // Labour Day: Sunday schedule in both
  '20260908': [0, 0], // typical weekday
  '20260909': [0, 0],
  '20260910': [2, 0], // Sunday schedule before, weekday after
  '20260911': [3, 3], // own schedule in both
  '20260912': [1, 1], // typical Saturday
  '20260913': [2, 2], // typical Sunday
  '20260914': [0, -1], // after the new feed ends
};
const doc = {
  dates,
  day_types: [
    dayType('weekday', 'Weekday', '20260908'),
    dayType('saturday', 'Saturday', '20260912'),
    dayType('sunday', 'Sunday', '20260913'),
  ],
};

describe('dayCatalog', () => {
  const c = dayCatalog(doc);

  it('finds the shared period and classifies each date', () => {
    expect(c.shared).toBe(true);
    expect(c.period).toEqual({ first: '20260907', last: '20260913' });
    expect(c.kindOf).toMatchObject({
      '20260907': 'same',
      '20260908': 'typical',
      '20260910': 'different',
      '20260911': 'check',
      '20260912': 'typical',
      '20260913': 'typical',
      '20260914': 'one_feed',
    });
    expect(c.counts).toEqual({ different: 1, check: 1, same: 1 });
  });

  it('names each special group after the schedules it runs, flagged first', () => {
    expect(c.special.map((g) => [g.verdict, g.title, g.dates])).toEqual([
      [
        'different',
        'Sunday schedule before, Weekday schedule after',
        ['20260910'],
      ],
      ['check', 'A schedule of its own in both feeds', ['20260911']],
      ['same', 'Runs the Sunday schedule in both feeds', ['20260907']],
    ]);
  });

  it('flags service that only one feed runs inside the shared period', () => {
    const d = dayCatalog({
      ...doc,
      dates: { ...dates, '20260909': [-1, 0] },
    });
    const g = d.special.find((x) => x.dates.includes('20260909'));
    expect(g?.verdict).toBe('different');
    expect(g?.title).toBe('Service added: Weekday schedule');
  });

  it('reports no shared period for feeds that do not overlap', () => {
    const d = dayCatalog({
      dates: { '20260801': [0, -1], '20261101': [-1, 0] },
      day_types: [],
    });
    expect(d.shared).toBe(false);
    expect(d.special).toEqual([]);
  });
});

describe('describeDay', () => {
  const c = dayCatalog(doc);
  const describe_ = (key: string) => describeDay(key, doc, c, []);

  it('names a typical day and what it stands for', () => {
    expect(describe_('20260908')).toMatchObject({
      title: 'Typical Weekday · Tue 8 Sep 2026',
      short: 'Weekday · Tue 8 Sep',
      kind: 'typical',
    });
  });

  it('explains a special day by its schedules', () => {
    expect(describe_('20260910')).toMatchObject({
      title: 'Special day · Thu 10 Sep 2026',
      kind: 'special',
    });
    expect(describe_('20260910').note).toMatch(
      /^Sunday schedule before, Weekday schedule after\. The two feeds run this day differently/,
    );
    expect(describe_('20260907').note).toBe(
      'Runs the Sunday schedule in both feeds. Its changes are those of the typical Sunday.',
    );
  });

  it('describes any other date by its kind', () => {
    expect(describe_('20260909')).toMatchObject({
      title: 'Wed 9 Sep 2026',
      note: 'Runs the typical Weekday schedule in both feeds: the same changes as the Weekday view.',
    });
    expect(describe_('20260914').note).toMatch(/^Only one feed covers/);
  });

  it('pairs two dates across periods', () => {
    expect(describe_('20260824~20261110')).toMatchObject({
      title: 'Mon 24 Aug 2026 → Tue 10 Nov 2026',
      kind: 'period',
    });
  });
});

describe('helpers', () => {
  it('groups days of the week', () => {
    expect(dayGroupOf('20260912')).toBe('saturday');
    expect(dayGroupOf('20260913')).toBe('sunday');
    expect(dayGroupOf('20260914')).toBe('weekday');
  });

  it('says when a group of days falls', () => {
    expect(whenText(['20260907'])).toBe('Mon 7 Sep 2026');
    expect(whenText(['20260903', '20260910', '20260917', '20260924'])).toBe(
      'Weekdays · 3 Sep – 24 Sep · 4 days',
    );
    expect(whenText(['20261224', '20261226'])).toBe(
      'Weekdays and Saturdays · 24 Dec, 26 Dec',
    );
  });

  it('lists a few dates, or a range', () => {
    expect(datesText(['20261224', '20261231'])).toBe('24 Dec, 31 Dec');
    expect(datesText(['20260701', '20260702', '20260703', '20260831'])).toBe(
      '1 Jul – 31 Aug · 4 days',
    );
  });
});

describe('feeds where no day pattern repeats', () => {
  // Every date its own service set, as in some generated feeds.
  const unique: Record<string, [number, number]> = {
    '20260610': [0, 0],
    '20260611': [1, 1],
    '20260612': [2, 2],
  };
  const doc1 = {
    dates: unique,
    day_types: [
      {
        id: 'weekday',
        label: 'Weekday',
        date: '20260612',
        day_count: 1,
        group_count: 3,
        first: '20260612',
        last: '20260612',
        primary: true,
      },
    ],
  };
  const c = dayCatalog(doc1);

  it('lists no special days and marks dates as their own', () => {
    expect(c.repeats).toBe(false);
    expect(c.special).toEqual([]);
    expect(c.kindOf['20260610']).toBe('unique');
    expect(c.kindOf['20260612']).toBe('typical');
  });

  it('says the typical day is the busiest, not a shared schedule', () => {
    expect(describeDay('20260612', doc1, c, []).title).toBe(
      'Busiest Weekday · Fri 12 Jun 2026',
    );
    expect(describeDay('20260612', doc1, c, []).note).toBe(
      'No two weekdays run the same set of services in this feed, so this is the weekday with the most trips. Other weekdays may differ: pick them on the calendar.',
    );
  });
});
