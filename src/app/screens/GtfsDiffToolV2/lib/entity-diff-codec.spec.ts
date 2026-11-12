/**
 * @jest-environment node
 */
import {
  type Json,
  decodeDeep,
  decodePolyline,
  encodeDeep,
  encodePolyline,
} from './entity-diff-codec';

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

  it('keeps large arrays of objects as plain arrays', () => {
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
    const encoded = encodeDeep(doc) as { routes: unknown };
    expect(Array.isArray(encoded.routes)).toBe(true);
    expect(deep(doc)).toEqual(doc);
  });

  it('drops undefined properties like JSON.stringify does', () => {
    const doc = { a: 1, b: undefined } as unknown as Json;
    expect(encodeDeep(doc)).toEqual({ a: 1 });
    expect('b' in (encodeDeep(doc) as object)).toBe(false);
  });

  it('keeps a "__proto__" key as data', () => {
    const doc = JSON.parse('{"key":"1","__proto__":{"polluted":true}}') as Json;
    const decoded = deep(doc) as Record<string, unknown>;
    expect(Object.keys(decoded)).toContain('__proto__');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(JSON.stringify(decoded)).toBe(JSON.stringify(doc));
  });
});
