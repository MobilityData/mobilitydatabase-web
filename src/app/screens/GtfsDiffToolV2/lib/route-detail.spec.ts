import { encodePolyline } from './entity-diff-codec';
import type { LonLat, RouteStopInfo } from './entity-diff-types';
import {
  type RouteRow,
  assembleRouteDetail,
  toRouteRow,
  toShapeRow,
} from './route-detail';
import type { RouteDir, ShapeRow, ShapeUse } from './route-tables';
import { routeStops } from './routes-utils';

const A: LonLat[] = [
  [2, 48],
  [2.01, 48.01],
];
const B: LonLat[] = [
  [2.1, 48.1],
  [2.2, 48.2],
];
const C: LonLat[] = [
  [3, 49],
  [3.1, 49.1],
];
const enc = (l: LonLat[]): string => encodePolyline(l);

const use = (route_id: string, direction_id: string, trips = 1): ShapeUse => ({
  route_id,
  direction_id,
  trips,
});
const dir = (route_id: string, direction_id: string): RouteDir => ({
  route_id,
  direction_id,
});

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

const ROUTE: RouteRow = {
  route_id: 'R',
  status: 'modified',
  agency_id: 'AG',
  short_name: '1',
  long_name: 'Line 1',
  route_type: '3',
  color: 'FF0000',
  text_color: 'FFFFFF',
  sort_order: 4,
  flags: {
    path: true,
    stops: true,
    trips: false,
    services: false,
    attributes: false,
    network: true,
  },
  network_base: 'N1',
  network_new: 'N2',
  stops_base: 10,
  stops_new: 11,
  directions: [
    {
      direction_id: '0',
      headsign_base: 'North',
      headsign_new: 'North',
      // Renamed: the base id is the row's renamed_from.
      shape_base: 'OLD',
      shape_new: 'NEW',
      path_change_m: null,
      diverge_added: [],
      diverge_removed: [],
    },
    {
      direction_id: '1',
      headsign_base: 'South',
      headsign_new: 'South bound',
      shape_base: 'RR',
      shape_new: 'RR',
      path_change_m: 120,
      diverge_added: [enc(A)],
      diverge_removed: [enc(B)],
    },
  ],
};

const SHAPES: ShapeRow[] = [
  shape({
    shape_id: 'NEW',
    main: true,
    status: 'renamed',
    renamed_from: 'OLD',
    geom_new: enc(A),
    uses_base: [use('R', '0', 3)],
    uses_new: [use('R', '0', 4), use('Q', '0', 2)],
    main_base: [dir('R', '0')],
    main_new: [dir('R', '0')],
  }),
  shape({
    shape_id: 'RR',
    main: true,
    status: 'rerouted',
    deviation_m: 120,
    geom_base: enc(B),
    geom_new: enc(C),
    diverge_added: [enc(A)],
    uses_base: [use('R', '1', 5), use('P', '1', 1)],
    uses_new: [use('R', '1', 6)],
    main_base: [dir('R', '1')],
    main_new: [dir('R', '1')],
  }),
  shape({
    shape_id: '10',
    status: 'added',
    points_base: 0,
    geom_new: enc(C),
    uses_new: [use('R', '1', 1)],
  }),
  shape({
    shape_id: '9',
    status: 'added',
    points_base: 0,
    geom_new: enc(B),
    uses_new: [use('R', '0', 1)],
  }),
  shape({
    shape_id: 'GONE',
    status: 'deleted',
    points_new: 0,
    geom_base: enc(B),
    uses_base: [use('R', '0', 2)],
  }),
  // Another route's shape: ignored.
  shape({ shape_id: 'OTHER', geom_new: enc(A), uses_new: [use('Q', '0')] }),
];

const STOP_INFO: Record<string, RouteStopInfo> = Object.fromEntries(
  ['S1', 'S2', 'S3', 'S4', 'S5'].map((id) => [
    id,
    { name: `Stop ${id}`, coord: [2, 48], status: 'modified', moved_m: 0 },
  ]),
);

const detail = assembleRouteDetail({
  route: ROUTE,
  shapes: SHAPES,
  stops: [
    // Newly served by direction 0.
    { stop_id: 'S1', moved_m: 0, served_base: [], served_new: [dir('R', '0')] },
    // Direction 1 dropped it.
    {
      stop_id: 'S2',
      moved_m: null,
      served_base: [dir('R', '1')],
      served_new: [],
    },
    // Served by both, moved.
    {
      stop_id: 'S3',
      moved_m: 40,
      served_base: [dir('R', '0')],
      served_new: [dir('R', '0')],
    },
    // Moved from direction 1 to 0.
    {
      stop_id: 'S4',
      moved_m: 0,
      served_base: [dir('R', '1')],
      served_new: [dir('R', '0')],
    },
    // Another route's stop.
    { stop_id: 'S5', moved_m: 0, served_base: [], served_new: [dir('Q', '0')] },
  ],
  fieldChanges: [{ field: 'route_color', base_value: '00', new_value: 'FF' }],
  stopInfo: STOP_INFO,
});

