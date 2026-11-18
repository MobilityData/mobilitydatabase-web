import type {
  RouteDetail,
  RouteDirectionDiff,
  RouteShapeDiff,
} from './entity-diff-types';
import {
  directionLabel,
  directionPresence,
  directionShapes,
  directionSummaries,
  headsignWas,
  parseDirParam,
  selectedDirections,
  stopCountLabel,
  stopMarkers,
  stopsForDirection,
  withDirParam,
} from './routes-v2-directions';

function dir(
  id: string,
  over: Partial<RouteDirectionDiff> = {},
): RouteDirectionDiff {
  return {
    direction_id: id,
    headsign: { base: 'A', new: 'A' },
    trips: { base: 0, new: 0 },
    pattern_count: { base: 0, new: 0 },
    shape_id: { base: `sh${id}`, new: `sh${id}` },
    pattern_diff: [],
    geometry: {
      base: [
        [0, 0],
        [1, 1],
      ],
      new: [
        [0, 0],
        [1, 1],
      ],
    },
    path_change_m: 0,
    diverge: { added: [], removed: [] },
    ...over,
  };
}

function shape(
  id: string,
  directions: string[],
  over: Partial<RouteShapeDiff> = {},
): RouteShapeDiff {
  return {
    shape_id: id,
    status: 'unchanged',
    deviation_m: null,
    points: { base: 2, new: 2 },
    trips: { base: 1, new: 1 },
    directions,
    other_routes: { base: [], new: [] },
    unused: { base: false, new: false },
    geometry: { base: null, new: null },
    diverge: { added: [], removed: [] },
    ...over,
  };
}

type StopsPart = Pick<RouteDetail, 'direction_stops' | 'stops'>;

const ROUTE: StopsPart & Pick<RouteDetail, 'directions'> = {
  directions: [dir('0'), dir('1')],
  stops: { base_count: 0, new_count: 0, added: ['R1'], removed: [] },
  direction_stops: {
    '0': { added: ['S1', 'S2'], removed: ['S3'], moved: ['M1'] },
    '1': { added: ['S3'], removed: [], moved: ['M1', 'M2'] },
  },
};

describe('direction labels', () => {
  it('labels by the new headsign, else the base one', () => {
    expect(
      directionLabel(dir('0', { headsign: { base: 'X', new: 'Y' } })),
    ).toBe('0 → Y');
    expect(
      directionLabel(dir('', { headsign: { base: 'X', new: null } })),
    ).toBe('— → X');
    expect(
      directionLabel(dir('1', { headsign: { base: null, new: null } })),
    ).toBe('Direction 1');
  });

  it('notes a changed headsign', () => {
    expect(headsignWas(dir('0', { headsign: { base: 'X', new: 'Y' } }))).toBe(
      'X',
    );
    expect(headsignWas(dir('0'))).toBeNull();
    expect(headsignWas(dir('0', { headsign: { base: null, new: 'Y' } }))).toBe(
      null,
    );
  });

  it('tells directions only in one feed', () => {
    const onlyNew = dir('0', {
      headsign: { base: null, new: 'Y' },
      shape_id: { base: null, new: 'a' },
      geometry: { base: null, new: [[0, 0]] },
    });
    const onlyBase = dir('0', {
      headsign: { base: 'X', new: null },
      shape_id: { base: 'a', new: null },
      geometry: { base: [[0, 0]], new: null },
    });
    expect(directionPresence(onlyNew)).toBe('added');
    expect(directionPresence(onlyBase)).toBe('removed');
    expect(directionPresence(dir('0'))).toBe('both');
  });
});

describe('directionSummaries', () => {
  it('flags path changes past the threshold, not a renamed main shape', () => {
    const route = {
      ...ROUTE,
      directions: [
        dir('0', { path_change_m: 45 }),
        dir('1', { shape_id: { base: 'a', new: 'b' } }),
        dir('2', { path_change_m: 10 }),
      ],
    };
    const s = directionSummaries(route, 30);
    expect(s.map((x) => x.pathChanged)).toEqual([true, false, false]);
    expect(s[0]).toMatchObject({ added: 2, removed: 1, moved: 1 });
    expect(s[2]).toMatchObject({ added: 0, removed: 0, moved: 0 });
  });

  it('formats the stop chip', () => {
    expect(stopCountLabel(3, 1)).toBe('+3 −1 stops');
    expect(stopCountLabel(0, 1)).toBe('−1 stop');
    expect(stopCountLabel(0, 0)).toBeNull();
  });
});

describe('stopsForDirection', () => {
  it("returns one direction's stops", () => {
    expect(stopsForDirection(ROUTE, '1')).toEqual(ROUTE.direction_stops['1']);
    expect(stopsForDirection(ROUTE, '9')).toEqual({
      added: [],
      removed: [],
      moved: [],
    });
  });

  it('unions every direction and the route stops, deduplicated', () => {
    expect(stopsForDirection(ROUTE, null)).toEqual({
      added: ['S1', 'S2', 'S3', 'R1'],
      removed: ['S3'],
      moved: ['M1', 'M2'],
    });
  });

  it('draws one marker per stop', () => {
    expect(stopMarkers(stopsForDirection(ROUTE, null))).toEqual([
      { stop_id: 'S1', relation: 'added' },
      { stop_id: 'S2', relation: 'added' },
      { stop_id: 'S3', relation: 'added' },
      { stop_id: 'R1', relation: 'added' },
      { stop_id: 'M1', relation: 'moved' },
      { stop_id: 'M2', relation: 'moved' },
    ]);
  });
});

describe('selected direction', () => {
  it('filters directions and shapes, main shapes first', () => {
    expect(
      selectedDirections(ROUTE.directions, '1').map((d) => d.direction_id),
    ).toEqual(['1']);
    expect(selectedDirections(ROUTE.directions, null)).toHaveLength(2);
    const shapes = [
      shape('x', ['0', '1']),
      shape('new1', ['1'], { renamed_from: 'sh1', status: 'renamed' }),
      shape('sh0', ['0']),
    ];
    expect(
      directionShapes(shapes, ROUTE.directions, '1').map((s) => s.shape_id),
    ).toEqual(['new1', 'x']);
    expect(
      directionShapes(shapes, ROUTE.directions, '0').map((s) => s.shape_id),
    ).toEqual(['sh0', 'x']);
    expect(directionShapes(shapes, ROUTE.directions, null)).toBe(shapes);
  });

  it('reads ?dir= against the route directions', () => {
    expect(parseDirParam('1', ['0', '1'])).toBe('1');
    expect(parseDirParam('7', ['0', '1'])).toBeNull();
    expect(parseDirParam(null, ['0', '1'])).toBeNull();
    expect(parseDirParam('0', ['0'])).toBeNull();
    expect(parseDirParam('', ['', '0'])).toBe('');
  });

  it('writes ?dir= next to the other parameters', () => {
    expect(withDirParam('route=R1', '0')).toBe('route=R1&dir=0');
    expect(withDirParam('?route=R1&dir=0', '1')).toBe('route=R1&dir=1');
    expect(withDirParam('route=R1&dir=0', null)).toBe('route=R1');
  });
});
