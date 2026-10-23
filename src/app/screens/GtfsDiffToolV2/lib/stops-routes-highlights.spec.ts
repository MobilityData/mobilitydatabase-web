import type {
  RouteImpact,
  RoutesMapSource,
  StopChange,
  StopsMapSource,
} from './entity-diff-types';
import { stopsHighlights } from './stops-highlights';
import { routesHighlights } from './routes-highlights';
import { categoryFileRows } from './file-stats';

function stop(over: Partial<StopChange>): StopChange {
  return {
    stop_id: 'S',
    status: 'modified',
    name: 'Stop',
    base: { stop_name: 'Stop' },
    new: { stop_name: 'Stop' },
    base_coord: [0, 0],
    new_coord: [0, 0],
    field_changes: [],
    moved_m: 0,
    moved: false,
    route_ids: { base: [], new: [] },
    ...over,
  };
}

function stopsMap(stops: StopChange[]): StopsMapSource {
  return {
    columns: [],
    move_threshold_m: 1,
    counts: { added: 0, deleted: 0, modified: 0, unchanged: 0, moved: 0 },
    stops,
    all_stops: { base: [], new: [] },
    routes: {},
  };
}

describe('stops highlights', () => {
  it('ranks served removals and accessibility first, with entity rows', () => {
    const h = stopsHighlights(
      stopsMap([
        stop({
          stop_id: 'A',
          status: 'deleted',
          new: null,
          route_ids: { base: ['R1'], new: [] },
        }),
        stop({ stop_id: 'B', status: 'deleted', new: null }), // nobody served it
        stop({
          stop_id: 'C',
          base: { stop_name: 'C', wheelchair_boarding: '1' },
          new: { stop_name: 'C', wheelchair_boarding: '2' },
          field_changes: [
            { field: 'wheelchair_boarding', base_value: '1', new_value: '2' },
          ],
        }),
        stop({ stop_id: 'D', moved_m: 450, moved: true }),
        stop({ stop_id: 'E', moved_m: 40, moved: true }), // under 100 m
        stop({
          stop_id: 'F',
          base: { stop_name: 'Old' },
          new: { stop_name: 'New' },
          field_changes: [
            { field: 'stop_name', base_value: 'Old', new_value: 'New' },
          ],
        }),
        stop({ stop_id: 'G', status: 'added', base: null }),
      ]),
      (id) => `Line ${id}`,
    );
    expect(h.map((x) => x.id)).toEqual([
      'served_removed',
      'wheelchair_lost',
      'moved_far',
      'renamed',
      'new_unserved',
    ]);
    expect(h[0].title).toBe('1 stop removed that routes served');
    expect(h[0].entities).toEqual([
      { id: 'A', label: 'Stop', note: 'served by Line R1' },
    ]);
    expect(h[2].entities?.map((e) => e.id)).toEqual(['D']);
    expect(h[3].entities?.[0].note).toBe('was “Old”');
  });

  it('finds nothing in a quiet diff', () => {
    expect(stopsHighlights(stopsMap([stop({ moved_m: 0.3 })]))).toEqual([]);
  });
});

function route(over: Partial<RouteImpact>): RouteImpact {
  return {
    route_id: 'R',
    status: 'modified',
    short_name: 'R',
    long_name: 'Route',
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
    },
    networks: { base: null, new: null },
    trips: { base: 10, new: 10 },
    services: { base: [], new: [] },
    stops: { base_count: 10, new_count: 10, added: [], removed: [] },
    directions: [],
    ...over,
  };
}

function routesMap(
  routes: RouteImpact[],
  over: Partial<RoutesMapSource> = {},
): RoutesMapSource {
  return {
    columns: [],
    path_change_threshold_m: 30,
    counts: { added: 0, deleted: 0, modified: 0, unchanged: 0 },
    routes,
    stops: {},
    ...over,
  };
}

