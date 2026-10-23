/**
 * Lossless compact encoding for entity-diff.json.
 *
 * Large feeds produce hundreds of thousands of near-identical change records
 * (MBTA: 207k trips.txt changes, 37 MB of the 45 MB file), mostly repeated
 * property names and repeated route/service ids. Each large
 * `entity_types[].changes` array is stored column by column instead:
 *
 *   - every leaf property path becomes one column,
 *   - a column is stored raw, as dictionary indices (repeated values once), or
 *     sparse (only the rows that have it), whichever is smallest,
 *   - empty objects are recorded so they come back too.
 *
 * Per-category detail files (maps, calendar) are encoded deeply with
 * encodeDeep: every large array of objects anywhere goes column by column,
 * and every coordinate list ([[lon, lat], …] at 1e-5 precision) becomes an
 * encoded polyline string, { $pl: "…" }.
 *
 * decodeEntityDiff(encodeEntityDiff(doc)) and decodeDeep(encodeDeep(doc))
 * are deep-equal to doc; the UI only ever sees the decoded form. Plain
 * (unencoded) files decode unchanged.
 *
 * Self-contained and type-strippable on purpose: the Node generators import
 * this file directly (scripts/lib/entity-diff-codec.mjs).
 */

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

type JsonObject = { [key: string]: Json };
type Path = string[];

/** Value present in every row, stored verbatim. */
interface RawColumn {
  p: Path;
  t: 'raw';
  v: Json[];
}

/** Indices into `d` (most frequent value first); -1 = absent in that row. */
interface DictColumn {
  p: Path;
  t: 'dict';
  d: Json[];
  i: number[];
}

/** Only rows that have the value; `r` holds row-index gaps (delta-encoded). */
interface SparseColumn {
  p: Path;
  t: 'sparse';
  r: number[];
  v: Json[];
}

type Column = RawColumn | DictColumn | SparseColumn;

export interface ColumnarRows {
  $columnar: 1;
  n: number;
  cols: Column[];
  /** Rows (delta-encoded) where the object at `p` is present but empty. */
  empty: Array<{ p: Path; r: number[] }>;
}

/** Arrays shorter than this stay plain: not worth the indirection. */
const MIN_ROWS = 64;

function isPlainObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPrimitive(v: Json): v is null | boolean | number | string {
  return v === null || typeof v !== 'object';
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

function deltas(rows: number[]): number[] {
  return rows.map((r, i) => (i === 0 ? r : r - rows[i - 1]));
}

function undelta(gaps: number[]): number[] {
  let at = 0;
  return gaps.map((g, i) => (at = i === 0 ? g : at + g));
}

function digits(n: number): number {
  return n < 10 ? 1 : n < 100 ? 2 : n < 1000 ? 3 : String(n).length;
}

interface Collected {
  rows: number[];
  values: Json[];
}

/** Walk one row, recording each leaf value and each empty object by path. */
function collect(
  row: JsonObject,
  rowIndex: number,
  prefix: Path,
  leaves: Map<string, Collected & { p: Path }>,
  empties: Map<string, { p: Path; rows: number[] }>,
): void {
  // Like JSON.stringify, undefined properties don't exist (generators build
  // rows in memory with e.g. `label: undefined`).
  const keys = Object.keys(row).filter((k) => row[k] !== undefined);
  if (keys.length === 0 && prefix.length > 0) {
    const id = JSON.stringify(prefix);
    const e = empties.get(id) ?? { p: prefix, rows: [] };
    e.rows.push(rowIndex);
    empties.set(id, e);
    return;
  }
  for (const key of keys) {
    const value = row[key];
    const path = [...prefix, key];
    if (isPlainObject(value)) {
      collect(value, rowIndex, path, leaves, empties);
      continue;
    }
    const id = JSON.stringify(path);
    const leaf = leaves.get(id) ?? { p: path, rows: [], values: [] };
    leaf.rows.push(rowIndex);
    leaf.values.push(value);
    leaves.set(id, leaf);
  }
}

/** Pick the smallest of raw / dict / sparse for one column. */
function encodeColumn(p: Path, n: number, { rows, values }: Collected): Column {
  const sizes = values.map((v) => JSON.stringify(v).length + 1);
  const valueBytes = sizes.reduce((s, x) => s + x, 0);
  const gaps = deltas(rows);
  const sparseBytes = valueBytes + gaps.reduce((s, g) => s + digits(g) + 1, 0);
  const candidates: Array<{ bytes: number; build: () => Column }> = [
    {
      bytes: sparseBytes,
      build: () => ({ p, t: 'sparse', r: gaps, v: values }),
    },
  ];
  if (rows.length === n) {
    candidates.push({
      bytes: valueBytes,
      build: () => ({ p, t: 'raw', v: values }),
    });
  }
  // Dictionary only for primitives: decoded rows must not share objects.
  if (values.every(isPrimitive)) {
    const counts = new Map<Json, number>();
    values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
    const dict = [...counts.keys()].sort(
      (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0),
    );
    const index = new Map(dict.map((v, i) => [v, i]));
    const dictBytes =
      dict.reduce<number>((s, v) => s + JSON.stringify(v).length + 1, 0) +
      values.reduce<number>((s, v) => s + digits(index.get(v) ?? 0) + 1, 0) +
      (n - rows.length) * 3;
    candidates.push({
      bytes: dictBytes,
      build: () => {
        const i = new Array<number>(n).fill(-1);
        rows.forEach((r, k) => {
          i[r] = index.get(values[k]) ?? -1;
        });
        return { p, t: 'dict', d: dict, i };
      },
    });
  }
  candidates.sort((a, b) => a.bytes - b.bytes);
  return candidates[0].build();
}

/** Encode an array of plain objects column by column. */
export function encodeRows(rows: Json[]): ColumnarRows | Json[] {
  if (rows.length < MIN_ROWS || !rows.every(isPlainObject)) return rows;
  const leaves = new Map<string, Collected & { p: Path }>();
  const empties = new Map<string, { p: Path; rows: number[] }>();
  rows.forEach((row, i) => collect(row as JsonObject, i, [], leaves, empties));
  return {
    $columnar: 1,
    n: rows.length,
    cols: [...leaves.values()].map((leaf) =>
      encodeColumn(leaf.p, rows.length, leaf),
    ),
    empty: [...empties.values()].map((e) => ({ p: e.p, r: deltas(e.rows) })),
  };
}

function isColumnar(v: unknown): v is ColumnarRows {
  return isPlainObject(v) && (v as { $columnar?: unknown }).$columnar === 1;
}

/** Set `value` at `path` inside `row`, creating intermediate objects. */
function place(row: JsonObject, path: Path, value: Json): void {
  let obj = row;
  for (let k = 0; k < path.length - 1; k++) {
    // Own properties only: obj['__proto__'] would walk into Object.prototype.
    const next = Object.prototype.hasOwnProperty.call(obj, path[k])
      ? obj[path[k]]
      : undefined;
    if (isPlainObject(next)) {
      obj = next;
    } else {
      const created: JsonObject = {};
      setOwn(obj, path[k], created);
      obj = created;
    }
  }
  setOwn(obj, path[path.length - 1], value);
}

export function decodeRows(encoded: ColumnarRows): JsonObject[] {
  const rows: JsonObject[] = Array.from({ length: encoded.n }, () => ({}));
  for (const col of encoded.cols) {
    if (col.t === 'raw') {
      col.v.forEach((v, r) => place(rows[r], col.p, v));
    } else if (col.t === 'dict') {
      col.i.forEach((idx, r) => {
        if (idx >= 0) place(rows[r], col.p, col.d[idx]);
      });
    } else {
      undelta(col.r).forEach((r, k) => place(rows[r], col.p, col.v[k]));
    }
  }
  for (const e of encoded.empty) {
    for (const r of undelta(e.r)) place(rows[r], e.p, {});
  }
  return rows;
}

// ── entity-diff.json ───────────────────────────────────────────────

interface EncodableDoc {
  categories?: Array<{ entity_types?: Array<{ changes?: unknown }> }>;
}

function mapChanges<T>(doc: T, fn: (changes: unknown) => unknown): T {
  const d = doc as EncodableDoc;
  if (!Array.isArray(d.categories)) return doc;
  return {
    ...doc,
    categories: d.categories.map((c) =>
      Array.isArray(c.entity_types)
        ? {
            ...c,
            entity_types: c.entity_types.map((et) => ({
              ...et,
              changes: fn(et.changes),
            })),
          }
        : c,
    ),
  } as T;
}

/** Compact every large entity_types[].changes array. Idempotent. */
export function encodeEntityDiff<T>(doc: T): T {
  return mapChanges(doc, (changes) =>
    Array.isArray(changes) ? encodeRows(changes as Json[]) : changes,
  );
}

/** Inverse of encodeEntityDiff; plain documents pass through unchanged. */
export function decodeEntityDiff<T>(doc: T): T {
  return mapChanges(doc, (changes) =>
    isColumnar(changes) ? decodeRows(changes) : changes,
  );
}

// ── Deep encoding (per-category detail files) ──────────────────────

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
 * representable) and arrays of 64+ objects column by column, at any depth.
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
    const items = value.map(encodeDeep);
    const rows = encodeRows(items);
    return rows as unknown as Json;
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
  if (isColumnar(value)) return decodeRows(value).map(decodeDeep);
  if (isPolyline(value)) return decodePolyline(value.$pl);
  if (isPlainObject(value)) {
    const out: JsonObject = {};
    for (const [k, v] of Object.entries(value)) setOwn(out, k, decodeDeep(v));
    return out;
  }
  return value;
}