describe('assembleRouteDetail', () => {
  it('copies the routes row, and leaves what the tables lack empty', () => {
    expect(detail).toMatchObject({
      route_id: 'R',
      status: 'modified',
      agency_id: 'AG',
      short_name: '1',
      route_type: '3',
      sort_order: 4,
      flags: ROUTE.flags,
      networks: { base: 'N1', new: 'N2' },
      field_changes: [
        { field: 'route_color', base_value: '00', new_value: 'FF' },
      ],
      trips: { base: 0, new: 0 },
      services: { base: [], new: [] },
    });
    expect(detail.typical_trips).toBeUndefined();
  });

  it('draws each direction from its main shapes', () => {
    const [d0, d1] = detail.directions;
    expect(d0).toEqual({
      direction_id: '0',
      headsign: { base: 'North', new: 'North' },
      trips: { base: 0, new: 0 },
      pattern_count: { base: 0, new: 0 },
      shape_id: { base: 'OLD', new: 'NEW' },
      pattern_diff: [],
      // Renamed with the same line: geom_new stands for both.
      geometry: { base: A, new: A },
      path_change_m: null,
      diverge: { added: [], removed: [] },
    });
    expect(d1.geometry).toEqual({ base: B, new: C });
    expect(d1.diverge).toEqual({ added: [A], removed: [B] });
    expect(d1.headsign).toEqual({ base: 'South', new: 'South bound' });
  });

  it("lists the route's shapes in the build's order", () => {
    const shapes = detail.shapes ?? [];
    expect(shapes.map((s) => s.shape_id)).toEqual([
      'RR',
      '9',
      '10',
      'GONE',
      'NEW',
    ]);
    const [rr, nine, , gone, renamed] = shapes;
    expect(rr).toEqual({
      shape_id: 'RR',
      status: 'rerouted',
      deviation_m: 120,
      points: { base: 2, new: 2 },
      trips: { base: 5, new: 6 },
      directions: ['1'],
      other_routes: { base: ['P'], new: [] },
      unused: { base: false, new: false },
      geometry: { base: B, new: C },
      diverge: { added: [A], removed: [] },
    });
    expect(nine.geometry).toEqual({ base: null, new: B });
    expect(gone.geometry).toEqual({ base: B, new: null });
    expect(renamed).toMatchObject({
      renamed_from: 'OLD',
      trips: { base: 3, new: 4 },
      other_routes: { base: [], new: ['Q'] },
      geometry: { base: null, new: A },
    });
  });

  it("lists each direction's stops, and the route's", () => {
    expect(detail.direction_stops).toEqual({
      '0': { added: ['S1', 'S4'], removed: [], moved: ['S3'] },
      '1': { added: [], removed: ['S2', 'S4'], moved: [] },
    });
    expect(detail.stops).toEqual({
      base_count: 10,
      new_count: 11,
      // S4 moved between directions: still served by the route.
      added: ['S1'],
      removed: ['S2'],
    });
    expect(Object.keys(detail.stop_info).sort()).toEqual([
      'S1',
      'S2',
      'S3',
      'S4',
    ]);
    expect(routeStops(detail)).toEqual([
      { stop_id: 'S1', relation: 'added' },
      { stop_id: 'S2', relation: 'removed' },
      { stop_id: 'S4', relation: 'kept' },
      { stop_id: 'S3', relation: 'kept' },
    ]);
  });

  it('gives every direction an entry, with no stops', () => {
    const d = assembleRouteDetail({
      route: ROUTE,
      shapes: [],
      stops: [],
      fieldChanges: [],
      stopInfo: {},
    });
    expect(d.direction_stops['1']).toEqual({
      added: [],
      removed: [],
      moved: [],
    });
    expect(d.directions[0].geometry).toEqual({ base: null, new: null });
    expect(d.shapes).toEqual([]);
  });
});

describe('reading table rows', () => {
  it('parses list columns read as JSON text', () => {
    expect(
      toRouteRow({
        route_id: 'R',
        status: 'added',
        f_path: true,
        stops_new: 3,
        directions: JSON.stringify([
          {
            direction_id: '',
            shape_new: 'S',
            diverge_added: null,
            diverge_removed: [],
          },
        ]),
      }),
    ).toMatchObject({
      flags: { path: true, stops: false },
      stops_base: 0,
      stops_new: 3,
      sort_order: null,
      directions: [
        {
          direction_id: '',
          shape_base: null,
          shape_new: 'S',
          diverge_added: [],
        },
      ],
    });
    expect(
      toShapeRow({
        shape_id: 'S',
        main: true,
        uses_new: JSON.stringify([use('R', '0', 2)]),
        main_base: null,
      }),
    ).toMatchObject({
      main: true,
      uses_new: [use('R', '0', 2)],
      uses_base: [],
      main_base: [],
    });
  });
});
