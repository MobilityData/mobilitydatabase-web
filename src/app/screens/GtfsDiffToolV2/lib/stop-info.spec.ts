/**
 * @jest-environment node
 */
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import {
  stopInfoFromRows,
  stopInfoSql,
  stopNamesFromRows,
  stopNamesSql,
  stopRowSides,
  stopRowsQuery,
} from './stop-info';

/**
 * raw/stops.parquet as raw-diff-parquet.mjs writes a lookup file: every
 * stop of either feed, unchanged ones compact (base values NULL where equal
 * to the new ones; wheelchair_boarding only in the base feed).
 */
let db: DuckDBInstance;
let con: DuckDBConnection;

async function rows(q: {
  sql: string;
  params: unknown[];
}): Promise<Array<Record<string, unknown>>> {
  const stmt = await con.prepare(q.sql);
  q.params.forEach((p, i) => stmt.bindValue(i + 1, p as string));
  return (await stmt.runAndReadAll()).getRowObjectsJS();
}

beforeAll(async () => {
  db = await DuckDBInstance.create(':memory:');
  con = await db.connect();
  await con.run(`CREATE TABLE raw_stops (action VARCHAR, trip_key VARCHAR, changed VARCHAR,
    b_stop_id VARCHAR, n_stop_id VARCHAR, b_stop_name VARCHAR, n_stop_name VARCHAR,
    b_stop_lat VARCHAR, n_stop_lat VARCHAR, b_stop_lon VARCHAR, n_stop_lon VARCHAR,
    b_wheelchair_boarding VARCHAR, n_wheelchair_boarding VARCHAR)`);
  await con.run(`INSERT INTO raw_stops VALUES
    ('unchanged', 'U1', NULL, NULL, 'U1', NULL, 'Same', NULL, '48.1', NULL, '2.1', '1', ''),
    ('modified', 'M1', 'stop_name,stop_lat', 'M1', 'M1', 'Old', 'New', '48', '48.001', '2', '2', '2', ''),
    ('added', 'A1', NULL, NULL, 'A1', NULL, 'Added', NULL, '48.2', NULL, '2.2', NULL, ''),
    ('deleted', 'D1', NULL, 'D1', NULL, 'Gone', NULL, '48.3', NULL, '2.3', NULL, '0', NULL),
    ('added', 'X1', NULL, NULL, 'X1', NULL, 'No position', NULL, '', NULL, '', NULL, '')`);
  // analysis/stops.parquet: the stops changed in stops.txt, and U1, whose
  // served (route, direction) pairs changed though its row did not.
  await con.run(`CREATE TABLE moves (stop_id VARCHAR, moved_m DOUBLE,
    served_base STRUCT(route_id VARCHAR, direction_id VARCHAR)[],
    served_new STRUCT(route_id VARCHAR, direction_id VARCHAR)[])`);
  await con.run(`INSERT INTO moves VALUES
    ('M1', 111.2, [{'route_id': 'R1', 'direction_id': '0'}],
      [{'route_id': 'R1', 'direction_id': '0'}]),
    ('A1', NULL, [], [{'route_id': 'R1', 'direction_id': ''}]),
    ('U1', 0, [{'route_id': 'R1', 'direction_id': '0'}],
      [{'route_id': 'R2', 'direction_id': '1'}])`);
});

afterAll(() => {
  con.closeSync();
  db.closeSync();
});

describe('stop names', () => {
  it('takes the new name, else the base one', async () => {
    expect(
      stopNamesFromRows(
        await rows({ sql: stopNamesSql('raw_stops'), params: [] }),
      ),
    ).toEqual({
      U1: 'Same',
      M1: 'New',
      A1: 'Added',
      D1: 'Gone',
      X1: 'No position',
    });
  });
});

describe('stop info', () => {
  it('gives each located stop its position, change and move', async () => {
    const info = stopInfoFromRows(
      await rows({ sql: stopInfoSql('raw_stops', 'moves'), params: [] }),
    );
    expect(info).toEqual({
      U1: { name: 'Same', coord: [2.1, 48.1], status: 'unchanged', moved_m: 0 },
      M1: {
        name: 'New',
        coord: [2, 48.001],
        status: 'modified',
        moved_m: 111.2,
      },
      A1: { name: 'Added', coord: [2.2, 48.2], status: 'added', moved_m: 0 },
      // A removed stop is drawn where it was.
      D1: { name: 'Gone', coord: [2.3, 48.3], status: 'deleted', moved_m: 0 },
    });
  });

  it('reads one row per stop with the analysis table', async () => {
    const found = await rows({
      sql: stopInfoSql('raw_stops', 'moves'),
      params: [],
    });
    expect(found).toHaveLength(5);
  });

  it('works without the stops analysis table', async () => {
    const info = stopInfoFromRows(
      await rows({ sql: stopInfoSql('raw_stops', null), params: [] }),
    );
    expect(info.M1.moved_m).toBe(0);
  });
});

describe('stop rows', () => {
  it('reads some stops as their base and new rows', async () => {
    const found = await rows(stopRowsQuery('raw_stops', ['U1', 'M1', 'D1']));
    const sides = new Map(
      found.map((r) => [String(r.trip_key), stopRowSides(r)]),
    );
    expect([...sides.keys()].sort()).toEqual(['D1', 'M1', 'U1']);
    // Compact unchanged: the NULL base values are the new ones; a value only
    // the base feed has stays.
    expect(sides.get('U1')).toEqual({
      base: {
        stop_id: 'U1',
        stop_name: 'Same',
        stop_lat: '48.1',
        stop_lon: '2.1',
        wheelchair_boarding: '1',
      },
      new: {
        stop_id: 'U1',
        stop_name: 'Same',
        stop_lat: '48.1',
        stop_lon: '2.1',
      },
      field_changes: [],
    });
    expect(sides.get('M1')?.field_changes).toEqual([
      { field: 'stop_name', base_value: 'Old', new_value: 'New' },
      { field: 'stop_lat', base_value: '48', new_value: '48.001' },
    ]);
    expect(sides.get('D1')).toMatchObject({ new: null, field_changes: [] });
  });

  it('rejects unsafe view names', () => {
    expect(() => stopRowsQuery('x"; drop', ['U1'])).toThrow();
    expect(() => stopNamesSql('x"; drop')).toThrow();
  });
});
