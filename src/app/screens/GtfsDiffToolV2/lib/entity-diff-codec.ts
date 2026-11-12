/**
 * Lossless polyline encoding for the per-category detail files (maps,
 * calendar) and the route detail column: every coordinate list
 * ([[lon, lat], …] at 1e-5 precision) becomes an encoded polyline string,
 * { $pl: "…" }. Everything else is stored as plain JSON.
 *
 * decodeDeep(encodeDeep(doc)) is deep-equal to doc; the UI only ever sees
 * the decoded form. Plain (unencoded) files decode unchanged.
 *
 * Self-contained and type-strippable on purpose: the Node generators import
 * this file directly.
 */

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

type JsonObject = { [key: string]: Json };

function isPlainObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** JSON.parse creates an own "__proto__" property; plain assignment wouldn't. */
function setOwn(obj: JsonObject, key: string, value: Json): void {
  if (key === '__proto__') {
    Object.defineProperty(obj, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } else {
    obj[key] = value;
  }
}

/** Encoded polyline (Google's algorithm, 1e-5 precision) of a coordinate list. */
interface PolylineValue {
  $pl: string;
}

const POLYLINE_SCALE = 1e5;

function isPolyline(v: unknown): v is PolylineValue {
  return (
    isPlainObject(v) &&
    typeof (v as { $pl?: unknown }).$pl === 'string' &&
    Object.keys(v).length === 1
  );
}

/** [[x, y], …] of at least two points, every value exact at 1e-5. */
function isCoordinateList(v: Json[]): v is number[][] {
  if (v.length < 2) return false;
  return v.every(
    (p) =>
      Array.isArray(p) &&
      p.length === 2 &&
      p.every(
        (x) =>
          typeof x === 'number' &&
          Number.isFinite(x) &&
          !Object.is(x, -0) &&
          Math.round(x * POLYLINE_SCALE) / POLYLINE_SCALE === x,
      ),
  );
}

function encodeSigned(n: number, out: string[]): void {
  let v = n < 0 ? ~(n << 1) : n << 1;
  while (v >= 0x20) {
    out.push(String.fromCharCode((0x20 | (v & 0x1f)) + 63));
    v >>= 5;
  }
  out.push(String.fromCharCode(v + 63));
}

export function encodePolyline(points: number[][]): string {
  const out: string[] = [];
  let px = 0;
  let py = 0;
  for (const [x, y] of points) {
    const ix = Math.round(x * POLYLINE_SCALE);
    const iy = Math.round(y * POLYLINE_SCALE);
    encodeSigned(ix - px, out);
    encodeSigned(iy - py, out);
    px = ix;
    py = iy;
  }
  return out.join('');
}

export function decodePolyline(s: string): number[][] {
  const points: number[][] = [];
  let i = 0;
  let x = 0;
  let y = 0;
  const next = (): number => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = s.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < s.length) {
    x += next();
    y += next();
    points.push([x / POLYLINE_SCALE, y / POLYLINE_SCALE]);
  }
  return points;
}

/**
 * Encode a whole document: coordinate lists as polylines (when exactly
 * representable), at any depth. Undefined properties are dropped, as
 * JSON.stringify would.
 */
export function encodeDeep(value: Json): Json {
  if (Array.isArray(value)) {
    if (isCoordinateList(value)) {
      const pl = encodePolyline(value);
      // Integer overflow guard: only keep what decodes back exactly.
      const back = decodePolyline(pl);
      if (back.every((p, k) => p[0] === value[k][0] && p[1] === value[k][1]))
        return { $pl: pl };
    }
    return value.map(encodeDeep);
  }
  if (isPlainObject(value)) {
    const out: JsonObject = {};
    for (const [k, v] of Object.entries(value))
      if (v !== undefined) setOwn(out, k, encodeDeep(v));
    return out;
  }
  return value;
}

/** Inverse of encodeDeep; plain values pass through unchanged. */
export function decodeDeep(value: Json): Json {
  if (Array.isArray(value)) return value.map(decodeDeep);
  if (isPolyline(value)) return decodePolyline(value.$pl);
  if (isPlainObject(value)) {
    const out: JsonObject = {};
    for (const [k, v] of Object.entries(value)) setOwn(out, k, decodeDeep(v));
    return out;
  }
  return value;
}
