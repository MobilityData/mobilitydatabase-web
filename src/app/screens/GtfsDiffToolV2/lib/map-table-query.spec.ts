/**
 * @jest-environment node
 */
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import type { RouteImpact, StopChange } from './entity-diff-types';
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
  routesV2PageQuery,
  stopsKindCountsQuery,
  stopsPageQuery,
  stopsPointsQuery,
  toRouteOverview,
  toRouteV2Overview,
  toStopListRow,
} from './map-table-query';
import { DEFAULT_V2_FILTERS } from './routes-v2';
import { encodePolyline } from './entity-diff-codec';
import {
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
 * The SQL is run in DuckDB over rows built like scripts/lib/map-tables.mjs
 * builds them, and compared with the JS filters it replaces.
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

const STOPS: StopChange[] = [
  stop('A1', 'added'),
  stop('D1', 'deleted', { name: 'Gare de Lyon' }),
  stop('M1', 'modified', {
    field_changes: [{ field: 'stop_name', base_value: 'x', new_value: 'y' }],
    new: { stop_name: 'Zona Universitària' },
  }),
  // Moved 120 m.
  stop('M2', 'modified', {
    moved_m: 120,
    field_changes: [
      { field: 'stop_lat', base_value: '1', new_value: '2' },
      { field: 'stop_lon', base_value: '1', new_value: '2' },
    ],
  }),
  // Coordinates rounded: precision only.
  stop('M3', 'modified', {
    moved_m: 0.2,
    field_changes: [{ field: 'stop_lat', base_value: '1', new_value: '1.0' }],
  }),
  stop('M4', 'modified', { moved_m: 0.4, base_coord: null }),
];

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
  await con.run(`CREATE TABLE stops (ord INTEGER, stop_id VARCHAR, status VARCHAR, name VARCHAR, search VARCHAR,
    lon DOUBLE, lat DOUBLE, base_lon DOUBLE, base_lat DOUBLE, new_lon DOUBLE, new_lat DOUBLE,
    moved_m DOUBLE, coord_only BOOLEAN, changed VARCHAR, detail VARCHAR)`);
  const a = await con.createAppender('stops');
  STOPS.forEach((s, ord) => {
    const fields = s.field_changes.map((c) => c.field);
    const d = s.new_coord ?? s.base_coord;
    a.appendInteger(ord);
    a.appendVarchar(s.stop_id);
    a.appendVarchar(s.status);
    a.appendVarchar(s.name);
    a.appendVarchar(
      [s.stop_id, s.base?.stop_name ?? '', s.new?.stop_name ?? '']
        .map(normalizeText)
        .join(SEP),
    );
    for (const v of [
      d?.[0],
      d?.[1],
      s.base_coord?.[0],
      s.base_coord?.[1],
      s.new_coord?.[0],
      s.new_coord?.[1],
      s.moved_m,
    ])
      if (v == null) a.appendNull();
      else a.appendDouble(v);
    a.appendBoolean(
      fields.length > 0 &&
        fields.every((f) => f === 'stop_lat' || f === 'stop_lon'),
    );
    a.appendVarchar(fields.join(','));
    a.appendVarchar(JSON.stringify(s));
    a.endRow();
  });
  a.closeSync();
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
    expect(page.map((r) => r.stop_id)).toEqual(['M1', 'M2']);
    const points = await rows(stopsPointsQuery('stops', f));
    expect(points.every((p) => p.lon != null)).toBe(true);
    expect(points.find((p) => p.stop_id === 'M2')?.kind).toBe('moved');
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

describe('routes table SQL', () => {
  beforeAll(async () => {
    await con.run(`CREATE TABLE routes (ord INTEGER, route_id VARCHAR, kind VARCHAR, agency_id VARCHAR, short_name VARCHAR,
      long_name VARCHAR, color VARCHAR, text_color VARCHAR, summary VARCHAR, search VARCHAR,
      f_path BOOLEAN, f_stops BOOLEAN, f_trips BOOLEAN, f_services BOOLEAN, f_attributes BOOLEAN,
      f_network BOOLEAN, shapes_new VARCHAR, shapes_all VARCHAR)`);
    const a = await con.createAppender('routes');
    ROUTES.forEach((r, ord) => {
      a.appendInteger(ord);
      for (const v of [
        r.route_id,
        routeKind(r),
        ['10', '2'].includes(r.route_id) ? 'A' : 'B',
        r.short_name,
        r.long_name,
        '',
        '',
        '',
      ])
        a.appendVarchar(v);
      a.appendVarchar(
        [r.route_id, r.short_name, r.long_name].map(normalizeText).join(SEP),
      );
      for (const f of [
        'path',
        'stops',
        'trips',
        'services',
        'attributes',
        'network',
      ] as const)
        a.appendBoolean(r.flags[f]);
      a.appendVarchar(r.route_id === '10' ? `${SEP}S1${SEP}` : '');
      a.appendVarchar(r.route_id === '10' ? `${SEP}S1${SEP}S0${SEP}` : '');
      a.endRow();
    });
    a.closeSync();
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

  it('finds the route of a shape, renamed or not', async () => {
    expect((await rows(routeOfShapeQuery('routes', 'S0')))[0]?.route_id).toBe(
      '10',
    );
    expect(await rows(routeOfShapeQuery('routes', 'S'))).toEqual([]);
  });

  describe('v2', () => {
    beforeAll(async () => {
      await con.run(`CREATE TABLE routes_v2 AS SELECT *,
        (CASE route_id WHEN '4' THEN 1 WHEN '10' THEN 2 END)::DOUBLE AS sort_order,
        '{"l":[],"a":[],"r":[]}' AS geom, NULL::DOUBLE AS min_lon, NULL::DOUBLE AS min_lat,
        NULL::DOUBLE AS max_lon, NULL::DOUBLE AS max_lat FROM routes`);
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
      expect(await listV2({ changes: ['trips'] })).toEqual(['4']);
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
        trips: 1,
        services: 0,
      });
      const kinds = await rows(routesV2KindCountsQuery('routes_v2', f));
      expect(Object.fromEntries(kinds.map((r) => [r.kind, r.n]))).toEqual({
        modified: 1,
      });
    });

    it('reads overview rows with their flags, in list order', async () => {
      const overview = (
        await rows(
          routesV2OverviewQuery('routes_v2', DEFAULT_V2_FILTERS, 'severity'),
        )
      ).map(toRouteV2Overview);
      expect(overview.map((r) => r.route_id)).toEqual(['3', '2', '10', '4']);
      expect(overview[3]).toMatchObject({
        route_id: '4',
        kind: 'modified',
        flags: { trips: true, stops: true, path: false },
        lines: [],
        bounds: null,
      });
    });
  });
});

describe('route overview rows', () => {
  it('decodes the overview polylines and bounds', () => {
    const line: Array<[number, number]> = [
      [2.1, 48.1],
      [2.2, 48.3],
    ];
    const r = toRouteOverview({
      route_id: 'R',
      kind: 'modified',
      geom: JSON.stringify({ l: [encodePolyline(line)], a: [], r: [] }),
      min_lon: 2.1,
      min_lat: 48.1,
      max_lon: 2.2,
      max_lat: 48.3,
    });
    expect(r.lines).toEqual([line]);
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
