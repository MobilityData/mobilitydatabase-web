import type { CompactTrip, TripsDiffDoc } from './trips-types';
import {
  anchorDates,
  anchorKey,
  anchorSetIndices,
  feedCoverage,
  isCrossPeriod,
  periodDayTypes,
  sharedServiceDays,
} from './trips-anchor';
import { classifyPair, computeDayDiff, servicesForDate } from './trips-utils';

function trip(
  id: string,
  service: string,
  start = 420,
  block = '',
): CompactTrip {
  const times = [0, 2, 4].map((m) => (start + m) * 60);
  return {
    id,
    route: 'R1',
    service,
    dir: '0',
    headsign: 'Downtown',
    attrs: block ? { block_id: block } : {},
    stops: ['A', 'B', 'C'],
    arr: times,
    dep: times,
    pickup: '000',
    dropoff: '000',
  };
}

/** Summer base feed (Jul–Aug) vs fall new feed (Oct): no shared dates. */
const doc: TripsDiffDoc = {
  metadata: {
    schema_version: 't',
    generated_at: '',
    base_feed: { source: 'b', downloaded_at: '' },
    new_feed: { source: 'n', downloaded_at: '' },
  },
  routes: {},
  stops: {},
  service_sets: { base: [['SUM-WK'], ['SUM-SA']], new: [['FALL-WK']] },
  dates: {
    // Tue, Wed, Thu in July; a Saturday in August.
    '20260714': [0, -1],
    '20260715': [0, -1],
    '20260716': [0, -1],
    '20260801': [1, -1],
    // Tue, Wed in October.
    '20261013': [-1, 0],
    '20261014': [-1, 0],
  },
  day_types: [],
  feeds: {
    base: { trips: [trip('76509921', 'SUM-WK', 420, 'C01-18')] },
    new: { trips: [trip('77745105', 'FALL-WK', 420, 'C01-6')] },
  },
};

describe('anchor keys', () => {
  it('collapses one date and pairs two', () => {
    expect(anchorKey('20260714', '20260714')).toBe('20260714');
    expect(anchorKey('20260714', '20261013')).toBe('20260714~20261013');
    expect(anchorDates('20260714~20261013')).toEqual({
      base: '20260714',
      new: '20261013',
    });
    expect(isCrossPeriod('20260714')).toBe(false);
  });

  it('resolves each side from its own date', () => {
    expect(anchorSetIndices(doc, '20260715~20261013')).toEqual([0, 0]);
    expect(servicesForDate(doc, '20260715~20261013')).toEqual({
      base: ['SUM-WK'],
      new: ['FALL-WK'],
    });
  });
});

describe('periods with no shared dates', () => {
  it('pairs the typical day of each period', () => {
    expect(sharedServiceDays(doc)).toBe(0);
    const types = periodDayTypes(doc);
    expect(types.map((t) => [t.label, t.key])).toEqual([
      ['Weekday', '20260715~20261014'],
    ]);
    expect(types[0].base).toMatchObject({ day_count: 3, group_count: 3 });
    expect(feedCoverage(doc).new).toEqual({ min: '20261013', max: '20261014' });
  });

  it('matches renumbered trips across periods instead of adding/removing all', () => {
    const day = computeDayDiff(doc, '20260715~20261013', 60);
    expect(day.trips).toEqual({ base: 1, new: 1 });
    expect(day.routes[0].pairs).toHaveLength(1);
    expect(day.routes[0].pairs[0]).toMatchObject({
      cls: 'restructured',
      id_changed: true,
    });
  });
});

describe('block_id', () => {
  it('is an identifier: a block_id-only change is ID only, not attributes', () => {
    const p = classifyPair(
      {
        route: 'R1',
        dir: '0',
        base: trip('t1', 'S', 420, 'C01-18'),
        new: trip('t1', 'S', 420, 'C01-6'),
        method: 'same_pattern',
      },
      60,
    );
    expect(p.cls).toBe('restructured');
    expect(p.attr_changes).toEqual([]);
    expect(p.id_attr_changes).toEqual([
      { field: 'block_id', base_value: 'C01-18', new_value: 'C01-6' },
    ]);
  });
});
