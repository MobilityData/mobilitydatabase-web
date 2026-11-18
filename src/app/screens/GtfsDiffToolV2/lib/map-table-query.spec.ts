/**
 * @jest-environment node
 */
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import type { LonLat, RouteImpact, StopChange } from './entity-diff-types';
import {
  type RouteSort,
  type RouteTableFilters,
  type RouteV2Filters,
  overviewBounds,
  routeOfShapeQuery,
  routesFlagCountsQuery,
  routesKindCountsQuery,
  routesChangeCountsQuery,
  routesPageQuery,
  routesV2KindCountsQuery,
  routesV2OverviewQuery,
  routesOverviewQuery,
  routesV2PageQuery,
  routeDetailQuery,
  routeServedStopsQuery,
  routeShapesQuery,
  stopChangeQuery,
  stopsKindCountsQuery,
  stopsTableQuery,
  stopsPageQuery,
  stopsPointsQuery,
  toRouteOverview,
  toRouteV2Overview,
  toStopChange,
  toStopListRow,
  unusedShapesQuery,
} from './map-table-query';
import { DEFAULT_V2_FILTERS } from './routes-v2';
import { encodePolyline } from './entity-diff-codec';
import {
  rawFieldChanges,
  toRouteRow,
  toShapeRow,
  toStopServedRow,
  toUnusedShape,
} from './route-detail';
import {
  type ColumnSpec,
  type RouteDir,
  type RouteDirectionRow,
  type ShapeRow,
  type ShapeUse,
  ROUTES_COLUMNS,
  ROUTE_DIRECTION_TYPE,
  ROUTE_DIR_TYPE,
  SHAPES_COLUMNS,
  SHAPE_USE_TYPE,
  STOPS_COLUMNS,
} from './route-tables';
import {
  ROUTE_FLAGS,
  ROUTE_KINDS,
  filterRoutes,
  routeKind,
  sortRoutes,
} from './routes-utils';
import {
  STOP_KINDS,
  type StopFilters,
  countKinds,
  filterStops,
  normalizeText,
} from './stops-utils';

/**
 * The SQL is run in DuckDB over tables shaped like the build writes them
 * (raw/stops.parquet, analysis/stops.parquet, analysis/routes.parquet), and compared
 * with the JS filters it replaces.
 */

const SEP = '\u001f';

function stop(
  id: string,
  status: StopChange['status'],
  over: Partial<StopChange> = {},
): StopChange {
  return {
    stop_id: id,
    status,
    name: `Stop ${id}`,
    base: status === 'added' ? null : { stop_name: `Stop ${id}` },
    new: status === 'deleted' ? null : { stop_name: `Stop ${id}` },
    base_coord: status === 'added' ? null : [2, 48],
    new_coord: status === 'deleted' ? null : [2.001, 48.001],
    field_changes: [],
    moved_m: null,
    moved: false,
    route_ids: { base: [], new: [] },
    ...over,
  };
}

// In list order (modified, added, deleted, then stop_id), as diffStopsMap sorts.
const STOPS: StopChange[] = [
  stop('M1', 'modified', {
    field_changes: [
      {
        field: 'stop_name',
        base_value: 'Stop M1',
        new_value: 'Zona Universitària',
      },
      { field: 'wheelchair_boarding', base_value: '1', new_value: '' },
    ],
    base: { stop_name: 'Stop M1', wheelchair_boarding: '1' },
    new: { stop_name: 'Zona Universitària', wheelchair_boarding: '' },
    base_coord: [2.001, 48.001],
    route_ids: { base: ['7'], new: ['7', '9'] },
  }),
  // Moved 120 m.
  stop('M2', 'modified', {
    moved_m: 120,
    field_changes: [
      { field: 'stop_lat', base_value: '48', new_value: '48.001' },
      { field: 'stop_lon', base_value: '2', new_value: '2.001' },
    ],
  }),
  // Coordinates rounded: precision only.
  stop('M3', 'modified', {
    moved_m: 0.2,
    field_changes: [
      { field: 'stop_lat', base_value: '48', new_value: '48.001' },
    ],
  }),
  stop('M4', 'modified', {
    moved_m: 0.4,
    base_coord: null,
    field_changes: [
      { field: 'stop_lat', base_value: '', new_value: '48.001' },
      { field: 'stop_lon', base_value: '', new_value: '2.001' },
    ],
  }),
  stop('A1', 'added'),
  stop('D1', 'deleted', {
    name: 'Gare de Lyon',
    base: { stop_name: 'Gare de Lyon' },
  }),
];

