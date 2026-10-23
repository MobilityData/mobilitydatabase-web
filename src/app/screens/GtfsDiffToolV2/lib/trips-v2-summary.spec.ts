import type { CompactTrip } from './trips-types';
import { buildRouteDir, matchRouteDirection } from './trips-utils';
import {
  dayChips,
  daySummary,
  duration,
  mainChange,
  patternsCaption,
  periodFor,
  routeChips,
  routeRowSummary,
  technicalSummary,
  tripBadge,
  tripExplanation,
  tripStopRows,
} from './trips-v2-summary';

const MIN = 60;
const NAMES = { A: 'Lakeshore', B: 'Pine Ave', C: 'Harbour St', D: 'Peel St' };

/** Trip departing at `start` (minutes), `steps` minutes between stops. */
function trip(
  id: string,
  start: number,
  opts: Partial<CompactTrip> & { steps?: number[] } = {},
): CompactTrip {
  const { steps: s, ...rest } = opts;
  const stops = rest.stops ?? ['A', 'B', 'C', 'D'];
  const steps = s ?? stops.map(() => 2);
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
    ...rest,
  };
}

function route(base: CompactTrip[], next: CompactTrip[]) {
  return buildRouteDir('R1', '0', base, next, 60);
}

describe('formatting', () => {
  it('formats unsigned durations', () => {
    expect(duration(240)).toBe('4 min');
    expect(duration(-45)).toBe('45 s');
    expect(duration(90)).toBe('1 min 30 s');
  });

  it('finds the period for a range', () => {
    expect(periodFor([7, 9])?.label).toBe('AM peak');
    expect(periodFor(null)?.id).toBe('all');
    expect(periodFor([7, 8])).toBeNull();
  });
});

describe('route summaries', () => {
  // First trip removed, every remaining trip 4 min slower between C and D,
  // one late trip added, and one trip only renamed.
  const base = [
    trip('b1', 5 * 60),
    trip('b2', 7 * 60),
    trip('b3', 8 * 60),
    trip('b4', 12 * 60),
  ];
  const next = [
    trip('b2', 7 * 60, { steps: [2, 2, 6] }),
    trip('b3', 8 * 60, { steps: [2, 2, 6] }),
    trip('n4', 12 * 60),
    trip('n5', 23 * 60),
  ];
  const r = route(base, next);

  it('writes the main change in rider terms', () => {
    expect(mainChange(r, NAMES)).toBe(
      'First trip removed. AM peak running time 4 min longer. Late trip added at 23:00.',
    );
  });

  it('counts changed trips and the largest running-time change', () => {
    const s = routeRowSummary(r, NAMES);
    expect(s.changedTrips).toBe(4);
    expect(s.totalTrips).toBe(5);
    expect(s.runningMax).toBe(4 * MIN);
  });

  it('builds the route chips, ID-only trips last', () => {
    expect(routeChips(r).map((c) => c.label)).toEqual([
      'Trips per day: 4',
      '1 trip removed',
      '1 trip added',
      '2 trips with longer running time, +4 min',
      '1 trip restructured, trip_id only',
    ]);
  });

  it('summarises the day across routes', () => {
    const quiet = buildRouteDir(
      'R2',
      '0',
      [trip('q1', 9 * 60, { route: 'R2' })],
      [trip('q1', 9 * 60, { route: 'R2' })],
      60,
    );
    const day = {
      date: '20261022',
      services: { base: ['WK'], new: ['WK'] },
      routes: [r, quiet],
      class_counts: r.class_counts,
      minor_count: 0,
      trips: { base: 5, new: 5 },
    };
    const s = daySummary(day);
    expect(s).toMatchObject({
      routes: { total: 2, changed: 1 },
      added: 1,
      removed: 1,
      retimedRoutes: 1,
      idOnly: 1,
      quietRouteDirs: 1,
    });
    expect(dayChips(s).map((c) => c.label)).toEqual([
      '1 of 2 routes changed',
      '1 trip added',
      '1 trip removed',
      '1 route retimed',
      '1 trip restructured, trip_id only',
    ]);
  });

  it('lists ID-only trip_id mappings in the technical summary', () => {
    const t = technicalSummary(r.pairs);
    expect(t.idOnly).toBe(1);
    expect(t.mapping).toEqual(['b4 → n4']);
    expect(t.frequencyTrips).toBe(0);
    expect(t.fields.every((f) => f.changes === 0)).toBe(true);
  });
});