describe('routes highlights', () => {
  it('flags removals, mode changes, dropped stops and re-routes', () => {
    const h = routesHighlights(
      routesMap(
        [
          route({
            route_id: 'gone',
            short_name: 'G',
            status: 'deleted',
            trips: { base: 7, new: 0 },
          }),
          route({
            route_id: 'tram',
            short_name: 'T',
            field_changes: [
              { field: 'route_type', base_value: '3', new_value: '0' },
            ],
          }),
          route({
            route_id: 'cut',
            short_name: 'C',
            stops: {
              base_count: 20,
              new_count: 15,
              added: [],
              removed: ['a', 'b', 'c', 'd', 'e'],
            },
          }),
          route({
            route_id: 'moved',
            short_name: 'M',
            flags: {
              attributes: false,
              stops: false,
              path: true,
              trips: false,
              services: false,
              network: false,
            },
            shapes: [
              {
                shape_id: 'sh',
                status: 'rerouted',
                deviation_m: 1200,
                points: { base: 1, new: 1 },
                trips: { base: 1, new: 1 },
                directions: ['0'],
                other_routes: { base: [], new: [] },
                unused: { base: false, new: false },
                geometry: { base: null, new: null },
                diverge: { added: [], removed: [] },
              },
            ],
          }),
        ],
        {
          unused_shapes: [
            {
              shape_id: 'x',
              status: 'unchanged',
              deviation_m: 0,
              points: { base: 3, new: 3 },
              unused: { base: true, new: true },
              geometry: { base: null, new: null },
            },
          ],
        },
      ),
    );
    expect(h.map((x) => x.id)).toEqual([
      'routes_removed',
      'mode_changed',
      'stops_dropped',
      'rerouted',
      'unused_shapes',
    ]);
    // Shown by short name, opened by route_id.
    expect(h[0].entities?.[0]).toEqual({
      id: 'G',
      label: 'Route',
      note: 'had 7 trips',
      openId: 'gone',
    });
    expect(h[2].entities?.[0].note).toBe('−5 stops (20 → 15)');
    expect(h[3].entities?.[0].note).toBe('up to 1.2 km');
  });
});

describe('overview file rows', () => {
  it('uses raw row counts when a file has a raw table', () => {
    const rows = categoryFileRows(
      [
        {
          file: 'routes.txt',
          primary_key: [],
          child_files: [],
          present: { base: true, new: true },
          total: { base: 5, new: 4 },
          counts: { added: 0, deleted: 1, modified: 2, unchanged: 2 },
          changes: [],
        },
        {
          file: 'shapes.txt',
          primary_key: [],
          child_files: [],
          present: { base: true, new: true },
          total: { base: 9, new: 9 },
          counts: { added: 0, deleted: 0, modified: 9, unchanged: 0 },
          changes: [],
        },
      ],
      [
        {
          file: 'shapes.txt',
          path: 'raw/shapes.parquet',
          rows: 0,
          bytes: 0,
          columns: [],
          counts: {
            added: 10,
            deleted: 5,
            modified: 20,
            id_only: 3,
            unchanged: 100,
          },
        },
      ],
    );
    expect(rows).toEqual([
      {
        file: 'routes.txt',
        before: 5,
        after: 4,
        added: 0,
        removed: 1,
        modified: 2,
      },
      {
        file: 'shapes.txt',
        before: 128,
        after: 133,
        added: 10,
        removed: 5,
        modified: 20,
      },
    ]);
  });

  it('puts the primary file first', () => {
    const et = (file: string) => ({
      file,
      primary_key: [],
      child_files: [],
      present: { base: true, new: true },
      total: { base: 1, new: 1 },
      counts: { added: 0, deleted: 0, modified: 0, unchanged: 1 },
      changes: [],
    });
    expect(
      categoryFileRows(
        [et('shapes.txt'), et('routes.txt')],
        [],
        'routes.txt',
      ).map((r) => r.file),
    ).toEqual(['routes.txt', 'shapes.txt']);
  });
});
