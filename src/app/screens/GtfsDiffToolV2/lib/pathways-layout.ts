/**
 * Layout for the station schematic: one horizontal band per level, stacked by
 * level_index (highest on top), nodes placed within their band so that
 * connected nodes line up vertically (barycenter sweeps, as in layered graph
 * drawing). Pure, so it can be unit-tested and memoized.
 */

import type { RowStatus, StationPathwaysDiff } from './pathways-types';
import { currentRow, type NodeLabel } from './pathways-utils';

export const SCHEMATIC = {
  labelColumn: 150,
  nodeWidth: 134,
  nodeHeight: 44,
  gapX: 24,
  bandPadY: 26,
  bandGap: 56,
  marginX: 24,
  marginY: 16,
  sweeps: 24,
};

export interface LayoutBand {
  index: number;
  levelId: string | null;
  name: string;
  levelIndex: number | null;
  /** Previous level_name when the level was renamed. */
  renamedFrom: string | null;
  status: RowStatus | null;
  y: number;
  height: number;
}

export interface LayoutNode {
  id: string;
  band: number;
  /** Top-left corner. */
  x: number;
  y: number;
}

export interface SchematicLayout {
  width: number;
  height: number;
  nodeWidth: number;
  nodeHeight: number;
  bands: LayoutBand[];
  nodes: LayoutNode[];
  byId: Map<string, LayoutNode>;
}

const NO_LEVEL = '\u0000none';

const KIND_ORDER: Record<NodeLabel['kind'], number> = {
  entrance: 0,
  node: 1,
  boarding_area: 2,
  platform: 3,
};

