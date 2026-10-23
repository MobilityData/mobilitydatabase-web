import type { CompactTrip, TripsDiffDoc } from './trips-types';
import {
  type TripsIndexDoc,
  hasTripTables,
  isByRoute,
  routeDayCounts,
  tripsQuery,
  withTrips,
} from './trips-shards';
import { computeDayDiff, servicesForDate } from './trips-utils';

function trip(id: string, service: string): CompactTrip {
  return {
    id,
    route: 'R1',
    service,
    dir: '0',
    headsign: 'Downtown',
    attrs: {},
    stops: ['A', 'B'],
    arr: [420 * 60, 425 * 60],
    dep: [420 * 60, 425 * 60],
    pickup: '00',
    dropoff: '00',
  };
}

const index: TripsIndexDoc = {
  metadata: {
    schema_version: 't',
    generated_at: '',
    base_feed: { source: 'b', downloaded_at: '' },
    new_feed: { source: 'n', downloaded_at: '' },
  },
  routes: {},
  stops: {},
  service_sets: { base: [['WK', 'X']], new: [['WK2']] },
  dates: { '20260915': [0, 0] },
  day_types: [],
  feeds: { base: { trips: [] }, new: { trips: [] } },
  trip_tables: { base: 'trips/base.parquet', new: 'trips/new.parquet' },
};

describe('trip tables', () => {
  it('recognises an index whose trips live in Parquet', () => {
    expect(hasTripTables(index)).toBe(true);
    const { trip_tables: _t, ...inline } = index;
    expect(hasTripTables(inline as TripsDiffDoc)).toBe(false);
  });

  it('queries only the services running that day, bound as parameters', () => {
    const services = servicesForDate(index, '20260915');
    expect(tripsQuery('raw_3', services.base)).toEqual({
      sql: 'SELECT trip FROM "raw_3" WHERE service IN (?, ?) ORDER BY ord',
      params: ['WK', 'X'],
    });
    expect(tripsQuery('raw_3', [])).toBeNull();
    expect(() => tripsQuery('x"; drop', ['WK'])).toThrow();
  });

  it('rebuilds a day document the day diff can use', () => {
    const doc = withTrips(index, {
      base: [trip('a1', 'WK')],
      new: [trip('b1', 'WK2')],
    });
    expect('trip_tables' in doc).toBe(false);
    const day = computeDayDiff(doc, '20260915', 60);
    expect(day.trips).toEqual({ base: 1, new: 1 });
    expect(day.routes[0].pairs[0]).toMatchObject({ cls: 'restructured' });
  });

  it('reads one route of a day for by-route tables', () => {
    expect(tripsQuery('raw_3', ['X', 'WK'], 'R1')).toEqual({
      sql: 'SELECT trip FROM "raw_3" WHERE route = ? AND service IN (?, ?) ORDER BY ord',
      params: ['R1', 'WK', 'X'],
    });
  });
});

describe('by-route datasets', () => {
  const byRoute: TripsIndexDoc = {
    ...index,
    trip_tables: { ...index.trip_tables!, by_route: true },
    route_service_trips: {
      base: { R1: { WK: 10, X: 2, SAT: 5 }, R2: { WK: 4 } },
      new: { R1: { WK2: 12 }, R3: { WK2: 1, SUN: 9 } },
    },
  };

  it('is recognised from its trip tables', () => {
    expect(isByRoute(byRoute)).toBe(true);
    expect(isByRoute(index)).toBe(false);
  });

  it('counts the trips each route runs on a day, largest change first', () => {
    const counts = routeDayCounts(
      byRoute,
      servicesForDate(byRoute, '20260915'),
    );
    expect(counts).toEqual([
      { route: 'R2', base: 4, new: 0 },
      { route: 'R3', base: 0, new: 1 },
      { route: 'R1', base: 12, new: 12 },
    ]);
  });
});
