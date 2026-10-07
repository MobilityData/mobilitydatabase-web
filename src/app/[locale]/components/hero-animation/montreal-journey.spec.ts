import {
  createProjection,
  createTimeline,
  distanceAlong,
  journeyAt,
  measurePath,
  pointAlong,
  tileRangeBounds,
  tilesCovering,
  toMercator,
  type LegId,
} from './montreal-journey';

const FOCUS: [number, number] = [-73.574, 45.4945];

describe('createProjection', () => {
  const projection = createProjection(FOCUS, 1);

  it('puts the focus at the world origin', () => {
    const [x, z] = projection.toWorld(FOCUS);
    expect(x).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(0, 9);
  });

  it('maps east to +x and south to +z, in kilometres', () => {
    // 0.01 deg of longitude at 45.5 N is ~0.78 km.
    const [east] = projection.toWorld([FOCUS[0] + 0.01, FOCUS[1]]);
    expect(east).toBeCloseTo(0.78, 2);
    // 0.01 deg of latitude is ~1.11 km.
    const [, south] = projection.toWorld([FOCUS[0], FOCUS[1] - 0.01]);
    expect(south).toBeCloseTo(1.11, 2);
  });

  it('matches normalized Web Mercator at the origin', () => {
    expect(projection.origin).toEqual(toMercator(FOCUS));
  });
});

describe('tilesCovering', () => {
  const projection = createProjection(FOCUS, 1);

  it('returns a tile range whose bounds enclose the requested area', () => {
    const range = tilesCovering(projection, 13, 7.5, 7.5);
    const [west, north, east, south] = tileRangeBounds(projection, range);
    expect(west).toBeLessThanOrEqual(-7.5);
    expect(east).toBeGreaterThanOrEqual(7.5);
    expect(north).toBeLessThanOrEqual(-7.5);
    expect(south).toBeGreaterThanOrEqual(7.5);
    // Montréal at z13: tiles are ~3.4 km, so 5 or 6 per axis.
    expect(range.maxX - range.minX + 1).toBeLessThanOrEqual(6);
    expect(range.maxY - range.minY + 1).toBeLessThanOrEqual(6);
  });
});

describe('measurePath / pointAlong / distanceAlong', () => {
  const path = measurePath([
    [0, 0],
    [3, 0],
    [3, 4],
  ]);

  it('measures cumulative distances', () => {
    expect(path.distances).toEqual([0, 3, 7]);
    expect(path.length).toBe(7);
  });

  it('interpolates along segments and clamps at the ends', () => {
    expect(pointAlong(path, 1.5)).toEqual([1.5, 0]);
    expect(pointAlong(path, 5)).toEqual([3, 2]);
    expect(pointAlong(path, -1)).toEqual([0, 0]);
    expect(pointAlong(path, 99)).toEqual([3, 4]);
  });

  it('finds the distance along the path of the nearest point', () => {
    expect(distanceAlong(path, [1, 0.5])).toBeCloseTo(1);
    expect(distanceAlong(path, [4, 2])).toBeCloseTo(5);
  });
});

describe('journeyAt', () => {
  const lengths: Record<LegId, number> = {
    bike: 2,
    walk: 0.1,
    orange: 6,
    yellow: 4,
  };
  const timing = {
    bike: 4,
    walk: 1,
    toAlert: 2,
    delay: 1,
    fromAlert: 2,
    transfer: 1,
    yellow: 2,
    arrived: 2,
    reset: 1,
  };
  const timeline = createTimeline(lengths, 1.5, timing);

  it('sums every step into the loop duration', () => {
    expect(timeline.duration).toBe(16);
  });

  it('starts on the bike at the dock with nothing traveled', () => {
    const state = journeyAt(timeline, 0);
    expect(state.leg).toBe('bike');
    expect(state.phase).toBe('riding');
    expect(state.distance).toBe(0);
    expect(state.traveled).toEqual({ bike: 0, walk: 0, orange: 0, yellow: 0 });
    expect(state.presence).toBe(1);
  });

  it('is halfway along the bike leg halfway through its step', () => {
    const state = journeyAt(timeline, 2);
    expect(state.distance).toBeCloseTo(1);
    expect(state.traveled.bike).toBeCloseTo(1);
  });

  it('holds at the alert station while delayed', () => {
    const state = journeyAt(timeline, 7.5);
    expect(state.leg).toBe('orange');
    expect(state.phase).toBe('delayed');
    expect(state.distance).toBe(1.5);
    // Earlier legs count as fully traveled.
    expect(state.traveled.bike).toBe(2);
    expect(state.traveled.walk).toBe(0.1);
    expect(state.traveled.yellow).toBe(0);
  });

  it('transfers at the start of the yellow leg with orange complete', () => {
    const state = journeyAt(timeline, 10.5);
    expect(state.leg).toBe('yellow');
    expect(state.phase).toBe('transfer');
    expect(state.distance).toBe(0);
    expect(state.traveled.orange).toBe(6);
  });

  it('arrives at the end, then fades out before looping', () => {
    expect(journeyAt(timeline, 13).phase).toBe('arrived');
    expect(journeyAt(timeline, 13).distance).toBe(4);
    const reset = journeyAt(timeline, 15.5);
    expect(reset.phase).toBe('reset');
    expect(reset.presence).toBeCloseTo(0.5);
  });

  it('loops', () => {
    expect(journeyAt(timeline, 16 + 2)).toEqual(journeyAt(timeline, 2));
  });
});
