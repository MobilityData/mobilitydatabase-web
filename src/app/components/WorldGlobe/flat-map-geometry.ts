import {
  type LonLat,
  type PolygonRings,
  type Ring,
  unwrapRingLongitudes,
} from './geo-shapes';

// Projected units per radian; the viewBox is sized from this.
const PROJECTION_SCALE = 100;
const DEG = Math.PI / 180;

// Latitude crop. Antarctica is skipped (as on the globe), so the map ends
// just below Tierra del Fuego; the top clears northern Greenland.
export const MAP_TOP_LAT = 85;
export const MAP_BOTTOM_LAT = -57;

/** Natural Earth I, in unshifted projected units (y grows north). */
function naturalEarthRaw(lon: number, lat: number): [number, number] {
  const phi = lat * DEG;
  const p2 = phi * phi;
  const p4 = p2 * p2;
  const x =
    lon *
    DEG *
    (0.8707 -
      0.131979 * p2 +
      p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  const y =
    phi *
    (1.007226 +
      p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
  return [x * PROJECTION_SCALE, y * PROJECTION_SCALE];
}

const [MAP_MAX_X] = naturalEarthRaw(180, 0);
const [, MAP_MAX_Y] = naturalEarthRaw(0, MAP_TOP_LAT);
const [, MAP_MIN_Y] = naturalEarthRaw(0, MAP_BOTTOM_LAT);

export const MAP_WIDTH = MAP_MAX_X * 2;
export const MAP_HEIGHT = MAP_MAX_Y - MAP_MIN_Y;

/**
 * Projects to SVG map units: origin top-left, y down, so the cropped map
 * spans [0, MAP_WIDTH] x [0, MAP_HEIGHT].
 */
export function projectLonLat(lon: number, lat: number): [number, number] {
  const [x, y] = naturalEarthRaw(lon, lat);
  return [x + MAP_MAX_X, MAP_MAX_Y - y];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function ringToPath(ring: Ring, lonShift: number): string {
  let d = '';
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = projectLonLat(ring[i][0] + lonShift, ring[i][1]);
    d += `${i === 0 ? 'M' : 'L'}${round1(x)},${round1(y)}`;
  }
  return `${d}Z`;
}

/**
 * SVG path for a country. Rings are unwrapped so antimeridian-straddling
 * countries (Russia, Fiji) stay contiguous; any part that spills past ±180°
 * is drawn again shifted a full turn, and the map outline's clipPath trims
 * both copies to the visible side.
 */
export function polygonsToPath(polygons: PolygonRings[]): string {
  let d = '';
  for (const rings of polygons) {
    if (!rings[0] || rings[0].length < 3) continue;
    const outer = unwrapRingLongitudes(rings[0]);
    const holes = rings.slice(1).map(unwrapRingLongitudes);
    let lonMin = Infinity;
    let lonMax = -Infinity;
    for (const [lon] of outer) {
      if (lon < lonMin) lonMin = lon;
      if (lon > lonMax) lonMax = lon;
    }
    const shifts = [0];
    if (lonMax > 180) shifts.push(-360);
    if (lonMin < -180) shifts.push(360);
    for (const shift of shifts) {
      d += ringToPath(outer, shift);
      for (const hole of holes) d += ringToPath(hole, shift);
    }
  }
  return d;
}

/** Wraps a longitude into [-180, 180). */
export function wrapLongitude(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Projected bounding box of a ring: [xMin, yMin, xMax, yMax]. */
export function projectedRingBounds(
  ring: Ring,
): [number, number, number, number] {
  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  // Clamp to the visible map so a wrapped sliver can't blow up the bbox.
  for (const [lon, lat] of ring) {
    const [x, y] = projectLonLat(Math.max(-180, Math.min(180, lon)), lat);
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (x > xMax) xMax = x;
    if (y > yMax) yMax = y;
  }
  return [xMin, yMin, xMax, yMax];
}

/**
 * The projected map outline (curved sides, flat top/bottom at the crop
 * latitudes). Used both as the ocean fill and as the country clipPath.
 */
export function buildOutlinePath(step = 2): string {
  const points: LonLat[] = [];
  for (let lat = MAP_TOP_LAT; lat >= MAP_BOTTOM_LAT; lat -= step) {
    points.push([-180, lat]);
  }
  points.push([-180, MAP_BOTTOM_LAT]);
  for (let lat = MAP_BOTTOM_LAT; lat <= MAP_TOP_LAT; lat += step) {
    points.push([180, lat]);
  }
  points.push([180, MAP_TOP_LAT]);
  return ringToPath(points, 0);
}

export interface MapView {
  /** Zoom factor, 1 = whole map. */
  k: number;
  /** Translation in map units, applied before scaling. */
  x: number;
  y: number;
}

export const IDENTITY_VIEW: MapView = { k: 1, x: 0, y: 0 };

/** Keeps the zoomed map covering the viewBox (no panning off the edge). */
export function clampView(
  { k, x, y }: MapView,
  minZoom: number,
  maxZoom: number,
): MapView {
  const kc = Math.min(maxZoom, Math.max(minZoom, k));
  return {
    k: kc,
    x: Math.min(0, Math.max(MAP_WIDTH * (1 - kc), x)),
    y: Math.min(0, Math.max(MAP_HEIGHT * (1 - kc), y)),
  };
}

/**
 * The view that zooms onto a bounding box, centred slightly below the
 * middle so a popup pinned above the anchor stays in frame.
 */
export function viewForBounds(
  [xMin, yMin, xMax, yMax]: [number, number, number, number],
  anchor: [number, number],
  {
    minZoom,
    maxZoom,
    padding = 3,
  }: { minZoom: number; maxZoom: number; padding?: number },
): MapView {
  const bw = Math.max(xMax - xMin, 1);
  const bh = Math.max(yMax - yMin, 1);
  const k = Math.min(
    maxZoom,
    Math.max(
      minZoom,
      Math.min(MAP_WIDTH / (bw * padding), MAP_HEIGHT / (bh * padding)),
    ),
  );
  return clampView(
    {
      k,
      x: MAP_WIDTH / 2 - anchor[0] * k,
      y: MAP_HEIGHT * 0.62 - anchor[1] * k,
    },
    minZoom,
    maxZoom,
  );
}
