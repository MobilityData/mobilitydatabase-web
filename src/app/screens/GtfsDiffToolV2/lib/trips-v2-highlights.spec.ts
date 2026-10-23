import type { RawTable } from './entity-diff-types';
import {
  allHighlights,
  topHighlights,
  type HighlightInput,
  type HighlightSignals,
} from './trips-v2-highlights';

function table(file: string, counts: Partial<RawTable['counts']>): RawTable {
  return {
    file,
    path: `raw/${file}.parquet`,
    rows: 0,
    bytes: 0,
    columns: [],
    counts: {
      added: 0,
      deleted: 0,
      modified: 0,
      id_only: 0,
      unchanged: 0,
      ...counts,
    },
  };
}

const quiet: HighlightSignals = {
  routeTrips: [{ route: 'A', base: 100, new: 100 }],
  wheelchair: { lost: 0, gained: 0 },
  bikes: { lost: 0, gained: 0 },
  pickup: { lost: 0, gained: 0 },
  dropOff: { lost: 0, gained: 0 },
};

const ids = (input: HighlightInput): string[] =>
  allHighlights(input).map((h) => h.id);

describe('trips highlights', () => {
  it('finds nothing in a feed without regressions', () => {
    expect(
      allHighlights({
        trips: table('trips.txt', { unchanged: 100 }),
        signals: quiet,
      }),
    ).toEqual([]);
  });

  it('flags routes that lose every trip, naming them', () => {
    const [h] = allHighlights({
      signals: {
        ...quiet,
        routeTrips: [
          { route: 'R1', base: 12, new: 0 },
          { route: 'R2', base: 3, new: 0 },
        ],
      },
      routeName: (id) => `Line ${id}`,
    });
    expect(h.id).toBe('routes_dropped');
    expect(h.severity).toBe('error');
    expect(h.title).toBe('2 routes lose all their trips');
    expect(h.detail).toContain('Line R1, Line R2');
  });

  it('reports the deepest route cut, ignoring small or shallow ones', () => {
    const signals = {
      ...quiet,
      routeTrips: [
        { route: 'big', base: 200, new: 100 }, // −50%
        { route: 'small', base: 8, new: 2 }, // base under the minimum
        { route: 'shallow', base: 100, new: 90 }, // −10%
        { route: 'other', base: 50, new: 35 }, // −30%
      ],
    };
    const h = allHighlights({ signals }).find((x) => x.id === 'route_cut');
    expect(h?.title).toBe('Route big loses 50% of its trips');
    expect(h?.detail).toContain('1 other route also lose 20% or more');
  });

  it('flags accessibility and boarding regressions', () => {
    const found = ids({
      signals: {
        ...quiet,
        wheelchair: { lost: 12, gained: 3 },
        pickup: { lost: 5, gained: 0 },
        dropOff: { lost: 7, gained: 0 },
        bikes: { lost: 0, gained: 9 },
      },
    });
    expect(found).toEqual(['wheelchair_lost', 'boarding_restricted']);
  });

  it('finds a gap between the feeds and a shorter horizon', () => {
    expect(
      ids({
        coverage: {
          base: { min: '20260724', max: '20260905' },
          new: { min: '20261012', max: '20261212' },
        },
      }),
    ).toEqual(['service_gap']);
    // Sat 5 Sep → Tue 8 Sep: Sunday and Monday have no published service.
    expect(
      allHighlights({
        coverage: {
          base: { min: '20260724', max: '20260905' },
          new: { min: '20260908', max: '20261212' },
        },
      })[0].title,
    ).toBe("2 days between the two feeds' service");
    // Only 1 day: under the threshold.
    expect(
      ids({
        coverage: {
          base: { min: '20260724', max: '20260905' },
          new: { min: '20260907', max: '20261212' },
        },
      }),
    ).toEqual([]);
    expect(
      ids({
        coverage: {
          base: { min: '20260101', max: '20261231' },
          new: { min: '20260101', max: '20261130' },
        },
      }),
    ).toEqual(['shorter_horizon']);
  });

  it('weighs trip removals by whether the timetable shrinks', () => {
    const cut = allHighlights({
      trips: table('trips.txt', { deleted: 20, unchanged: 80 }),
    })[0];
    const replaced = allHighlights({
      trips: table('trips.txt', { deleted: 20, added: 40, unchanged: 80 }),
    })[0];
    expect(cut.id).toBe('trips_removed');
    expect(replaced.score).toBeLessThan(cut.score);
    expect(replaced.detail).toContain('still grows');
  });

  it('flags widespread retiming from the arrival_time column share', () => {
    const h = allHighlights({
      stopTimes: table('stop_times.txt', { modified: 400, unchanged: 600 }),
      stopTimeColumns: [{ column: 'arrival_time', rows: 300 }],
    });
    expect(h.map((x) => x.id)).toEqual(['retimed']);
    expect(h[0].detail).toContain('30%');
  });

  it('keeps the three most concerning', () => {
    const top = topHighlights({
      trips: table('trips.txt', { deleted: 20, unchanged: 80 }),
      stopTimes: table('stop_times.txt', { modified: 400, unchanged: 600 }),
      stopTimeColumns: [{ column: 'arrival_time', rows: 300 }],
      signals: {
        ...quiet,
        routeTrips: [
          { route: 'gone', base: 10, new: 0 },
          { route: 'cut', base: 100, new: 40 },
        ],
        wheelchair: { lost: 4, gained: 0 },
      },
    });
    expect(top.map((h) => h.id)).toEqual([
      'routes_dropped',
      'wheelchair_lost',
      'route_cut',
    ]);
  });

  it('says what each highlight expands to', () => {
    const all = allHighlights({
      trips: table('trips.txt', { deleted: 20, unchanged: 80 }),
      stopTimes: table('stop_times.txt', { modified: 400, unchanged: 600 }),
      stopTimeColumns: [{ column: 'arrival_time', rows: 300 }],
      signals: {
        ...quiet,
        routeTrips: [
          { route: 'gone', base: 10, new: 0 },
          { route: 'cut', base: 100, new: 40 },
        ],
        pickup: { lost: 2, gained: 0 },
      },
      coverage: {
        base: { min: '20260101', max: '20260105' },
        new: { min: '20260110', max: '20260120' },
      },
    });
    const by = Object.fromEntries(all.map((h) => [h.id, h.entities]));
    expect(by.routes_dropped).toEqual({
      kind: 'routes',
      routes: [{ route: 'gone', base: 10, new: 0 }],
    });
    expect(by.route_cut?.kind).toBe('routes');
    expect(by.boarding_restricted).toEqual({
      kind: 'rows',
      file: 'stop_times.txt',
      filters: { actions: ['modified'], predicate: 'boarding_lost' },
      count: 2,
    });
    expect(by.trips_removed).toMatchObject({
      file: 'trips.txt',
      filters: { actions: ['deleted'] },
      count: 20,
    });
    expect(by.retimed).toMatchObject({
      filters: { actions: ['modified'], changedColumn: 'arrival_time' },
      count: 300,
    });
    expect(by.service_gap?.kind).toBe('dates');
  });
});
