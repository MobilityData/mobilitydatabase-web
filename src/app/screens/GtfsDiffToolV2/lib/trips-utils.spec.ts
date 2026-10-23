import type { CompactTrip, TripsDiffDoc } from './trips-types';
import {
  alignStops,
  assign,
  buildRouteDir,
  classifyPair,
  computeDayDiff,
  formatDelta,
  formatTime,
  matchRouteDirection,
  mergeStopOrder,
  peakHeadway,
  ruleChangeText,
  stopBoard,
  timetableColumns,
} from './trips-utils';

const MIN = 60;

/** Trip departing at `start` (minutes), `step` minutes between stops. */
function trip(
  id: string,
  start: number,
  stops: string[] = ['A', 'B', 'C', 'D'],
  opts: Partial<CompactTrip> & { step?: number[] } = {},
): CompactTrip {
  const steps = opts.step ?? stops.map(() => 2);
  let t = start * MIN;
  const times = stops.map((_, i) => {
    if (i > 0) t += steps[i - 1] * MIN;
    return t;
  });
  return {
    id,
    route: 'R1',
    service: 'WK',
    dir: '0',
    headsign: 'Downtown',
    attrs: {},
    stops,
    arr: times,
    dep: times,
    pickup: '0'.repeat(stops.length),
    dropoff: '0'.repeat(stops.length),
    ...opts,
  };
}

describe('formatting', () => {
  it('wraps times past midnight', () => {
    expect(formatTime(7 * 3600 + 5 * 60)).toBe('07:05');
    expect(formatTime(24 * 3600 + 15 * 60)).toBe('00:15');
  });
  it('formats deltas', () => {
    expect(formatDelta(180)).toBe('+3 min');
    expect(formatDelta(-45)).toBe('−45 s');
    expect(formatDelta(90)).toBe('+1 min 30 s');
  });
});

