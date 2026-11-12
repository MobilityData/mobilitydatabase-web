/**
 * A route's directions draw the same line as one of its shapes (the main
 * shape of the direction), so maps/routes_detail.parquet would hold every
 * such line twice (MBTA: 2.6 of 8.1 MB decoded). packRouteDetail() replaces
 * a direction line that equals a shape's line with a reference to it,
 * { $shape: <index in shapes>, side }; unpackRouteDetail() puts the line
 * back. Lines with no identical shape line (stop-to-stop lines of routes
 * without shapes) stay inline, and details written before this encoding
 * unpack unchanged.
 *
 * Pure and type-only on imports: the Node build imports it.
 */

import { type Json, decodeDeep } from './entity-diff-codec';
import type { LonLat, RouteDetail, RouteImpact } from './entity-diff-types';

type Side = 'base' | 'new';

export interface ShapeLineRef {
  $shape: number;
  side: Side;
}

type Line = LonLat[] | null;
type PackedLine = Line | ShapeLineRef;

const SIDES: Side[] = ['base', 'new'];

type WithLines = Pick<RouteImpact, 'directions' | 'shapes'>;

function mapDirectionLines<T extends WithLines>(
  r: T,
  fn: (line: PackedLine) => PackedLine,
): T {
  return {
    ...r,
    directions: r.directions.map((d) => {
      const g = d.geometry as { base: PackedLine; new: PackedLine };
      return { ...d, geometry: { base: fn(g.base), new: fn(g.new) } };
    }),
  };
}

export function packRouteDetail<T extends WithLines>(r: T): T {
  const lines = new Map<string, ShapeLineRef>();
  (r.shapes ?? []).forEach((sh, i) => {
    for (const side of SIDES) {
      const g = sh.geometry[side];
      if (g == null || g.length === 0) continue;
      const key = JSON.stringify(g);
      if (!lines.has(key)) lines.set(key, { $shape: i, side });
    }
  });
  if (lines.size === 0) return r;
  return mapDirectionLines(r, (g) =>
    Array.isArray(g) ? (lines.get(JSON.stringify(g)) ?? g) : g,
  );
}

export function unpackRouteDetail<T extends WithLines>(r: T): T {
  const shapes = r.shapes ?? [];
  return mapDirectionLines(r, (g) =>
    g != null && !Array.isArray(g)
      ? (shapes.at(g.$shape)?.geometry[g.side] ?? null)
      : g,
  );
}

/**
 * The RouteDetail of a maps/routes_detail.parquet query (one row, its
 * `detail` column deep-encoded and packed), or null for no row.
 */
export function readRouteDetail(
  rows: Array<Record<string, unknown>>,
): RouteDetail | null {
  const row = rows.at(0);
  if (row == null) return null;
  const decoded = decodeDeep(JSON.parse(String(row.detail)) as Json);
  return unpackRouteDetail(decoded as unknown as RouteDetail);
}
