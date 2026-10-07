import {
  clampView,
  MAP_HEIGHT,
  MAP_WIDTH,
  polygonsToPath,
  projectLonLat,
  viewForBounds,
  wrapLongitude,
} from './flat-map-geometry';

describe('flat-map-geometry', () => {
  it('projects the map extent into [0, MAP_WIDTH] x [0, MAP_HEIGHT]', () => {
    const [x0] = projectLonLat(-180, 0);
    const [x1] = projectLonLat(180, 0);
    const [cx, cy] = projectLonLat(0, 0);
    expect(x0).toBeCloseTo(0);
    expect(x1).toBeCloseTo(MAP_WIDTH);
    expect(cx).toBeCloseTo(MAP_WIDTH / 2);
    expect(cy).toBeGreaterThan(0);
    expect(cy).toBeLessThan(MAP_HEIGHT);
    // North is up.
    expect(projectLonLat(0, 60)[1]).toBeLessThan(cy);
  });

  it('wraps longitudes into [-180, 180)', () => {
    expect(wrapLongitude(190)).toBe(-170);
    expect(wrapLongitude(-190)).toBe(170);
    expect(wrapLongitude(45)).toBe(45);
  });

  it('draws an antimeridian-straddling polygon twice', () => {
    const straddling = polygonsToPath([
      [
        [
          [178, -16],
          [-179, -16],
          [-179, -18],
          [178, -18],
          [178, -16],
        ],
      ],
    ]);
    const plain = polygonsToPath([
      [
        [
          [10, 10],
          [20, 10],
          [20, 20],
          [10, 10],
        ],
      ],
    ]);
    expect(straddling.match(/M/g)).toHaveLength(2);
    expect(plain.match(/M/g)).toHaveLength(1);
  });

  it('keeps a zoomed view covering the map', () => {
    expect(clampView({ k: 0.5, x: 50, y: 50 }, 1, 8)).toEqual({
      k: 1,
      x: 0,
      y: 0,
    });
    const v = clampView({ k: 2, x: 100, y: -1e6 }, 1, 8);
    expect(v.x).toBe(0);
    expect(v.y).toBe(-MAP_HEIGHT);
  });

  it('zooms in more on small countries than large ones', () => {
    const opts = { minZoom: 1, maxZoom: 10 };
    const small = viewForBounds([100, 50, 105, 53], [102, 51], opts);
    const large = viewForBounds([50, 20, 200, 120], [120, 70], opts);
    expect(small.k).toBeGreaterThan(large.k);
  });
});