/**
 * The stops analysis table's served (route, direction) pairs: by default
 * each of route_ids in direction '0'. M1's route 7 runs both ways and route
 * 9 has no direction_id, so its route_ids are 7 / 7, 9.
 */
const SERVED: Record<string, { base: RouteDir[]; new: RouteDir[] }> = {
  M1: {
    base: [
      { route_id: '7', direction_id: '0' },
      { route_id: '7', direction_id: '1' },
    ],
    new: [
      { route_id: '9', direction_id: '' },
      { route_id: '7', direction_id: '1' },
      { route_id: '7', direction_id: '0' },
    ],
  },
};

function served(s: StopChange): { base: RouteDir[]; new: RouteDir[] } {
  const pairs = (ids: string[]): RouteDir[] =>
    ids.map((route_id) => ({ route_id, direction_id: '0' }));
  return (
    SERVED[s.stop_id] ?? {
      base: pairs(s.route_ids.base),
      new: pairs(s.route_ids.new),
    }
  );
}

/** raw/stops.parquet's GTFS columns in these tests. */
const RAW_COLUMNS = [
  'stop_id',
  'stop_name',
  'stop_lat',
  'stop_lon',
  'wheelchair_boarding',
];

/** A stop's stops.txt row in one feed, as the raw table holds it. */
function rawSide(
  s: StopChange,
  row: Record<string, string> | null,
  coord: StopChange['base_coord'],
): Array<string | null> {
  if (row == null) return RAW_COLUMNS.map(() => null);
  const values: Record<string, string> = {
    ...row,
    stop_id: s.stop_id,
    stop_lon: coord ? String(coord[0]) : '',
    stop_lat: coord ? String(coord[1]) : '',
  };
  return RAW_COLUMNS.map((c) => values[c] ?? '');
}

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
  // raw/stops.parquet as raw-diff-parquet.mjs writes it (trip_key holds the
  // stop_id; a feed without the row has NULL values), shuffled.
  const pairs = RAW_COLUMNS.flatMap((c) => [
    `b_${c} VARCHAR`,
    `n_${c} VARCHAR`,
  ]);
  await con.run(`CREATE TABLE raw_stops (action VARCHAR, route_id VARCHAR, trip_key VARCHAR,
    base_trip_id VARCHAR, new_trip_id VARCHAR, changed VARCHAR, ${pairs.join(', ')})`);
  const raw = await con.createAppender('raw_stops');
  for (const s of [...STOPS].reverse()) {
    const b = rawSide(s, s.base, s.base_coord);
    const n = rawSide(s, s.new, s.new_coord);
    const fields = s.field_changes.map((c) => c.field);
    for (const v of [
      s.status,
      null,
      s.stop_id,
      s.base ? s.stop_id : null,
      s.new ? s.stop_id : null,
      fields.length > 0 ? fields.join(',') : null,
      ...RAW_COLUMNS.flatMap((_, i) => [b[i], n[i]]),
    ])
      if (v == null) raw.appendNull();
      else raw.appendVarchar(v);
    raw.endRow();
  }
  raw.closeSync();
  // The raw table holds every stop of either feed: unchanged ones compact
  // (base values NULL where equal to the new ones). S1's routes changed.
  await con.run(`INSERT INTO raw_stops (action, trip_key, n_stop_id, n_stop_name,
      n_stop_lat, n_stop_lon, n_wheelchair_boarding) VALUES
    ('unchanged', 'S1', 'S1', 'Gare du Nord', '48.01', '2.01', ''),
    ('unchanged', 'U1', 'U1', 'Untouched', '48.02', '2.02', '')`);
  // analysis/stops.parquet as map-tables.mjs writes it: the stops changed in
  // stops.txt, and S1, whose served (route, direction) pairs changed.
  await con.run(`CREATE TABLE stop_analysis (stop_id VARCHAR, moved_m DOUBLE,
    served_base STRUCT(route_id VARCHAR, direction_id VARCHAR)[],
    served_new STRUCT(route_id VARCHAR, direction_id VARCHAR)[])`);
  const pairsJson = `'[{"route_id":"VARCHAR","direction_id":"VARCHAR"}]'`;
  const analysed: Array<[string, number | null, RouteDir[], RouteDir[]]> = [
    ...STOPS.map((s): [string, number | null, RouteDir[], RouteDir[]] => [
      s.stop_id,
      s.moved_m,
      served(s).base,
      served(s).new,
    ]),
    [
      'S1',
      0,
      [{ route_id: 'R5', direction_id: '0' }],
      [{ route_id: 'R5', direction_id: '1' }],
    ],
  ];
  for (const [id, movedM, base, next] of analysed)
    await rows({
      sql: `INSERT INTO stop_analysis VALUES (?, TRY_CAST(? AS DOUBLE),
        from_json(?, ${pairsJson}), from_json(?, ${pairsJson}))`,
      params: [
        id,
        movedM == null ? null : String(movedM),
        JSON.stringify(base),
        JSON.stringify(next),
      ],
    });
  await rows(
    stopsTableQuery('stops', 'stop_analysis', 'raw_stops', RAW_COLUMNS),
  );
});