export function layoutSchematic(
  station: StationPathwaysDiff,
  labels: Map<string, NodeLabel>,
  include?: Set<string>,
): SchematicLayout {
  const S = SCHEMATIC;
  const step = S.nodeWidth + S.gapX;
  const nodes = station.nodes.filter((n) => include?.has(n.stop_id) ?? true);
  const levelById = new Map(station.levels.map((l) => [l.level_id, l]));

  // Bands, highest level_index first; nodes without a known level go last.
  const bandKeys = new Set(
    nodes.map((n) => {
      const id = currentRow(n).level_id;
      return id && levelById.has(id) ? id : NO_LEVEL;
    }),
  );
  const indexOf = (key: string): number | null => {
    const l = levelById.get(key);
    const v = Number((l?.new ?? l?.base)?.level_index);
    return l && Number.isFinite(v) ? v : null;
  };
  const orderedKeys = [...bandKeys].sort((a, b) => {
    const ia = indexOf(a);
    const ib = indexOf(b);
    if (ia == null || ib == null) return ia == null ? 1 : -1;
    return ib - ia || a.localeCompare(b);
  });
  const bandOf = new Map(orderedKeys.map((k, i) => [k, i]));
  const nodeBand = new Map(
    nodes.map((n) => {
      const id = currentRow(n).level_id;
      return [
        n.stop_id,
        bandOf.get(id && levelById.has(id) ? id : NO_LEVEL) ?? 0,
      ];
    }),
  );

  // Undirected neighbours among the included nodes.
  const neighbours = new Map<string, Set<string>>(
    nodes.map((n) => [n.stop_id, new Set<string>()]),
  );
  for (const l of station.links) {
    if (!neighbours.has(l.a) || !neighbours.has(l.b) || l.a === l.b) continue;
    neighbours.get(l.a)?.add(l.b);
    neighbours.get(l.b)?.add(l.a);
  }

  // Initial order: entrances, then generic nodes, then platforms; by title.
  const members: string[][] = orderedKeys.map(() => []);
  for (const n of nodes) members[nodeBand.get(n.stop_id) ?? 0].push(n.stop_id);
  members.forEach((ids) =>
    ids.sort((a, b) => {
      const la = labels.get(a);
      const lb = labels.get(b);
      return (
        KIND_ORDER[la?.kind ?? 'node'] - KIND_ORDER[lb?.kind ?? 'node'] ||
        (la?.title ?? a).localeCompare(lb?.title ?? b) ||
        a.localeCompare(b)
      );
    }),
  );

  // Neighbours on other levels drive the ordering; same-level ones are only
  // used for nodes with no vertical connection.
  const pull = (id: string): string[] => {
    const nb = [...(neighbours.get(id) ?? [])];
    const band = nodeBand.get(id);
    const across = nb.filter((n) => nodeBand.get(n) !== band);
    return across.length > 0 ? across : nb;
  };

  // Phase 1: order each band by the barycenter of its neighbours' slots.
  // Bands stay packed (slot i at x = offset + i), which keeps the drawing as
  // narrow as the busiest level.
  const offset = members.map((ids) => -(ids.length - 1) / 2);
  const slot = (id: string): number => {
    const b = nodeBand.get(id) ?? 0;
    return offset[b] + members[b].indexOf(id);
  };
  for (let sweep = 0; sweep < S.sweeps; sweep++) {
    const bandOrder = members.map((_, i) => i);
    if (sweep % 2 === 1) bandOrder.reverse();
    for (const b of bandOrder) {
      const ids = members[b];
      const bc = new Map(
        ids.map((id) => {
          const nb = pull(id);
          return [
            id,
            nb.length === 0
              ? slot(id)
              : nb.reduce((s, n) => s + slot(n), 0) / nb.length,
          ];
        }),
      );
      const prevIndex = new Map(ids.map((id, i) => [id, i]));
      ids.sort(
        (p, q) =>
          (bc.get(p) ?? 0) - (bc.get(q) ?? 0) ||
          (prevIndex.get(p) ?? 0) - (prevIndex.get(q) ?? 0),
      );
      // Phase 2 (interleaved): slide the whole band towards its neighbours.
      let sum = 0;
      let count = 0;
      ids.forEach((id, i) => {
        const nb = pull(id);
        if (nb.length === 0) return;
        sum += nb.reduce((s, n) => s + slot(n), 0) / nb.length - i;
        count++;
      });
      if (count > 0) offset[b] = sum / count;
    }
  }
  const x = new Map<string, number>();
  for (const ids of members) for (const id of ids) x.set(id, slot(id) * step);

  const minX = Math.min(...[...x.values()], 0);
  const maxX = Math.max(...[...x.values()], 0);
  const bandHeight = S.nodeHeight + 2 * S.bandPadY;
  const bands: LayoutBand[] = orderedKeys.map((key, i) => {
    const level = levelById.get(key);
    const nameChange = level?.field_changes.find(
      (c) => c.field === 'level_name',
    );
    return {
      index: i,
      levelId: key === NO_LEVEL ? null : key,
      name:
        key === NO_LEVEL
          ? 'No level'
          : ((level?.new ?? level?.base)?.level_name ?? key),
      levelIndex: indexOf(key),
      renamedFrom: nameChange ? nameChange.base_value : null,
      status: level?.status ?? null,
      y: S.marginY + i * (bandHeight + S.bandGap),
      height: bandHeight,
    };
  });

  const originX = S.labelColumn + S.marginX - minX;
  const laid: LayoutNode[] = nodes.map((n) => {
    const band = bands[nodeBand.get(n.stop_id) ?? 0];
    return {
      id: n.stop_id,
      band: band.index,
      x: Math.round(originX + (x.get(n.stop_id) ?? 0)),
      y: band.y + S.bandPadY,
    };
  });

  return {
    width: Math.round(
      S.labelColumn + 2 * S.marginX + (maxX - minX) + S.nodeWidth,
    ),
    height:
      S.marginY * 2 +
      bands.length * bandHeight +
      (bands.length - 1) * S.bandGap,
    nodeWidth: S.nodeWidth,
    nodeHeight: S.nodeHeight,
    bands,
    nodes: laid,
    byId: new Map(laid.map((n) => [n.id, n])),
  };
}