describe('stop patterns', () => {
  it('names a new stop served by every trip', () => {
    const r = route(
      [trip('a', 7 * 60), trip('b', 8 * 60)],
      [
        trip('a', 7 * 60, { stops: ['A', 'B', 'X', 'C', 'D'] }),
        trip('b', 8 * 60, { stops: ['A', 'B', 'X', 'C', 'D'] }),
      ],
    );
    expect(mainChange(r, { ...NAMES, X: 'Elm St' })).toMatch(
      /^New stop Elm St on every trip\./,
    );
    expect(patternsCaption(r)).toBe(
      '2 stop patterns: 1 new, 1 no longer used.',
    );
  });

  it('treats a stop dropped and added under the same name as a new stop_id', () => {
    const names = { ...NAMES, B2: 'Pine Ave' };
    const r = route(
      [trip('a', 7 * 60), trip('b', 8 * 60)],
      [
        trip('a', 7 * 60, { stops: ['A', 'B2', 'C', 'D'] }),
        trip('b', 8 * 60, { stops: ['A', 'B2', 'C', 'D'] }),
      ],
    );
    expect(mainChange(r, names)).toBe(
      'Same stop under new stop_ids: Pine Ave.',
    );
    expect(tripExplanation(r.pairs[0], names)).toBe(
      'Pine Ave is the same stop under a new stop_id.',
    );
  });

  it('reads a removed and an added trip at the same time as a replacement', () => {
    const r = route(
      [trip('a', 7 * 60), trip('b', 8 * 60)],
      [trip('a', 7 * 60), trip('b2', 8 * 60, { stops: ['X', 'Y', 'Z'] })],
    );
    expect(mainChange(r, NAMES)).toBe(
      'Trip at 08:00 replaced by one on a different stop pattern.',
    );
  });

  it('counts a stop a loop visits twice once per trip', () => {
    const loop = ['A', 'B', 'C', 'A'];
    const withX = ['A', 'X', 'B', 'C', 'A', 'X'];
    const r = route(
      [trip('a', 7 * 60, { stops: loop }), trip('b', 8 * 60, { stops: loop })],
      [
        trip('a', 7 * 60, { stops: withX }),
        trip('b', 8 * 60, { stops: withX }),
      ],
    );
    expect(mainChange(r, { ...NAMES, X: 'Elm St' })).toMatch(
      /^New stop Elm St on every trip\./,
    );
  });

  it('reports an unchanged single pattern', () => {
    const r = route([trip('a', 7 * 60)], [trip('a', 7 * 60)]);
    expect(patternsCaption(r)).toBe('1 stop pattern, unchanged.');
  });
});

describe('trip explanations', () => {
  it('explains a running-time change on one segment', () => {
    const r = route(
      [trip('a', 15 * 60)],
      [trip('a', 15 * 60, { steps: [2, 2, 6] })],
    );
    const p = r.pairs[0];
    expect(tripBadge(p)).toBe('+4 min run');
    expect(tripExplanation(p, NAMES)).toBe(
      'Same departure time. The ride from Harbour St to Peel St takes 4 min longer, so later stops are 4 min later.',
    );
    expect(tripStopRows(p).map((row) => row.change)).toEqual([
      'No change',
      'No change',
      'No change',
      '+4 min',
    ]);
  });

  it('explains shifted, removed and ID-only trips', () => {
    const r = route(
      [trip('s', 7 * 60), trip('gone', 5 * 60), trip('old', 9 * 60)],
      [trip('s', 7 * 60 + 2), trip('new', 9 * 60)],
    );
    const by = (id: string) =>
      r.pairs.find((p) => (p.base ?? p.new)?.id === id)!;
    expect(tripBadge(by('s'))).toBe('+2 min');
    expect(tripExplanation(by('s'), NAMES)).toBe(
      'Every stop is 2 min later. The running time is unchanged.',
    );
    expect(tripExplanation(by('gone'), NAMES)).toBe(
      'This trip no longer runs. It left Lakeshore at 05:00.',
    );
    expect(tripBadge(by('old'))).toBe('ID only');
    expect(tripExplanation(by('old'), NAMES)).toBe(
      'Same times, stops and attributes. Only the trip_id changed (old → new).',
    );
  });
});

describe('trips that kept their trip_id but changed a lot', () => {
  // Same id, but 3 h later and on other stops: no semantic pass pairs them.
  const base = [trip('x1', 7 * 60)];
  const next = [trip('x1', 10 * 60, { stops: ['A', 'Q', 'R', 'S'] })];

  it('pairs them by trip_id in the day views, as a weak match', () => {
    const r = route(base, next);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0].method).toBe('same_id');
    expect(routeChips(r).map((c) => c.label)).toContain(
      '1 trip matched only by trip_id',
    );
    expect(technicalSummary(r.pairs).weakMatches).toBe(1);
  });

  it('leaves the build-time matcher unchanged', () => {
    const pairs = matchRouteDirection(base, next);
    expect(pairs.map((p) => p.method)).toEqual([null, null]);
  });
});