afterAll(() => {
  con.closeSync();
  db.closeSync();
});

describe('stops table SQL', () => {
  const cases: StopFilters[] = [
    { kinds: STOP_KINDS, minMoveM: 1, hidePrecisionOnly: true, search: '' },
    { kinds: STOP_KINDS, minMoveM: 1, hidePrecisionOnly: false, search: '' },
    { kinds: ['moved'], minMoveM: 100, hidePrecisionOnly: true, search: '' },
    { kinds: ['modified'], minMoveM: 200, hidePrecisionOnly: true, search: '' },
    {
      kinds: STOP_KINDS,
      minMoveM: 1,
      hidePrecisionOnly: true,
      search: 'zona UNIVERSITARIA',
    },
    { kinds: STOP_KINDS, minMoveM: 1, hidePrecisionOnly: true, search: 'gare' },
  ];

  it.each(cases)('lists what filterStops shows (%j)', async (f) => {
    const listed = (await rows(stopsPageQuery('stops', f, 0, 100))).map(
      toStopListRow,
    );
    expect(listed.map((s) => s.stop_id)).toEqual(
      filterStops(STOPS, f).map((s) => s.stop_id),
    );
  });

  it.each(cases)('counts kinds like countKinds (%j)', async (f) => {
    const counts = Object.fromEntries(STOP_KINDS.map((k) => [k, 0]));
    for (const r of await rows(stopsKindCountsQuery('stops', f)))
      counts[String(r.kind)] = Number(r.n);
    expect(counts).toEqual(countKinds(STOPS, f));
  });

  it('pages, and maps only located stops', async () => {
    const f = cases[1];
    const page = await rows(stopsPageQuery('stops', f, 2, 2));
    expect(page.map((r) => r.stop_id)).toEqual(['M3', 'M4']);
    const points = await rows(stopsPointsQuery('stops', f));
    expect(points.every((p) => p.lon != null)).toBe(true);
    expect(points.find((p) => p.stop_id === 'M2')?.kind).toBe('moved');
  });

  it('builds the table the list, filters and map read', async () => {
    const built = await rows({
      sql: 'SELECT * FROM stops ORDER BY ord',
      params: [],
    });
    // What map-tables.mjs used to store for each stop.
    expect(built).toEqual(
      STOPS.map((s, ord) => {
        const fields = s.field_changes.map((c) => c.field);
        const d = s.new_coord ?? s.base_coord;
        return {
          ord,
          stop_id: s.stop_id,
          status: s.status,
          name: s.new?.stop_name ?? s.base?.stop_name ?? '',
          search: [s.stop_id, s.base?.stop_name ?? '', s.new?.stop_name ?? '']
            .map(normalizeText)
            .join(SEP),
          lon: d?.[0] ?? null,
          lat: d?.[1] ?? null,
          base_lon: s.base_coord?.[0] ?? null,
          base_lat: s.base_coord?.[1] ?? null,
          new_lon: s.new_coord?.[0] ?? null,
          new_lat: s.new_coord?.[1] ?? null,
          moved_m: s.moved_m,
          coord_only:
            fields.length > 0 &&
            fields.every((f) => f === 'stop_lat' || f === 'stop_lon'),
          changed: fields.length > 0 ? fields.join(',') : null,
          base_routes: s.route_ids.base,
          new_routes: s.route_ids.new,
        };
      }),
    );
  });

  it('leaves out stops whose only change is the routes serving them', async () => {
    const f = cases[1];
    const listed = await rows(stopsPageQuery('stops', f, 0, 100));
    const points = await rows(stopsPointsQuery('stops', f));
    for (const ids of [listed, points].map((r) => r.map((x) => x.stop_id))) {
      expect(ids).not.toContain('S1');
      expect(ids).not.toContain('U1');
    }
    let total = 0;
    for (const r of await rows(stopsKindCountsQuery('stops', f)))
      total += Number(r.n);
    expect(total).toBe(STOPS.length);
    expect(await rows(stopChangeQuery('stops', 'raw_stops', 'S1'))).toEqual([]);
  });

  it('builds an empty table when stops.txt did not change', async () => {
    await rows(stopsTableQuery('no_stops', 'stop_analysis', null, []));
    expect(
      await rows({
        sql: 'SELECT count(*)::INTEGER AS n FROM no_stops',
        params: [],
      }),
    ).toEqual([{ n: 0 }]);
  });

  it('reads a stop from its list row and its raw stops.txt rows', async () => {
    const columns = ['stop_id', 'stop_name', 'wheelchair_boarding'];
    const [m1] = await rows(stopChangeQuery('stops', 'raw_stops', 'M1'));
    const s = toStopChange(m1, columns);
    expect(s).toMatchObject({
      stop_id: 'M1',
      status: 'modified',
      base: { stop_id: 'M1', stop_name: 'Stop M1', wheelchair_boarding: '1' },
      new: {
        stop_id: 'M1',
        stop_name: 'Zona Universitària',
        wheelchair_boarding: '',
      },
      field_changes: [
        {
          field: 'stop_name',
          base_value: 'Stop M1',
          new_value: 'Zona Universitària',
        },
        { field: 'wheelchair_boarding', base_value: '1', new_value: '' },
      ],
      base_coord: [2.001, 48.001],
      new_coord: [2.001, 48.001],
      route_ids: { base: ['7'], new: ['7', '9'] },
    });

    const [a1] = await rows(stopChangeQuery('stops', 'raw_stops', 'A1'));
    expect(toStopChange(a1, columns)).toMatchObject({
      status: 'added',
      base: null,
      new: { stop_id: 'A1', stop_name: 'Stop A1', wheelchair_boarding: '' },
      field_changes: [],
      route_ids: { base: [], new: [] },
    });

    expect(await rows(stopChangeQuery('stops', 'raw_stops', 'nope'))).toEqual(
      [],
    );
    expect(() => stopChangeQuery('stops', 'x"; drop', 'M1')).toThrow();
  });

  it('rejects unsafe view names and numbers', () => {
    expect(() => stopsPageQuery('x"; drop', cases[0], 0, 10)).toThrow();
    expect(() =>
      stopsPageQuery('stops', { ...cases[0], minMoveM: NaN }, 0, 10),
    ).toThrow();
  });
});

