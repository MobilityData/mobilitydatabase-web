import { parseRange } from './http-range';
import {
  DEFAULT_ACTIONS,
  buildWhere,
  columnStatsQuery,
  countsQuery,
  gtfsColumns,
  pageQuery,
  toRawDiffRow,
  predicateSql,
} from './raw-diff-query';

const COLUMNS = ['trip_id', 'stop_id', 'stop_sequence', 'departure_time'];

describe('raw diff SQL', () => {
  it('binds every filter as a parameter', () => {
    const w = buildWhere(
      {
        actions: DEFAULT_ACTIONS,
        routeId: '1',
        tripId: "7650'; DROP",
        stopId: '64',
        changedColumn: 'departure_time',
        search: 'Harvard',
      },
      COLUMNS,
    );
    expect(w.sql).toBe(
      'action IN (?, ?, ?) AND route_id = ? AND (base_trip_id ILIKE ? OR new_trip_id ILIKE ?) AND (b_stop_id = ? OR n_stop_id = ?) AND list_contains(string_split(changed, \',\'), ?) AND concat_ws(\'|\', "b_trip_id", "n_trip_id", "b_stop_id", "n_stop_id", "b_stop_sequence", "n_stop_sequence", "b_departure_time", "n_departure_time") ILIKE ?',
    );
    expect(w.params).toEqual([
      'added',
      'deleted',
      'modified',
      '1',
      "%7650'; DROP%",
      "%7650'; DROP%",
      '64',
      '64',
      'departure_time',
      '%Harvard%',
    ]);
  });

  it('ignores filters that do not apply to the table', () => {
    const w = buildWhere(
      { actions: ['id_only'], stopId: '64', changedColumn: 'nope' },
      ['trip_id', 'route_id'],
    );
    expect(w).toEqual({ sql: 'action IN (?)', params: ['id_only'] });
    expect(buildWhere({ actions: [] }, COLUMNS).sql).toBe('FALSE');
  });

  it('pages in file order unless a known column is sorted', () => {
    const q = pageQuery(
      'raw_0',
      { actions: ['added'] },
      COLUMNS,
      null,
      200,
      100,
    );
    expect(q.sql).toBe(
      'SELECT * FROM "raw_0" WHERE action IN (?) ORDER BY route_id NULLS LAST, trip_key, seq LIMIT 100 OFFSET 200',
    );
    expect(
      pageQuery(
        'raw_0',
        { actions: ['added'] },
        COLUMNS,
        { column: 'departure_time', desc: true },
        0,
        50,
      ).sql,
    ).toContain(
      'ORDER BY coalesce("n_departure_time", "b_departure_time") DESC',
    );
    expect(() =>
      pageQuery('raw_0', { actions: [] }, ['x;drop'], null, 0, 10),
    ).not.toThrow();
    expect(
      pageQuery(
        'raw_0',
        { actions: [] },
        COLUMNS,
        { column: 'x"; drop', desc: false },
        0,
        10,
      ).sql,
    ).toContain('ORDER BY route_id NULLS LAST');
  });

  it('counts per action without the action filter', () => {
    expect(
      countsQuery('raw_0', { actions: ['added'], routeId: '1' }, COLUMNS),
    ).toEqual({
      sql: 'SELECT action, count(*)::INTEGER AS n FROM "raw_0" WHERE route_id = ? GROUP BY action',
      params: ['1'],
    });
  });

  it('counts changed columns of modified rows under the other filters', () => {
    const q = columnStatsQuery(
      'raw_0',
      { actions: ['added'], tripId: 'T1' },
      COLUMNS,
    );
    expect(q.sql).toBe(
      "SELECT col, count(*)::INTEGER AS n FROM (SELECT unnest(string_split(changed, ',')) AS col FROM \"raw_0\" WHERE (base_trip_id ILIKE ? OR new_trip_id ILIKE ?) AND action = 'modified') GROUP BY col ORDER BY n DESC, col",
    );
    expect(q.params).toEqual(['%T1%', '%T1%']);
  });

  it('reads the GTFS columns and rows back', () => {
    const schema = [
      'action',
      'route_id',
      'b_trip_id',
      'n_trip_id',
      'b_stop_id',
      'n_stop_id',
      'changed',
    ];
    const cols = gtfsColumns(schema);
    expect(cols).toEqual(['trip_id', 'stop_id']);
    const row = toRawDiffRow(
      {
        action: 'added',
        route_id: '1',
        b_trip_id: null,
        n_trip_id: 't2',
        b_stop_id: null,
        n_stop_id: '64',
        changed: null,
        seq: 3,
      },
      cols,
    );
    expect(row).toMatchObject({
      action: 'added',
      base: null,
      new: { trip_id: 't2', stop_id: '64' },
      changed: [],
      seq: 3,
    });
  });
});

describe('HTTP Range', () => {
  it('parses the forms DuckDB sends', () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange('bytes=0-9', 100)).toEqual([0, 9]);
    expect(parseRange('bytes=90-', 100)).toEqual([90, 99]);
    expect(parseRange('bytes=-8', 100)).toEqual([92, 99]);
    expect(parseRange('bytes=50-500', 100)).toEqual([50, 99]);
    expect(parseRange('bytes=100-', 100)).toBe('invalid');
    expect(parseRange('bytes=a-b', 100)).toBe('invalid');
  });
});

describe('highlight predicates', () => {
  it('builds fixed SQL only for columns the table has', () => {
    expect(predicateSql('wheelchair_lost', ['wheelchair_accessible'])).toBe(
      `(coalesce("b_wheelchair_accessible", '') = '1' AND NOT coalesce("n_wheelchair_accessible", '') = '1')`,
    );
    expect(predicateSql('bikes_lost', ['trip_id'])).toBeNull();
    expect(predicateSql('boarding_lost', ['pickup_type'])).toBe(
      `((coalesce("b_pickup_type", '') IN ('', '0') AND coalesce("n_pickup_type", '') = '1'))`,
    );
  });

  it('adds the predicate to the WHERE clause, or matches nothing without its column', () => {
    expect(
      buildWhere(
        { actions: [], predicate: 'bikes_lost' },
        ['bikes_allowed'],
        false,
      ).sql,
    ).toContain('"b_bikes_allowed"');
    expect(
      buildWhere({ actions: [], predicate: 'bikes_lost' }, ['trip_id'], false)
        .sql,
    ).toBe('FALSE');
  });
});
