import type { RouteImpact, RouteShapeDiff } from './entity-diff-types';
import { parseLocationHash, toFocusHash } from './diff-nav';
import {
  isPathChangingShape,
  maxPathChange,
  routeSummary,
  shapeBounds,
  shapeDeviationText,
} from './routes-utils';

function shape(over: Partial<RouteShapeDiff>): RouteShapeDiff {
  return {
    shape_id: 'S1',
    status: 'unchanged',
    deviation_m: 0,
    points: { base: 10, new: 10 },
    trips: { base: 1, new: 1 },
    directions: ['0'],
    other_routes: { base: [], new: [] },
    unused: { base: false, new: false },
    geometry: { base: null, new: null },
    diverge: { added: [], removed: [] },
    ...over,
  };
}

function route(over: Partial<RouteImpact>): RouteImpact {
  return {
    route_id: 'R1',
    status: 'modified',
    short_name: 'R1',
    long_name: 'Route 1',
    route_type: '3',
    color: '',
    text_color: '',
    base: null,
    new: null,
    field_changes: [],
    flags: {
      attributes: false,
      stops: false,
      path: true,
      trips: false,
      services: false,
      network: false,
    },
    networks: { base: null, new: null },
    trips: { base: 1, new: 1 },
    services: { base: [], new: [] },
    stops: { base_count: 2, new_count: 2, added: [], removed: [] },
    directions: [],
    ...over,
  };
}

describe('isPathChangingShape', () => {
  it('counts re-routed shapes, and added/removed ones only on new road', () => {
    expect(
      isPathChangingShape(shape({ status: 'rerouted', deviation_m: 40 }), 30),
    ).toBe(true);
    expect(
      isPathChangingShape(shape({ status: 'redrawn', deviation_m: 25 }), 30),
    ).toBe(false);
    expect(
      isPathChangingShape(shape({ status: 'added', deviation_m: 9 }), 30),
    ).toBe(false);
    expect(
      isPathChangingShape(shape({ status: 'added', deviation_m: 180 }), 30),
    ).toBe(true);
    // Nothing to compare with (e.g. a route's first shape): it is all new road.
    expect(
      isPathChangingShape(shape({ status: 'deleted', deviation_m: null }), 30),
    ).toBe(true);
    expect(
      isPathChangingShape(shape({ status: 'renamed', deviation_m: 0 }), 30),
    ).toBe(false);
  });
});

describe('shapeDeviationText', () => {
  it('explains added and removed shapes against the route', () => {
    expect(
      shapeDeviationText(shape({ status: 'added', deviation_m: 9 }), 30),
    ).toBe("Follows the route's existing roads (within 9 m)");
    expect(
      shapeDeviationText(shape({ status: 'deleted', deviation_m: 724 }), 30),
    ).toBe("Abandoned road, up to 724 m from the route's other shapes");
    expect(
      shapeDeviationText(shape({ status: 'rerouted', deviation_m: 4270 }), 30),
    ).toBe('4.3 km');
  });
});

describe('maxPathChange / routeSummary', () => {
  it('includes path-changing shapes beyond the main patterns', () => {
    const r = route({
      shapes: [
        shape({ status: 'redrawn', deviation_m: 25 }),
        shape({ shape_id: 'S2', status: 'added', deviation_m: 180 }),
        shape({ shape_id: 'S3', status: 'added', deviation_m: 12 }),
      ],
    });
    expect(maxPathChange(r, 30)).toBe(180);
    expect(routeSummary(r, 30)).toBe('path changed (up to 180 m)');
  });

  it('works on diffs built before routes carried shapes', () => {
    expect(maxPathChange(route({ shapes: undefined }), 30)).toBeNull();
  });
});

describe('shapeBounds', () => {
  it('spans both versions of the shape', () => {
    const b = shapeBounds(
      shape({
        geometry: {
          base: [
            [2, 41],
            [2.1, 41.2],
          ],
          new: [[1.9, 41.1]],
        },
      }),
    );
    expect(b).toEqual([
      [1.9, 41],
      [2.1, 41.2],
    ]);
  });
});

describe('shape focus hashes', () => {
  it('round-trips a shape focus on the routes page', () => {
    const hash = toFocusHash({
      tab: 'routes',
      kind: 'shape',
      id: 'C6-A01_SHP',
    });
    expect(hash).toBe('#shape/C6-A01_SHP');
    expect(parseLocationHash(hash, 'routes')).toEqual({
      tab: 'routes',
      kind: 'shape',
      id: 'C6-A01_SHP',
    });
  });
});
