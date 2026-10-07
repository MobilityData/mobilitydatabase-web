// Pure lon/lat shape helpers shared by the globe and the flat map. Kept free
// of three.js so the flat map doesn't pull it into its bundle.

/** [lon, lat] in degrees. */
export type LonLat = [number, number];
export type Ring = LonLat[];
/** Outer ring first, then holes. */
export type PolygonRings = Ring[];

export interface CountryFeature {
  id: string | number | undefined;
  name: string | undefined;
  polygons: PolygonRings[];
}

// ---------- TopoJSON -> polygons (minimal inline decoder) ----------
interface TopoGeometry {
  type: string;
  id?: string | number;
  properties?: { name?: string };
  arcs?: number[][] | number[][][];
}

export interface Topology {
  arcs: Array<Array<[number, number]>>;
  transform?: { scale: [number, number]; translate: [number, number] };
  objects: Record<string, { geometries: TopoGeometry[] }>;
}

export function decodeCountries(
  topology: Topology,
  objectName: string,
): CountryFeature[] {
  const { arcs, transform } = topology;
  const scale = transform?.scale ?? [1, 1];
  const translate = transform?.translate ?? [0, 0];

  function decodeArc(index: number): Ring {
    const reverse = index < 0;
    const arc = arcs[reverse ? ~index : index];
    let x = 0;
    let y = 0;
    const out: Ring = arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
    return reverse ? out.reverse() : out;
  }

  function ringFromArcs(arcIndices: number[]): Ring {
    const ring: Ring = [];
    for (const ai of arcIndices) {
      const pts = decodeArc(ai);
      if (ring.length) pts.shift();
      ring.push(...pts);
    }
    return ring;
  }

  return topology.objects[objectName].geometries.flatMap((g) => {
    let polygons: PolygonRings[];
    if (g.type === 'Polygon') {
      polygons = [(g.arcs as number[][]).map(ringFromArcs)];
    } else if (g.type === 'MultiPolygon') {
      polygons = (g.arcs as number[][][]).map((poly) => poly.map(ringFromArcs));
    } else {
      return [];
    }
    return [{ id: g.id, name: g.properties?.name, polygons }];
  });
}

// Wraps an angle to (-PI, PI]. rotation.y accumulates indefinitely under the
// ambient spin, so tweens need the *shortest* turn toward a target heading.
export function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  return angle - twoPi * Math.floor((angle + Math.PI) / twoPi);
}

export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// Keeps consecutive longitudes within 180° of each other so countries that
// straddle the antimeridian (e.g. Fiji) don't get a whole-globe bbox and a
// spurious triangulated sliver. lonLatToVec3 treats >180° as the same angle.
export function unwrapRingLongitudes(ring: Ring): Ring {
  if (!ring.length) return ring;
  const out: Ring = [[ring[0][0], ring[0][1]]];
  let prev = ring[0][0];
  for (let i = 1; i < ring.length; i++) {
    let lon = ring[i][0];
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push([lon, ring[i][1]]);
    prev = lon;
  }
  return out;
}

// A ring encircles a pole when its longitude winds a full turn (±360°).
// Antarctica's coastline is the only such ring in the country dataset.
export function ringEncirclesPole(ring: Ring): boolean {
  let total = 0;
  for (let i = 1; i < ring.length; i++) {
    let d = ring[i][0] - ring[i - 1][0];
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    total += d;
  }
  return Math.abs(total) > 300;
}

/** The largest outer ring (by planar area), with longitudes unwrapped. */
export function largestOuterRing(polygons: PolygonRings[]): Ring | null {
  let best: Ring | null = null;
  let bestArea = -1;
  for (const rings of polygons) {
    if (!rings[0]) continue;
    const ring = unwrapRingLongitudes(rings[0]);
    let area = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    }
    if (Math.abs(area) > bestArea) {
      bestArea = Math.abs(area);
      best = ring;
    }
  }
  return best;
}

/**
 * Centroid of the polygon with the largest outer ring, so the popup anchors
 * on a country's main landmass (mainland France, not an average pulled
 * toward French Guiana; the contiguous US, not a point dragged into Canada
 * by Alaska).
 */
export function mainlandCentroid(polygons: PolygonRings[]): LonLat {
  const best = largestOuterRing(polygons);
  if (!best) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (const [lon, lat] of best) {
    sx += lon;
    sy += lat;
  }
  return [sx / best.length, sy / best.length];
}