describe('alignStops', () => {
  it('marks only the inserted stop, not every downstream stop', () => {
    const ops = alignStops(['A', 'B', 'C'], ['A', 'X', 'B', 'C']);
    expect(ops.map((o) => o.op)).toEqual(['keep', 'add', 'keep', 'keep']);
    expect(ops[2]).toMatchObject({ stop_id: 'B', bi: 1, ni: 2 });
  });

  it('merges patterns into a supersequence', () => {
    const order = mergeStopOrder([
      ['A', 'B', 'C', 'D'],
      ['A', 'C', 'E'],
    ]);
    expect(order).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

describe('assign', () => {
  const cost = (x: number, y: number): number | null =>
    Math.abs(x - y) <= 10 ? Math.abs(x - y) : null;

  it('does not cascade when a trip is inserted (greedy would)', () => {
    // New feed inserts a departure at 12; every other trip is unchanged.
    const pairs = assign([0, 20, 40], [0, 12, 20, 40], cost, 10);
    expect(pairs).toEqual([
      [0, 0],
      [1, 2],
      [2, 3],
    ]);
  });

  it('pairs a uniformly shifted timetable one-to-one', () => {
    const pairs = assign([0, 8, 16, 24], [3, 11, 19, 27], cost, 10);
    expect(pairs).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });
});

describe('matchRouteDirection', () => {
  it('matches semantically even when every trip_id changed', () => {
    const base = [trip('a1', 360), trip('a2', 380)];
    const next = [trip('b1', 363), trip('b2', 383)];
    const m = matchRouteDirection(base, next);
    expect(m.map((x) => [x.base?.id, x.new?.id, x.method])).toEqual([
      ['a1', 'b1', 'same_pattern'],
      ['a2', 'b2', 'same_pattern'],
    ]);
  });

  it('pairs leftovers across patterns, and reports the rest', () => {
    const base = [trip('a1', 360), trip('a2', 600)];
    const next = [trip('b1', 361, ['A', 'B', 'X', 'C', 'D'])];
    const m = matchRouteDirection(base, next);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ method: 'cross_pattern' });
    expect(m[1]).toMatchObject({ new: null });
    expect(m[1].base?.id).toBe('a2');
  });
});

describe('classifyPair', () => {
  const classify = (b: CompactTrip | null, n: CompactTrip | null) =>
    classifyPair({ route: 'R1', dir: '0', base: b, new: n, method: null }, 60);

  it('reports a uniform shift once', () => {
    const p = classify(trip('a', 360), trip('a', 363));
    expect(p.cls).toBe('shifted');
    expect(p.shift).toBe(180);
    expect(p.segments).toHaveLength(0);
  });

  it('dims shifts within the minor threshold', () => {
    const p = classify(trip('a', 360), trip('a', 361));
    expect(p).toMatchObject({ cls: 'shifted', minor: true });
  });

  it('lets a minor shift yield to a real change', () => {
    const p = classify(
      trip('a', 360),
      trip('a', 361, undefined, { headsign: 'Uptown' }),
    );
    expect(p).toMatchObject({ cls: 'attributes', minor: false });
    expect(p.flags).toContain('shifted');
  });

  it('flags only the segments whose running time changed', () => {
    const p = classify(
      trip('a', 360),
      trip('a', 360, undefined, { step: [2, 5, 2] }),
    );
    expect(p.cls).toBe('running_time');
    expect(p.segments).toEqual([{ from: 'B', to: 'C', base: 120, new: 300 }]);
    expect(p.running_delta).toBe(180);
  });

  it('classifies stop changes as pattern changes', () => {
    const p = classify(trip('a', 360), trip('a', 360, ['A', 'B', 'D']));
    expect(p.cls).toBe('pattern');
  });

  it('turns pickup changes into plain language', () => {
    const p = classify(
      trip('a', 360),
      trip('a', 360, undefined, { pickup: '0100' }),
    );
    expect(p.cls).toBe('rules');
    expect(ruleChangeText(p.rules[0], 'Main St')).toBe(
      'No longer picks up at Main St',
    );
  });

  it('collapses id-only changes into restructured', () => {
    const p = classify(trip('a', 360), trip('z', 360));
    expect(p).toMatchObject({ cls: 'restructured', id_changed: true });
  });

  it('treats identical trips as unchanged', () => {
    expect(classify(trip('a', 360), trip('a', 360)).cls).toBe('unchanged');
  });
});

describe('route aggregation', () => {
  it('derives verdicts, patterns and headways', () => {
    const base = [0, 10, 20, 30].map((m) => trip(`a${m}`, 420 + m));
    const next = [0, 15, 30].map((m) => trip(`a${m}`, 420 + m));
    const r = buildRouteDir('R1', '0', base, next, 60);
    expect(r.trips).toEqual({ base: 4, new: 3 });
    expect(r.verdicts).toContain('less_service');
    expect(r.peak_headway).toEqual({ base: 10, new: 15 });
    expect(r.patterns).toHaveLength(1);
  });

  it('computes peak headway from frequency windows', () => {
    const t = trip('f', 360, undefined, {
      freq: [[6 * 3600, 7 * 3600, 600, '0']],
    });
    expect(peakHeadway([t])).toBe(10);
  });

  it('folds runs of unchanged trips', () => {
    const trips = [0, 10, 20, 30, 40].map((m) => trip(`a${m}`, 420 + m));
    const next = trips.map((t, i) => (i === 2 ? trip(t.id, 420 + 20 + 5) : t));
    const r = buildRouteDir('R1', '0', trips, next, 60);
    const cols = timetableColumns(r.pairs, new Set());
    expect(cols.map((c) => c.kind)).toEqual([
      'trip',
      'trip',
      'trip',
      'trip',
      'trip',
    ]);
    const longer = [
      ...r.pairs,
      ...r.pairs
        .slice(3)
        .map((p) => ({ ...p, key: `${p.key}x`, time: p.time + 3600 })),
    ];
    expect(timetableColumns(longer, new Set()).map((c) => c.kind)).toEqual([
      'trip',
      'trip',
      'trip',
      'fold',
    ]);
  });
});

describe('day diff', () => {
  const doc: TripsDiffDoc = {
    metadata: {
      schema_version: 't',
      generated_at: '',
      base_feed: { source: 'b', downloaded_at: '' },
      new_feed: { source: 'n', downloaded_at: '' },
    },
    routes: {},
    stops: {},
    service_sets: { base: [['WK']], new: [['WK2']] },
    dates: { '20260915': [0, 0] },
    day_types: [],
    feeds: {
      base: { trips: [trip('a1', 420), trip('a2', 440)] },
      new: {
        trips: [
          trip('b1', 423, undefined, { service: 'WK2' }),
          trip('b2', 443, ['A', 'B', 'D'], { service: 'WK2' }),
        ],
      },
    },
  };

  it('matches across a service_id rename', () => {
    const day = computeDayDiff(doc, '20260915', 60);
    expect(day.routes).toHaveLength(1);
    const [p1, p2] = day.routes[0].pairs;
    expect(p1).toMatchObject({ cls: 'shifted', service_changed: true });
    expect(p2.cls).toBe('pattern');
  });

  it('builds a stop departure board', () => {
    const day = computeDayDiff(doc, '20260915', 60);
    const board = stopBoard(day, 'C', 60);
    expect(board.map((e) => e.status)).toEqual(['retimed', 'no_longer_stops']);
  });
});