function route(
  id: string,
  status: RouteImpact['status'],
  flags: Partial<RouteImpact['flags']> = {},
): RouteImpact {
  return {
    route_id: id,
    status,
    short_name: id,
    long_name: `Line ${id}`,
    route_type: '3',
    color: '',
    text_color: '',
    base: null,
    new: null,
    field_changes: [],
    flags: {
      attributes: false,
      stops: false,
      path: false,
      trips: false,
      services: false,
      network: false,
      ...flags,
    },
    networks: { base: null, new: null },
    trips: { base: 1, new: 1 },
    services: { base: [], new: [] },
    stops: { base_count: 2, new_count: 2, added: [], removed: [] },
    directions: [],
  };
}

const ROUTES = sortRoutes([
  route('10', 'modified', { path: true }),
  route('2', 'added'),
  route('3', 'deleted'),
  route('M1', 'unchanged'),
  route('4', 'modified', { trips: true, stops: true }),
]);

// ── analysis/routes.parquet and analysis/shapes.parquet as SQL literals ──

const LINE_NEW: LonLat[] = [
  [2, 48],
  [2.01, 48.01],
];
const LINE_BASE: LonLat[] = [
  [2.1, 48.1],
  [2.2, 48.3],
];
const LINE_4: LonLat[] = [
  [3, 49],
  [3.01, 49.02],
];
const LINE_X: LonLat[] = [
  [4, 50],
  [4.1, 50.1],
];
const DIVERGE: LonLat[] = [
  [2.005, 48.005],
  [2.01, 48.01],
];

function lit(s: string | number | boolean | null): string {
  if (s == null) return 'NULL';
  if (typeof s !== 'string') return String(s);
  return `'${s.replace(/'/g, "''")}'`;
}

function strList(xs: string[]): string {
  return `[${xs.map(lit).join(', ')}]::VARCHAR[]`;
}

function structList(
  items: Array<Record<string, string | number | boolean | null>>,
  type: string,
): string {
  const one = (o: Record<string, string | number | boolean | null>): string =>
    `{${Object.entries(o)
      .map(([k, v]) => `'${k}': ${lit(v)}`)
      .join(', ')}}`;
  return `[${items.map(one).join(', ')}]::${type}[]`;
}

function direction(d: Partial<RouteDirectionRow>): RouteDirectionRow {
  return {
    direction_id: '0',
    headsign_base: null,
    headsign_new: null,
    shape_base: null,
    shape_new: null,
    path_change_m: null,
    diverge_added: [],
    diverge_removed: [],
    ...d,
  };
}

