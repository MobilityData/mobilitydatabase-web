/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  type Json,
  decodeDeep,
  decodeEntityDiff,
  decodePolyline,
  decodeRows,
  encodeDeep,
  encodeEntityDiff,
  encodePolyline,
  encodeRows,
} from './entity-diff-codec';

/** Encode, go through JSON text like the browser does, decode. */
function roundTrip(rows: Json[]): unknown {
  const encoded = encodeRows(rows);
  const parsed = JSON.parse(JSON.stringify(encoded)) as typeof encoded;
  return Array.isArray(parsed) ? parsed : decodeRows(parsed);
}

function many<T>(n: number, f: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => f(i));
}

describe('encodeRows / decodeRows', () => {
  it('leaves short arrays and non-object rows untouched', () => {
    const short = many(10, (i) => ({ key: String(i) }));
    expect(encodeRows(short)).toBe(short);
    const mixed = [...many(100, (i) => ({ key: String(i) })), 'x'];
    expect(encodeRows(mixed)).toBe(mixed);
  });

  it('round-trips the shape of trips.txt changes exactly', () => {
    const rows = many(500, (i) => ({
      key: `trip-${i}`,
      status: i % 3 === 0 ? 'added' : 'deleted',
      context: { route_id: `R${i % 7}`, service_id: i % 2 ? 'Weekday' : '' },
      children: {
        'stop_times.txt': { added: i % 5, deleted: 0, modified: 0 },
        ...(i % 50 === 0
          ? { 'frequencies.txt': { added: 1, deleted: 0, modified: 0 } }
          : {}),
      },
      ...(i % 97 === 0
        ? {
            field_changes: [
              { field: 'service_id', base_value: 'A', new_value: 'B' },
            ],
          }
        : {}),
    }));
    const encoded = encodeRows(rows);
    expect(Array.isArray(encoded)).toBe(false);
    expect(JSON.stringify(encoded).length).toBeLessThan(
      JSON.stringify(rows).length / 2,
    );
    expect(roundTrip(rows)).toEqual(rows);
  });

  it('keeps absent, null, empty-string and empty-object values distinct', () => {
    const rows = many(200, (i): Json => {
      const r: { [k: string]: Json } = { key: String(i) };
      if (i % 4 === 0) r.label = null;
      if (i % 4 === 1) r.label = '';
      if (i % 4 === 2) r.label = 'x';
      if (i % 3 === 0) r.children = {};
      if (i % 3 === 1) r.children = { 'a.txt': {} };
      if (i === 7) r.deep = { a: { b: { c: [] } } };
      return r;
    });
    expect(roundTrip(rows)).toEqual(rows);
    // toEqual treats undefined and absent alike; check absence explicitly.
    const decoded = roundTrip(rows) as Array<Record<string, unknown>>;
    expect('label' in decoded[3]).toBe(false);
    expect('children' in decoded[2]).toBe(false);
  });

  it('treats undefined properties like JSON.stringify does (absent)', () => {
    // How the generator builds rows in memory before writing them.
    const rows = many(100, (i) => ({
      key: String(i),
      label: undefined,
      context: i % 2 ? { route_id: 'R1', service_id: undefined } : undefined,
      children: { 'a.txt': { added: undefined } },
    })) as unknown as Json[];
    const asJson = JSON.parse(JSON.stringify(rows)) as Json[];
    expect(JSON.stringify(roundTrip(rows))).toBe(JSON.stringify(asJson));
    expect(roundTrip(rows)).toEqual(asJson);
  });

  it('handles a path that is an object in some rows and a value in others', () => {
    const rows = many(100, (i) =>
      i % 2 ? { v: { x: i } } : { v: i % 3 === 0 ? 'flat' : [i] },
    );
    expect(roundTrip(rows)).toEqual(rows);
  });

  it('does not share array or object values between decoded rows', () => {
    const rows = many(100, () => ({ fc: [{ field: 'a' }] }));
    const decoded = roundTrip(rows) as Array<{ fc: unknown[] }>;
    expect(decoded[0].fc).not.toBe(decoded[1].fc);
  });

  it('keeps a "__proto__" key as data', () => {
    const rows = many(100, (i) =>
      JSON.parse(`{"key":"${i}","__proto__":{"polluted":true}}`),
    ) as Json[];
    const decoded = roundTrip(rows) as Array<Record<string, unknown>>;
    expect(Object.keys(decoded[0])).toContain('__proto__');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(JSON.stringify(decoded)).toBe(JSON.stringify(rows));
  });
});

describe('encodeEntityDiff / decodeEntityDiff', () => {
  const file = path.join(
    process.cwd(),
    'src/app/screens/GtfsDiffTool/data/v2/direxis/entity-diff.json',
  );
  const stored = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  const plain = decodeEntityDiff(stored);

  it('round-trips the direxis entity diff without losing anything', () => {
    const text = JSON.stringify(encodeEntityDiff(plain));
    expect(decodeEntityDiff(JSON.parse(text))).toEqual(plain);
  });

  it('is idempotent and passes plain documents through', () => {
    const once = encodeEntityDiff(plain);
    expect(encodeEntityDiff(once)).toEqual(once);
    expect(decodeEntityDiff(plain)).toEqual(plain);
    expect(decodeEntityDiff({ other: 1 })).toEqual({ other: 1 });
  });
});

describe('deep encoding (detail files)', () => {
  const deep = (v: Json): unknown =>
    decodeDeep(JSON.parse(JSON.stringify(encodeDeep(v))) as Json);

  it('encodes coordinate lists as polylines, exactly', () => {
    const line = [
      [2.36916, 48.75552],
      [2.36929, 48.75529],
      [-73.6024, 45.44672],
      [0, 0],
    ];
    expect(decodePolyline(encodePolyline(line))).toEqual(line);
    const encoded = encodeDeep({ geometry: { base: line, new: null } });
    expect(encoded).toEqual({
      geometry: { base: { $pl: encodePolyline(line) }, new: null },
    });
    expect(deep({ geometry: { base: line, new: null } })).toEqual({
      geometry: { base: line, new: null },
    });
  });

  it('keeps lists it cannot encode exactly', () => {
    const spans = [
      [25200, 86400000],
      [1.234567, 2],
    ];
    expect(encodeDeep(spans)).toEqual(spans);
    expect(encodeDeep([[1, 2]])).toEqual([[1, 2]]);
  });

  it('round-trips nested large arrays of objects', () => {
    const routes = Array.from({ length: 80 }, (_, i) => ({
      route_id: `R${i}`,
      status: i % 3 === 0 ? 'added' : 'modified',
      shapes: Array.from({ length: 70 }, (__, k) => ({
        shape_id: `S${i}_${k}`,
        geometry: {
          base: [
            [2 + k / 1e5, 48],
            [2.1, 48.1],
          ],
          new: null,
        },
        diverge: { added: [], removed: [] },
      })),
      flags: {},
    }));
    const doc = { routes, counts: { added: 27 } } as unknown as Json;
    const text = JSON.stringify(encodeDeep(doc));
    expect(text.length).toBeLessThan(JSON.stringify(doc).length);
    expect(deep(doc)).toEqual(doc);
  });
});
