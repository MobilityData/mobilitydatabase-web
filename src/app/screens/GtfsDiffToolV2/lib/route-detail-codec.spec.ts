import type {
  LonLat,
  RouteDirectionDiff,
  RouteImpact,
  RouteShapeDiff,
} from './entity-diff-types';
import { packRouteDetail, unpackRouteDetail } from './route-detail-codec';

const A: LonLat[] = [
  [-73.6, 45.5],
  [-73.61, 45.51],
];
const B: LonLat[] = [
  [-73.7, 45.6],
  [-73.71, 45.61],
];
const STOPS_LINE: LonLat[] = [
  [-73.8, 45.7],
  [-73.81, 45.71],
];

function shape(
  id: string,
  base: LonLat[] | null,
  next: LonLat[] | null,
): RouteShapeDiff {
  return {
    shape_id: id,
    status: 'rerouted',
    deviation_m: 120,
    points: { base: 2, new: 2 },
    trips: { base: 1, new: 1 },
    directions: ['0'],
    other_routes: { base: [], new: [] },
    unused: { base: false, new: false },
    geometry: { base, new: next },
    diverge: { added: [], removed: [] },
  };
}

function direction(
  base: LonLat[] | null,
  next: LonLat[] | null,
): RouteDirectionDiff {
  return {
    direction_id: '0',
    headsign: { base: null, new: null },
    trips: { base: 1, new: 1 },
    pattern_count: { base: 1, new: 1 },
    shape_id: { base: 'S1', new: 'S1' },
    pattern_diff: [],
    geometry: { base, new: next },
    path_change_m: null,
    diverge: { added: [], removed: [] },
  };
}

type Lines = Pick<RouteImpact, 'directions' | 'shapes'>;

describe('route detail direction lines', () => {
  const route: Lines = {
    shapes: [shape('S1', A, B)],
    directions: [direction(A, B), direction(null, STOPS_LINE)],
  };

  it('replaces a line equal to a shape line with a reference', () => {
    const packed = packRouteDetail(route);
    expect(packed.directions[0].geometry).toEqual({
      base: { $shape: 0, side: 'base' },
      new: { $shape: 0, side: 'new' },
    });
    // No shape draws it: stays inline.
    expect(packed.directions[1].geometry).toEqual({
      base: null,
      new: STOPS_LINE,
    });
  });

  it('unpacks to the original detail', () => {
    expect(unpackRouteDetail(packRouteDetail(route))).toEqual(route);
  });

  it('leaves a detail written before the encoding unchanged', () => {
    expect(unpackRouteDetail(route)).toEqual(route);
  });
});