function directionsSql(dirs: RouteDirectionRow[]): string {
  return `[${dirs
    .map(
      (d) =>
        `{'direction_id': ${lit(d.direction_id)}, 'headsign_base': ${lit(d.headsign_base)}, ` +
        `'headsign_new': ${lit(d.headsign_new)}, 'shape_base': ${lit(d.shape_base)}, ` +
        `'shape_new': ${lit(d.shape_new)}, 'path_change_m': ${lit(d.path_change_m)}, ` +
        `'diverge_added': ${strList(d.diverge_added)}, 'diverge_removed': ${strList(d.diverge_removed)}}`,
    )
    .join(', ')}]::${ROUTE_DIRECTION_TYPE}[]`;
}

/** Each route's directions: main shapes by base and new id. */
const DIRECTIONS: Record<string, RouteDirectionRow[]> = {
  // Its main shape renamed S0 -> S1, and a path change.
  '10': [
    direction({
      shape_base: 'S0',
      shape_new: 'S1',
      headsign_base: 'Old',
      headsign_new: 'New',
      path_change_m: 80,
      diverge_added: [encodePolyline(DIVERGE)],
    }),
  ],
  // Removed: its base main shape only.
  '3': [direction({ shape_base: 'D3' })],
  // Direction 0 lost its new main shape: the base line (S0, renamed S1).
  '4': [
    direction({ shape_base: 'S0' }),
    direction({ direction_id: '1', shape_base: 'U4', shape_new: 'U4' }),
  ],
};

function shape(s: Partial<ShapeRow> & { shape_id: string }): ShapeRow {
  return {
    main: false,
    status: 'unchanged',
    renamed_from: null,
    deviation_m: null,
    points_base: 2,
    points_new: 2,
    unused_base: false,
    unused_new: false,
    geom_base: null,
    geom_new: null,
    diverge_added: [],
    diverge_removed: [],
    uses_base: [],
    uses_new: [],
    main_base: [],
    main_new: [],
    ...s,
  };
}

const use = (route_id: string, direction_id: string, trips = 1): ShapeUse => ({
  route_id,
  direction_id,
  trips,
});
const dir = (route_id: string, direction_id: string): RouteDir => ({
  route_id,
  direction_id,
});

const SHAPES: ShapeRow[] = [
  // Renamed: one row under the new id, geom_new standing for both.
  shape({
    shape_id: 'S1',
    main: true,
    status: 'renamed',
    renamed_from: 'S0',
    geom_new: encodePolyline(LINE_NEW),
    uses_base: [use('10', '0', 3)],
    uses_new: [use('10', '0', 4)],
    main_base: [dir('10', '0'), dir('4', '0')],
    main_new: [dir('10', '0')],
  }),
  shape({
    shape_id: 'D3',
    main: true,
    status: 'deleted',
    points_new: 0,
    geom_base: encodePolyline(LINE_BASE),
    uses_base: [use('3', '0', 2)],
    main_base: [dir('3', '0')],
  }),
  shape({
    shape_id: 'U4',
    main: true,
    geom_new: encodePolyline(LINE_4),
    uses_base: [use('4', '1', 5)],
    uses_new: [use('4', '1', 5), use('10', '1', 2)],
    main_base: [dir('4', '1')],
    main_new: [dir('4', '1')],
  }),
  // Not a main shape: only in the route's trips.
  shape({
    shape_id: 'X',
    status: 'added',
    points_base: 0,
    deviation_m: 120,
    geom_new: encodePolyline(LINE_X),
    uses_new: [use('4', '0', 1)],
  }),
  // In shapes.txt, used by no trip.
  shape({
    shape_id: 'Z',
    status: 'deleted',
    points_new: 0,
    unused_base: true,
    geom_base: encodePolyline(LINE_BASE),
  }),
];

function shapeSql(s: ShapeRow): string {
  return `(${[
    lit(s.shape_id),
    lit(s.main),
    lit(s.status),
    lit(s.renamed_from),
    lit(s.deviation_m),
    lit(s.points_base),
    lit(s.points_new),
    lit(s.unused_base),
    lit(s.unused_new),
    lit(s.geom_base),
    lit(s.geom_new),
    strList(s.diverge_added),
    strList(s.diverge_removed),
    structList(
      s.uses_base as unknown as Array<Record<string, string | number>>,
      SHAPE_USE_TYPE,
    ),
    structList(
      s.uses_new as unknown as Array<Record<string, string | number>>,
      SHAPE_USE_TYPE,
    ),
    structList(
      s.main_base as unknown as Array<Record<string, string>>,
      ROUTE_DIR_TYPE,
    ),
    structList(
      s.main_new as unknown as Array<Record<string, string>>,
      ROUTE_DIR_TYPE,
    ),
  ].join(', ')})`;
}

