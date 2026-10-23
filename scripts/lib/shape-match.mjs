/**
 * Is a renamed shape the same path? Agencies rename and re-digitise shapes
 * between exports (STM 11071 -> 1_1071, with new vertices), so shape_id
 * alone can't tell a renamed path from a trip moved to another street.
 *
 * Two shapes are the same path when every point of each lies within
 * PATH_SAME_M of the other (the threshold the Routes view uses for "path
 * changed"). Shapes are compared once per (base, new) pair, simplified
 * first so long shapes stay cheap.
 */

import { createHash } from 'node:crypto';

/** Paths closer than this everywhere are the same road. */
export const PATH_SAME_M = 30;
const SIMPLIFY_M = 4;

/** Local equirectangular projection in metres around `lat0`. */
function projector(lat0) {
  const k = Math.cos((lat0 * Math.PI) / 180) * 111320;
  return ([lon, lat]) => [lon * k, lat * 110540];
}

function pointSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer–Douglas–Peucker on projected points. */
function simplify(pts, tol) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [i, j] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = pointSegment(pts[k], pts[i], pts[j]);
      if (d > maxD) {
        maxD = d;
        idx = k;
      }
    }
    if (maxD > tol && idx !== -1) {
      keep[idx] = 1;
      stack.push([i, idx], [idx, j]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Largest distance from a point of `a` to the polyline `b`, early exit past `limit`. */
function maxDeviation(a, b, limit) {
  let worst = 0;
  for (const p of a) {
    let min = Infinity;
    if (b.length === 1) min = Math.hypot(p[0] - b[0][0], p[1] - b[0][1]);
    for (let i = 0; i + 1 < b.length && min > 0; i++) min = Math.min(min, pointSegment(p, b[i], b[i + 1]));
    worst = Math.max(worst, min);
    if (worst > limit) return worst;
  }
  return worst;
}

/** Exact fingerprint of a point list (rounded to ~1 m). */
function fingerprint(pts) {
  const h = createHash('sha1');
  for (const [lon, lat] of pts) h.update(`${lat.toFixed(5)},${lon.toFixed(5)};`);
  return h.digest('base64');
}

/**
 * Returns sameShape(baseShapeId, newShapeId) -> boolean, or null when either
 * feed has no shapes.txt. Takes each feed's loaded shapes (shape_id -> { pts }).
 */
export function shapeMatcher(baseShapes, newShapes) {
  if (baseShapes == null || newShapes == null) return null;
  // Shapes as loaded by the entity generator: shape_id -> { pts: [[lon, lat]] }.
  // `pts` may be built on each read (large feeds), so it is read lazily.
  const withFp = (shapes) => {
    const out = new Map();
    for (const [id, s] of shapes) {
      out.set(id, {
        get pts() {
          return s.pts;
        },
        get size() {
          return s.size ?? s.pts.length;
        },
        get fp() {
          return (this._fp ??= fingerprint(s.pts));
        },
      });
    }
    return out;
  };
  const base = withFp(baseShapes);
  const next = withFp(newShapes);
  const projected = new Map(); // "b:<id>" / "n:<id>" -> simplified projected points
  const geometry = (side, id, shape, lat0) => {
    const k = `${side}:${id}`;
    let g = projected.get(k);
    if (!g) projected.set(k, (g = simplify(shape.pts.map(projector(lat0)), SIMPLIFY_M)));
    return g;
  };
  const cache = new Map();
  return (bid, nid) => {
    const k = `${bid}\u0000${nid}`;
    let same = cache.get(k);
    if (same != null) return same;
    const b = base.get(bid);
    const n = next.get(nid);
    if (!b || !n || b.size === 0 || n.size === 0) same = false;
    else if (b.fp === n.fp) same = true;
    else {
      // One projection origin for both, so distances are comparable.
      const lat0 = b.pts[0][1];
      const gb = geometry('b', bid, b, lat0);
      const gn = geometry('n', nid, n, lat0);
      same = maxDeviation(gb, gn, PATH_SAME_M) <= PATH_SAME_M && maxDeviation(gn, gb, PATH_SAME_M) <= PATH_SAME_M;
    }
    cache.set(k, same);
    return same;
  };
}