function createSql(name: string, columns: ColumnSpec[]): string {
  return `CREATE TABLE ${name} (${columns.map(([c, t]) => `${c} ${t}`).join(', ')})`;
}

describe('routes table SQL', () => {
  beforeAll(async () => {
    await con.run(createSql('routes', ROUTES_COLUMNS));
    const values = ROUTES.map((r, ord) =>
      [
        lit(ord),
        lit(r.route_id),
        lit(r.status),
        lit(routeKind(r)),
        lit(['10', '2'].includes(r.route_id) ? 'A' : 'B'),
        lit(r.short_name),
        lit(r.long_name),
        lit(r.route_type),
        lit(''),
        lit(''),
        lit(r.route_id === '4' ? 1 : r.route_id === '10' ? 2 : null),
        lit(
          [r.route_id, r.short_name, r.long_name].map(normalizeText).join(SEP),
        ),
        ...ROUTE_FLAGS.map((f) => lit(r.flags[f])),
        lit(''),
        lit(r.route_id === '10' ? 'N1' : null),
        lit(r.route_id === '10' ? 'N2' : null),
        lit(2),
        lit(r.status === 'deleted' ? 0 : 3),
        ...(r.route_id === '10'
          ? [2, 48, 2.01, 48.01]
          : [null, null, null, null]
        ).map(lit),
        directionsSql(DIRECTIONS[r.route_id] ?? []),
      ].join(', '),
    );
    await con.run(
      `INSERT INTO routes VALUES ${values.map((v) => `(${v})`).join(', ')}`,
    );
    await con.run(createSql('shapes', SHAPES_COLUMNS));
    await con.run(
      `INSERT INTO shapes VALUES ${SHAPES.map(shapeSql).join(', ')}`,
    );
  });

  const cases: RouteTableFilters[] = [
    { kinds: ['added', 'removed', 'modified'], flags: [], search: '' },
    { kinds: ROUTE_KINDS, flags: [], search: '' },
    { kinds: ROUTE_KINDS, flags: ['trips', 'path'], search: '' },
    { kinds: ['modified'], flags: [], search: 'line 1' },
  ];

  it.each(cases)('lists what filterRoutes shows (%j)', async (f) => {
    const listed = await rows(routesPageQuery('routes', f, 0, 100));
    expect(listed.map((r) => r.route_id)).toEqual(
      filterRoutes(ROUTES, f).map((r) => r.route_id),
    );
  });

  it("keeps one agency's routes", async () => {
    const listed = await rows(
      routesPageQuery(
        'routes',
        { kinds: ROUTE_KINDS, flags: [], search: '', agencyId: 'A' },
        0,
        100,
      ),
    );
    expect(listed.map((r) => r.route_id)).toEqual(['2', '10']);
  });

  it('counts kinds and flags under the other filters', async () => {
    const f = cases[2];
    const kinds = await rows(routesKindCountsQuery('routes', f));
    expect(Object.fromEntries(kinds.map((r) => [r.kind, r.n]))).toEqual({
      modified: 2,
    });
    const [flags] = await rows(routesFlagCountsQuery('routes', cases[0]));
    expect(flags).toMatchObject({ path: 1, trips: 1, stops: 1, network: 0 });
  });

  it('draws each direction from its main shapes', async () => {
    const overview = (
      await rows(routesOverviewQuery('routes', 'shapes', cases[1]))
    ).map(toRouteOverview);
    expect(
      overview.map((r) => [r.route_id, r.kind, r.lines, r.added, r.removed]),
    ).toEqual([
      ['2', 'added', [], [], []],
      // Removed: the base line of a deleted shape.
      ['3', 'removed', [LINE_BASE], [], []],
      // No new main shape: the base one, found by its old id (renamed).
      ['4', 'modified', [LINE_NEW, LINE_4], [], []],
      ['10', 'modified', [LINE_NEW], [DIVERGE], []],
      ['M1', 'unchanged', [], [], []],
    ]);
    expect(overview[3].bounds).toEqual([
      [2, 48],
      [2.01, 48.01],
    ]);
    expect(overview[0].bounds).toBeNull();
  });

  it('finds the route of a shape, renamed or not', async () => {
    const owner = async (id: string): Promise<unknown> =>
      (await rows(routeOfShapeQuery('routes', 'shapes', id)))[0]?.route_id;
    // Route 4 had it as a main shape too, but 10 uses it in the new feed.
    expect(await owner('S0')).toBe('10');
    expect(await owner('S1')).toBe('10');
    // Both use it in the new feed: list order.
    expect(await owner('U4')).toBe('4');
    expect(await owner('D3')).toBe('3');
    expect(await owner('X')).toBe('4');
    expect(await owner('Z')).toBeUndefined();
    expect(await owner('S')).toBeUndefined();
  });

  it('lists the shapes no trip uses', async () => {
    expect(
      (await rows(unusedShapesQuery('shapes'))).map(toUnusedShape),
    ).toEqual([
      {
        shape_id: 'Z',
        status: 'deleted',
        deviation_m: null,
        points: { base: 2, new: 0 },
        unused: { base: true, new: false },
        geometry: { base: null, new: null },
      },
    ]);
  });

  describe('a route detail', () => {
    beforeAll(async () => {
      // raw/routes.parquet: route 10's row changed; 4's didn't (no row).
      await con.run(`CREATE TABLE raw_routes (action VARCHAR, trip_key VARCHAR, changed VARCHAR,
        b_route_id VARCHAR, n_route_id VARCHAR, b_route_color VARCHAR, n_route_color VARCHAR,
        b_route_long_name VARCHAR, n_route_long_name VARCHAR)`);
      await con.run(`INSERT INTO raw_routes VALUES
        ('modified', '10', 'route_color,route_long_name', '10', '10', 'FF0000', '00FF00', 'Old', 'New')`);
      // analysis/stops.parquet: P1 newly served by 4 (direction 0), P2 dropped.
      await con.run(createSql('route_stops', STOPS_COLUMNS));
      await con.run(`INSERT INTO route_stops VALUES
        ('P1', 0, [], [{'route_id': '4', 'direction_id': '0'}]),
        ('P2', NULL, [{'route_id': '4', 'direction_id': '1'}], []),
        ('P3', 5, [{'route_id': '10', 'direction_id': '0'}], [{'route_id': '10', 'direction_id': '0'}])`);
    });

    it('reads the routes row, with field changes from routes.txt', async () => {
      const [row] = await rows(routeDetailQuery('routes', '10', 'raw_routes'));
      expect(toRouteRow(row)).toMatchObject({
        route_id: '10',
        status: 'modified',
        agency_id: 'A',
        sort_order: 2,
        network_base: 'N1',
        network_new: 'N2',
        stops_base: 2,
        stops_new: 3,
        flags: { path: true, stops: false },
        directions: DIRECTIONS['10'],
      });
      expect(rawFieldChanges(row)).toEqual([
        { field: 'route_color', base_value: 'FF0000', new_value: '00FF00' },
        { field: 'route_long_name', base_value: 'Old', new_value: 'New' },
      ]);
      const [unchanged] = await rows(
        routeDetailQuery('routes', '4', 'raw_routes'),
      );
      expect(rawFieldChanges(unchanged)).toEqual([]);
      // No raw table (routes.txt unchanged).
      const [noRaw] = await rows(routeDetailQuery('routes', '4'));
      expect(toRouteRow(noRaw).directions).toEqual(DIRECTIONS['4']);
      expect(
        await rows(routeDetailQuery('routes', 'nope', 'raw_routes')),
      ).toEqual([]);
      expect(() => routeDetailQuery('routes', '1', 'x"; drop')).toThrow();
    });

    it("reads the route's shapes and the stops it serves", async () => {
      const shapes = (await rows(routeShapesQuery('shapes', '4'))).map(
        toShapeRow,
      );
      // S1: main shape of its direction 0 in the base feed only.
      expect(shapes.map((s) => s.shape_id)).toEqual(['S1', 'U4', 'X']);
      expect(shapes).toEqual(
        SHAPES.filter((s) => ['S1', 'U4', 'X'].includes(s.shape_id)),
      );
      const stops = (await rows(routeServedStopsQuery('route_stops', '4'))).map(
        toStopServedRow,
      );
      expect(stops.map((s) => [s.stop_id, s.moved_m])).toEqual([
        ['P1', 0],
        ['P2', null],
      ]);
      expect(stops[0].served_new).toEqual([dir('4', '0')]);
    });
  });

  describe('v2', () => {
    beforeAll(async () => {
      await con.run(`CREATE TABLE routes_v2 AS SELECT * FROM routes`);
      // Only its trips and services changed: unchanged as a route.
      await con.run(`INSERT INTO routes_v2 BY NAME SELECT 99 AS ord, '5' AS route_id,
        'modified' AS status, 'modified' AS kind, 'B' AS agency_id, '5' AS short_name,
        '' AS long_name, '5' AS search, false AS f_path, false AS f_stops, true AS f_trips,
        true AS f_services, false AS f_attributes, false AS f_network`);
    });
    const listV2 = async (
      f: Partial<RouteV2Filters>,
      sort: RouteSort = 'severity',
    ): Promise<string[]> =>
      (
        await rows(
          routesV2PageQuery(
            'routes_v2',
            { ...DEFAULT_V2_FILTERS, ...f },
            sort,
            0,
            100,
          ),
        )
      ).map((r) => String(r.route_id));

    it('sorts by severity, route_sort_order or name', async () => {
      expect(await listV2({})).toEqual(['3', '2', '10', '4']);
      expect(await listV2({}, 'sort_order')).toEqual(['4', '10', '2', '3']);
      expect(await listV2({}, 'name')).toEqual(['2', '3', '4', '10']);
    });

    it('ORs the "What changed" chips; flags only match modified routes', async () => {
      expect(await listV2({ changes: ['path', 'added'] })).toEqual(['2', '10']);
      expect(await listV2({ changes: ['stops'] })).toEqual(['4']);
      expect(await listV2({ changes: ['removed'], kinds: ['added'] })).toEqual(
        [],
      );
    });

    it('keeps a preset’s routes, unchanged ones when shown', async () => {
      expect(await listV2({ routeIds: ['4', 'M1'] })).toEqual(['4']);
      expect(
        await listV2({ routeIds: ['4', 'M1'], showUnchanged: true }),
      ).toEqual(['4', 'M1']);
    });

    it('counts each change and kind under the other filters', async () => {
      const f = { ...DEFAULT_V2_FILTERS, changes: ['path' as const] };
      const [changes] = await rows(routesChangeCountsQuery('routes_v2', f));
      expect(changes).toMatchObject({
        added: 1,
        removed: 1,
        path: 1,
        stops: 1,
        network: 0,
      });
      expect(changes).not.toHaveProperty('trips');
      const kinds = await rows(routesV2KindCountsQuery('routes_v2', f));
      expect(Object.fromEntries(kinds.map((r) => [r.kind, r.n]))).toEqual({
        modified: 1,
      });
    });

    it('counts a route whose only changes are trips or services as unchanged', async () => {
      expect(await listV2({})).not.toContain('5');
      expect(await listV2({ showUnchanged: true })).toEqual([
        '3',
        '2',
        '10',
        '4',
        'M1',
        '5',
      ]);
      const kinds = await rows(
        routesV2KindCountsQuery('routes_v2', DEFAULT_V2_FILTERS),
      );
      expect(Object.fromEntries(kinds.map((r) => [r.kind, r.n]))).toEqual({
        added: 1,
        removed: 1,
        modified: 2,
        unchanged: 2,
      });
      const shown = (
        await rows(
          routesV2OverviewQuery(
            'routes_v2',
            'shapes',
            { ...DEFAULT_V2_FILTERS, routeIds: ['5'], showUnchanged: true },
            'severity',
          ),
        )
      ).map(toRouteV2Overview);
      expect(shown[0]).toMatchObject({ route_id: '5', kind: 'unchanged' });
    });

    it('reads overview rows with their flags, in list order', async () => {
      const overview = (
        await rows(
          routesV2OverviewQuery(
            'routes_v2',
            'shapes',
            DEFAULT_V2_FILTERS,
            'severity',
          ),
        )
      ).map(toRouteV2Overview);
      expect(overview.map((r) => r.route_id)).toEqual(['3', '2', '10', '4']);
      expect(overview[3]).toMatchObject({
        route_id: '4',
        kind: 'modified',
        flags: { trips: true, stops: true, path: false },
        lines: [LINE_NEW, LINE_4],
        bounds: null,
      });
    });
  });
});

describe('route overview rows', () => {
  it('decodes the overview polylines and bounds', () => {
    const line: LonLat[] = [
      [2.1, 48.1],
      [2.2, 48.3],
    ];
    const r = toRouteOverview({
      route_id: 'R',
      kind: 'modified',
      // A one-point line is not drawn.
      lines: JSON.stringify([encodePolyline(line), encodePolyline([[2, 48]])]),
      added: JSON.stringify([]),
      removed: null,
      min_lon: 2.1,
      min_lat: 48.1,
      max_lon: 2.2,
      max_lat: 48.3,
    });
    expect(r.lines).toEqual([line]);
    expect(r.removed).toEqual([]);
    expect(
      overviewBounds([
        r,
        {
          ...r,
          bounds: [
            [1, 47],
            [2.15, 48.2],
          ],
        },
      ]),
    ).toEqual([
      [1, 47],
      [2.2, 48.3],
    ]);
  });
});
