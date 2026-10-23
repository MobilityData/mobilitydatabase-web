/**
 * Pure helpers for the pathways + levels diff: node labels, travel-time
 * estimates, entrance -> platform routing in each feed, and the station
 * summary (badges, counts) built from it.
 */

import type {
  LinkStatus,
  NodeDiff,
  PathwayLink,
  RowStatus,
  SparseRow,
  StationPathwaysDiff,
} from './pathways-types';

export type Side = 'base' | 'new';
export type RouteMode = 'step_free' | 'fastest';

// ── Pathway modes ──────────────────────────────────────────────────

export const MODE_LABELS: Record<string, string> = {
  '1': 'Walkway',
  '2': 'Stairs',
  '3': 'Moving sidewalk',
  '4': 'Escalator',
  '5': 'Elevator',
  '6': 'Fare gate',
  '7': 'Exit gate',
};

/** Modes a wheelchair user can't take. */
const NOT_STEP_FREE = new Set(['2', '4']);

export function modeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? `Mode ${mode}`;
}

// ── Travel time ────────────────────────────────────────────────────

/** Assumptions used when a pathway has no traversal_time. */
export const TIME_ASSUMPTIONS = {
  walkMps: 1.2,
  movingSidewalkMps: 2,
  escalatorMps: 0.5,
  stairStepS: 0.6,
  elevatorS: 45,
  gateS: 5,
  fallbackS: 10,
};

export interface PathwayTime {
  seconds: number;
  /** True when derived from length / stair_count / a default. */
  estimated: boolean;
}

function num(v: string | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function pathwaySeconds(row: SparseRow, stepFree: boolean): PathwayTime {
  const a = TIME_ASSUMPTIONS;
  const tt =
    (stepFree ? num(row.wheelchair_traversal_time) : null) ??
    num(row.traversal_time);
  if (tt != null && tt > 0) return { seconds: tt, estimated: false };
  const length =
    (stepFree ? num(row.wheelchair_length) : null) ?? num(row.length);
  const stairs = num(row.stair_count);
  switch (row.pathway_mode) {
    case '1':
      if (length != null)
        return { seconds: length / a.walkMps, estimated: true };
      break;
    case '2':
      if (stairs != null)
        return { seconds: Math.abs(stairs) * a.stairStepS, estimated: true };
      if (length != null)
        return { seconds: length / a.walkMps, estimated: true };
      break;
    case '3':
      if (length != null)
        return { seconds: length / a.movingSidewalkMps, estimated: true };
      break;
    case '4':
      if (length != null)
        return { seconds: length / a.escalatorMps, estimated: true };
      break;
    case '5':
      return { seconds: a.elevatorS, estimated: true };
    case '6':
    case '7':
      return { seconds: a.gateS, estimated: true };
  }
  return { seconds: a.fallbackS, estimated: true };
}

/** "45 s", "1 min 50 s", "2 min" */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} min` : `${m} min ${r} s`;
}

export function formatDelta(seconds: number): string {
  return `${seconds > 0 ? '+' : '−'}${formatDuration(Math.abs(seconds))}`;
}

// ── Rows per feed ──────────────────────────────────────────────────

export function nodeRow(node: NodeDiff, side: Side): SparseRow | null {
  return side === 'base' ? node.base : node.new;
}

/** The row to describe a node by: new if it still exists, else base. */
export function currentRow(node: NodeDiff): SparseRow {
  return node.new ?? node.base ?? {};
}

function locationType(row: SparseRow): string {
  return row.location_type ?? '0';
}

export function levelNameOf(
  station: StationPathwaysDiff,
  levelId: string | undefined,
  side: Side,
): string | null {
  if (!levelId) return null;
  const level = station.levels.find((l) => l.level_id === levelId);
  const row = level ? (side === 'base' ? level.base : level.new) : null;
  return row?.level_name ?? null;
}

// ── Node labels ────────────────────────────────────────────────────

export type NodeKind = 'entrance' | 'platform' | 'boarding_area' | 'node';

export interface NodeLabel {
  kind: NodeKind;
  title: string;
  subtitle: string;
  /** level_name of the node's level, for telling apart same-titled nodes. */
  level: string | null;
}

const KIND_BY_LOCATION_TYPE: Record<string, NodeKind> = {
  '0': 'platform',
  '2': 'entrance',
  '3': 'node',
  '4': 'boarding_area',
};

/** Facility code of a pathway, e.g. "867" for an elevator. */
function facilityCode(row: SparseRow): string {
  return row.pathway_code ?? row.facility_id ?? '';
}

/** Role of a generic node, from the facilities attached to it. */
function genericNodeTitle(stopId: string, links: PathwayLink[]): string | null {
  const PRIORITY = ['5', '4', '3', '2', '6', '7'];
  let best: { rank: number; title: string } | null = null;
  for (const link of links) {
    const rank = PRIORITY.indexOf(link.mode);
    if (rank < 0 || (best && best.rank <= rank)) continue;
    const row = link.new[0] ?? link.base[0];
    if (row == null) continue;
    let title: string;
    if (link.mode === '6' || link.mode === '7') {
      const isFrom = row.from_stop_id === stopId;
      // Fare gates go unpaid -> paid, exit gates paid -> unpaid.
      const unpaid = link.mode === '6' ? isFrom : !isFrom;
      title = `Fare gates · ${unpaid ? 'unpaid' : 'paid'} side`;
    } else {
      const code = facilityCode(row);
      title = code ? `${modeLabel(link.mode)} ${code}` : modeLabel(link.mode);
    }
    best = { rank, title };
  }
  return best?.title ?? null;
}

export function buildNodeLabels(
  station: StationPathwaysDiff,
): Map<string, NodeLabel> {
  const linksByNode = new Map<string, PathwayLink[]>();
  for (const l of station.links) {
    for (const id of [l.a, l.b]) {
      const list = linksByNode.get(id) ?? [];
      list.push(l);
      linksByNode.set(id, list);
    }
  }
  const labels = new Map<string, NodeLabel>();
  for (const node of station.nodes) {
    const row = currentRow(node);
    const level = levelNameOf(
      station,
      row.level_id,
      node.new != null ? 'new' : 'base',
    );
    const set = (l: Omit<NodeLabel, 'level'>): void => {
      labels.set(node.stop_id, { ...l, level });
    };
    const kind = KIND_BY_LOCATION_TYPE[locationType(row)] ?? 'node';
    const name = row.stop_name ?? '';
    const distinctName = name !== '' && name !== station.name ? name : null;
    if (kind === 'entrance') {
      set({
        kind,
        title: name || node.stop_id,
        subtitle: 'Entrance',
      });
    } else if (kind === 'platform') {
      const code = row.platform_code;
      set({
        kind,
        title:
          row.platform_name ??
          (code ? `Platform ${code}` : null) ??
          distinctName ??
          shortDesc(row.stop_desc, station.name) ??
          node.stop_id,
        subtitle: code ? `Platform ${code}` : 'Platform',
      });
    } else if (kind === 'boarding_area') {
      set({
        kind,
        title: distinctName ?? node.stop_id,
        subtitle: 'Boarding area',
      });
    } else {
      set({
        kind,
        title:
          distinctName ??
          genericNodeTitle(node.stop_id, linksByNode.get(node.stop_id) ?? []) ??
          'Walkway node',
        subtitle: node.stop_id,
      });
    }
  }
  return labels;
}

/** "Davis - Busway" -> "Busway" (stop_desc often repeats the station name). */
function shortDesc(
  desc: string | undefined,
  stationName: string,
): string | null {
  if (!desc) return null;
  const parts = desc.split(' - ').filter((p) => p !== stationName);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function labelTitle(labels: Map<string, NodeLabel>, id: string): string {
  return labels.get(id)?.title ?? id;
}

/** "Elevator 867", "Walkway" */
export function linkTitle(link: PathwayLink): string {
  const row = link.new[0] ?? link.base[0];
  const code = row ? facilityCode(row) : '';
  return code && link.mode !== '1'
    ? `${modeLabel(link.mode)} ${code}`
    : modeLabel(link.mode);
}

/**
 * "A → B". When both ends share a title (the two ends of an elevator), the
 * level names tell them apart: "Elevator 867: Mezzanine → Platform".
 */
export function endpointsText(
  from: string,
  to: string,
  labels: Map<string, NodeLabel>,
  arrow: '→' | '↔' = '→',
): string {
  const a = labels.get(from);
  const b = labels.get(to);
  const ta = a?.title ?? from;
  const tb = b?.title ?? to;
  if (ta !== tb) return `${ta} ${arrow} ${tb}`;
  return `${ta}: ${a?.level ?? from} ${arrow} ${b?.level ?? to}`;
}

/** "Fare gates · paid side ↔ Elevator 867" */
export function linkEndpoints(
  link: PathwayLink,
  labels: Map<string, NodeLabel>,
): string {
  const rows = link.new.length > 0 ? link.new : link.base;
  const both =
    rows.some((r) => r.is_bidirectional === '1') ||
    (rows.some((r) => r.from_stop_id === link.a) &&
      rows.some((r) => r.from_stop_id === link.b));
  if (both) return endpointsText(link.a, link.b, labels, '↔');
  const from = rows[0]?.from_stop_id ?? link.a;
  return endpointsText(from, from === link.a ? link.b : link.a, labels);
}

// ── Routing ────────────────────────────────────────────────────────

interface Edge {
  to: string;
  link: PathwayLink;
  row: SparseRow;
}

export interface RouteStep {
  link: PathwayLink;
  from: string;
  to: string;
  pathwayId: string;
  seconds: number;
  estimated: boolean;
}

export interface Route {
  seconds: number;
  estimated: boolean;
  steps: RouteStep[];
}

function buildGraph(
  station: StationPathwaysDiff,
  side: Side,
  stepFree: boolean,
): Map<string, Edge[]> {
  const graph = new Map<string, Edge[]>();
  const add = (from: string, edge: Edge): void => {
    const list = graph.get(from) ?? [];
    list.push(edge);
    graph.set(from, list);
  };
  for (const link of station.links) {
    if (stepFree && NOT_STEP_FREE.has(link.mode)) continue;
    for (const row of side === 'base' ? link.base : link.new) {
      const from = row.from_stop_id ?? '';
      const to = row.to_stop_id ?? '';
      add(from, { to, link, row });
      if (row.is_bidirectional === '1') add(to, { to: from, link, row });
    }
  }
  return graph;
}

/** Dijkstra from one node. Station graphs are small, so a linear scan is fine. */
function shortestPaths(
  graph: Map<string, Edge[]>,
  source: string,
  stepFree: boolean,
): Map<string, { seconds: number; prev: { from: string; edge: Edge } | null }> {
  const best = new Map<
    string,
    { seconds: number; prev: { from: string; edge: Edge } | null }
  >([[source, { seconds: 0, prev: null }]]);
  const done = new Set<string>();
  for (;;) {
    let current: string | null = null;
    let currentS = Infinity;
    for (const [id, v] of best) {
      if (!done.has(id) && v.seconds < currentS) {
        current = id;
        currentS = v.seconds;
      }
    }
    if (current == null) break;
    done.add(current);
    for (const edge of graph.get(current) ?? []) {
      const s = currentS + pathwaySeconds(edge.row, stepFree).seconds;
      const known = best.get(edge.to);
      if (known == null || s < known.seconds) {
        best.set(edge.to, { seconds: s, prev: { from: current, edge } });
      }
    }
  }
  return best;
}

function toRoute(
  paths: ReturnType<typeof shortestPaths>,
  target: string,
  stepFree: boolean,
): Route | null {
  const end = paths.get(target);
  if (end == null) return null;
  const steps: RouteStep[] = [];
  let estimated = false;
  for (let at = end; at.prev != null; ) {
    const { from, edge } = at.prev;
    const t = pathwaySeconds(edge.row, stepFree);
    estimated ||= t.estimated;
    steps.unshift({
      link: edge.link,
      from,
      to: edge.to,
      pathwayId: edge.row.pathway_id ?? '',
      seconds: t.seconds,
      estimated: t.estimated,
    });
    const prev = paths.get(from);
    if (prev == null) break;
    at = prev;
  }
  return { seconds: end.seconds, estimated, steps };
}

// ── Reachability matrix ────────────────────────────────────────────

export type CellChange =
  | 'unchanged'
  | 'gained'
  | 'lost'
  | 'slower'
  | 'faster'
  | 'none';

/** Smaller travel-time differences are treated as noise. */
export const TIME_CHANGE_THRESHOLD_S = 5;

export interface CellSide {
  route: Route | null;
  /** Why there is no route, when it isn't just "no path". */
  blocked?: string;
  /** Entrance / platform don't exist in this feed. */
  missing: boolean;
}

export interface MatrixCell {
  entrance: string;
  platform: string;
  base: CellSide;
  new: CellSide;
  change: CellChange;
  /** new - base seconds, when both routes exist. */
  deltaS: number | null;
}

export interface ReachabilityMatrix {
  mode: RouteMode;
  entrances: string[];
  platforms: string[];
  cells: MatrixCell[];
}

function nodesOfKind(
  station: StationPathwaysDiff,
  labels: Map<string, NodeLabel>,
  kind: NodeKind,
): string[] {
  return station.nodes
    .filter((n) => labels.get(n.stop_id)?.kind === kind)
    .map((n) => n.stop_id)
    .sort((a, b) =>
      labelTitle(labels, a).localeCompare(labelTitle(labels, b), undefined, {
        numeric: true,
      }),
    );
}

/** Platform -> the node ids that count as reaching it (itself + boarding areas). */
function platformTargets(
  station: StationPathwaysDiff,
  side: Side,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const n of station.nodes) {
    const row = nodeRow(n, side);
    if (row == null) continue;
    const lt = locationType(row);
    if (lt === '0')
      out.set(n.stop_id, [...(out.get(n.stop_id) ?? []), n.stop_id]);
    if (lt === '4' && row.parent_station) {
      out.set(row.parent_station, [
        ...(out.get(row.parent_station) ?? []),
        n.stop_id,
      ]);
    }
  }
  return out;
}

function classify(base: Route | null, next: Route | null): CellChange {
  if (base == null && next == null) return 'none';
  if (base == null) return 'gained';
  if (next == null) return 'lost';
  const d = next.seconds - base.seconds;
  if (d >= TIME_CHANGE_THRESHOLD_S) return 'slower';
  if (d <= -TIME_CHANGE_THRESHOLD_S) return 'faster';
  return 'unchanged';
}

export function computeMatrix(
  station: StationPathwaysDiff,
  labels: Map<string, NodeLabel>,
  mode: RouteMode,
): ReachabilityMatrix {
  const stepFree = mode === 'step_free';
  const entrances = nodesOfKind(station, labels, 'entrance');
  const platforms = nodesOfKind(station, labels, 'platform');
  const nodeById = new Map(station.nodes.map((n) => [n.stop_id, n]));

  const sideCells = (side: Side): Map<string, CellSide> => {
    const graph = buildGraph(station, side, stepFree);
    const targets = platformTargets(station, side);
    const out = new Map<string, CellSide>();
    for (const e of entrances) {
      const entrance = nodeById.get(e);
      const row = entrance ? nodeRow(entrance, side) : null;
      const blocked =
        stepFree && row?.wheelchair_boarding === '2'
          ? 'Entrance is marked not wheelchair accessible (wheelchair_boarding = 2)'
          : undefined;
      const paths = row && !blocked ? shortestPaths(graph, e, stepFree) : null;
      for (const p of platforms) {
        const ends = targets.get(p);
        let route: Route | null = null;
        if (paths && ends) {
          for (const t of ends) {
            const r = toRoute(paths, t, stepFree);
            if (r && (route == null || r.seconds < route.seconds)) route = r;
          }
        }
        out.set(`${e}|${p}`, {
          route,
          blocked,
          missing: row == null || ends == null,
        });
      }
    }
    return out;
  };

  const base = sideCells('base');
  const next = sideCells('new');
  const cells: MatrixCell[] = [];
  for (const e of entrances) {
    for (const p of platforms) {
      const key = `${e}|${p}`;
      const b = base.get(key) ?? { route: null, missing: true };
      const n = next.get(key) ?? { route: null, missing: true };
      cells.push({
        entrance: e,
        platform: p,
        base: b,
        new: n,
        change: classify(b.route, n.route),
        deltaS: b.route && n.route ? n.route.seconds - b.route.seconds : null,
      });
    }
  }
  return { mode, entrances, platforms, cells };
}

// ── Cell explanation ───────────────────────────────────────────────

export type Severity = 'error' | 'success' | 'warning' | 'info' | 'neutral';

export interface CellExplanation {
  severity: Severity;
  text: string;
}

function linkTimeDelta(link: PathwayLink, stepFree: boolean): number {
  const s = (rows: SparseRow[]): number =>
    rows.length === 0
      ? 0
      : Math.max(...rows.map((r) => pathwaySeconds(r, stepFree).seconds));
  return s(link.new) - s(link.base);
}

export function explainCell(
  cell: MatrixCell,
  mode: RouteMode,
  labels: Map<string, NodeLabel>,
): CellExplanation {
  const stepFree = mode === 'step_free';
  const from = labelTitle(labels, cell.entrance);
  const to = labelTitle(labels, cell.platform);
  const access = stepFree ? 'step-free access' : 'access';
  const baseSteps = cell.base.route?.steps ?? [];
  const newSteps = cell.new.route?.steps ?? [];
  const named = (l: PathwayLink): string => linkTitle(l);

  switch (cell.change) {
    case 'lost': {
      if (cell.new.blocked) {
        return {
          severity: 'error',
          text: `${capitalize(access)} lost. ${cell.new.blocked}.`,
        };
      }
      const removed = baseSteps
        .map((s) => s.link)
        .filter((l) => l.status === 'deleted');
      const why =
        removed.length > 0
          ? `${removed.map(named).join(', ')} ${removed.length === 1 ? 'was' : 'were'} removed, so ${from} no longer has a ${stepFree ? 'step-free ' : ''}way to ${to}.`
          : `No ${stepFree ? 'step-free ' : ''}path from ${from} to ${to} remains in the new feed.`;
      return { severity: 'error', text: `${capitalize(access)} lost. ${why}` };
    }
    case 'gained': {
      const added = newSteps
        .map((s) => s.link)
        .filter((l) => l.status === 'added');
      const via =
        added.length > 0
          ? ` via new ${[...new Set(added.map(named))].join(', ')}`
          : '';
      const unblocked = cell.base.blocked
        ? ` Before: ${cell.base.blocked}.`
        : '';
      return {
        severity: 'success',
        text: `${capitalize(access)} gained${via}: ${from} now reaches ${to}.${unblocked}`,
      };
    }
    case 'slower':
    case 'faster': {
      const slower = cell.change === 'slower';
      const delta = Math.abs(cell.deltaS ?? 0);
      const baseIds = new Set(baseSteps.map((s) => s.link.id));
      const newIds = new Set(newSteps.map((s) => s.link.id));
      const removed = baseSteps.find(
        (s) => !newIds.has(s.link.id) && s.link.status === 'deleted',
      );
      const changed = newSteps
        .filter((s) => baseIds.has(s.link.id))
        .map((s) => ({ link: s.link, d: linkTimeDelta(s.link, stepFree) }))
        .filter((x) => (slower ? x.d > 0 : x.d < 0))
        .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
      let why = '';
      if (changed) {
        const l = changed.link;
        const before = Math.max(
          ...l.base.map((r) => pathwaySeconds(r, stepFree).seconds),
        );
        const after = Math.max(
          ...l.new.map((r) => pathwaySeconds(r, stepFree).seconds),
        );
        why = ` ${named(l)} (${linkEndpoints(l, labels)}) now takes ${formatDuration(after)}, was ${formatDuration(before)}.`;
      } else if (removed) {
        why = ` ${named(removed.link)} was removed, so the route goes another way.`;
      } else if (!sameSteps(baseSteps, newSteps)) {
        why = ' The route goes another way.';
      }
      return {
        severity: slower ? 'warning' : 'success',
        text: `${formatDuration(delta)} ${slower ? 'slower' : 'faster'}.${why}`,
      };
    }
    case 'none':
      return {
        severity: 'neutral',
        text: `No ${stepFree ? 'step-free ' : ''}route from ${from} to ${to} in either feed.${cell.new.blocked ? ` ${cell.new.blocked}.` : ''}`,
      };
    case 'unchanged': {
      const touched = newSteps.filter(
        (s) => s.link.status === 'modified' || s.link.status === 'restructured',
      );
      if (touched.length === 0)
        return { severity: 'neutral', text: 'Same route, same time.' };
      return {
        severity: 'info',
        text: `Same travel time. ${touched.length} pathway${touched.length === 1 ? '' : 's'} on this route changed (${[...new Set(touched.map((s) => describeLinkChange(s.link)))].join('; ')}).`,
      };
    }
  }
}

function sameSteps(a: RouteStep[], b: RouteStep[]): boolean {
  return a.length === b.length && a.every((s, i) => s.link.id === b[i].link.id);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function describeLinkChange(link: PathwayLink): string {
  if (link.status === 'restructured')
    return `${linkTitle(link)}: new pathway_id`;
  const fields = [...new Set(link.field_changes.map((c) => c.field))];
  return `${linkTitle(link)}: ${fields.join(', ')}`;
}

// ── Station summary ────────────────────────────────────────────────

export interface CellCounts {
  lost: number;
  gained: number;
  slower: number;
  faster: number;
  maxSlowerS: number;
  maxFasterS: number;
}

export interface Badge {
  label: string;
  severity: Severity;
}

export interface StationSummary {
  stepFree: CellCounts;
  fastest: CellCounts;
  links: Record<LinkStatus, number>;
  nodes: Record<RowStatus, number>;
  levels: { added: number; deleted: number; renamed: number; modified: number };
  elevators: { added: number; removed: number };
  signage: number;
  riderVisible: boolean;
  badges: Badge[];
  /** "4 pathways changed · 1 level renamed" */
  detail: string;
}

const SIGNAGE_FIELDS = new Set(['signposted_as', 'reversed_signposted_as']);

function countCells(m: ReachabilityMatrix): CellCounts {
  const c: CellCounts = {
    lost: 0,
    gained: 0,
    slower: 0,
    faster: 0,
    maxSlowerS: 0,
    maxFasterS: 0,
  };
  for (const cell of m.cells) {
    if (cell.change === 'lost') c.lost++;
    else if (cell.change === 'gained') c.gained++;
    else if (cell.change === 'slower') {
      c.slower++;
      c.maxSlowerS = Math.max(c.maxSlowerS, cell.deltaS ?? 0);
    } else if (cell.change === 'faster') {
      c.faster++;
      c.maxFasterS = Math.max(c.maxFasterS, -(cell.deltaS ?? 0));
    }
  }
  return c;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function summarizeStation(
  station: StationPathwaysDiff,
  stepFree: ReachabilityMatrix,
  fastest: ReachabilityMatrix,
): StationSummary {
  const links: Record<LinkStatus, number> = {
    added: 0,
    deleted: 0,
    modified: 0,
    restructured: 0,
    unchanged: 0,
  };
  const elevators = { added: 0, removed: 0 };
  let signage = 0;
  for (const l of station.links) {
    links[l.status]++;
    if (l.mode === '5' && l.status === 'added') elevators.added++;
    if (l.mode === '5' && l.status === 'deleted') elevators.removed++;
    if (l.field_changes.some((c) => SIGNAGE_FIELDS.has(c.field))) signage++;
  }
  const nodes: Record<RowStatus, number> = {
    added: 0,
    deleted: 0,
    modified: 0,
    unchanged: 0,
  };
  for (const n of station.nodes) nodes[n.status]++;
  const levels = { added: 0, deleted: 0, renamed: 0, modified: 0 };
  for (const l of station.levels) {
    if (l.status === 'added') levels.added++;
    else if (l.status === 'deleted') levels.deleted++;
    else if (l.status === 'modified') {
      if (l.field_changes.some((c) => c.field === 'level_name'))
        levels.renamed++;
      else levels.modified++;
    }
  }

  const sf = countCells(stepFree);
  const fa = countCells(fastest);
  const riderVisible =
    links.added + links.deleted + links.modified > 0 ||
    nodes.added + nodes.deleted + nodes.modified > 0 ||
    levels.added + levels.deleted + levels.renamed + levels.modified > 0;

  const badges: Badge[] = [];
  if (station.status === 'added')
    badges.push({ label: 'New pathways', severity: 'success' });
  if (station.status === 'deleted')
    badges.push({ label: 'Pathways removed', severity: 'error' });
  if (fa.lost > 0)
    badges.push({ label: 'Platform unreachable', severity: 'error' });
  if (sf.lost > 0)
    badges.push({ label: 'Step-free access lost', severity: 'error' });
  if (sf.gained > 0)
    badges.push({ label: 'Step-free access gained', severity: 'success' });
  if (elevators.added > 0)
    badges.push({ label: 'New elevator', severity: 'success' });
  if (elevators.removed > 0)
    badges.push({ label: 'Elevator removed', severity: 'error' });
  if (fa.slower + sf.slower > 0)
    badges.push({ label: 'Slower walk', severity: 'warning' });
  if (fa.faster + sf.faster > 0)
    badges.push({ label: 'Faster walk', severity: 'success' });
  if (signage > 0) badges.push({ label: 'Signage changed', severity: 'info' });
  if (levels.renamed > 0)
    badges.push({ label: 'Level renamed', severity: 'info' });
  if (!riderVisible)
    badges.push({ label: 'No rider-visible change', severity: 'neutral' });
  else if (badges.length === 0)
    badges.push({ label: 'Attributes changed', severity: 'neutral' });

  const parts: string[] = [];
  const changedLinks = links.added + links.deleted + links.modified;
  if (changedLinks > 0)
    parts.push(`${plural(changedLinks, 'pathway')} changed`);
  if (links.restructured > 0)
    parts.push(`${plural(links.restructured, 'pathway')} restructured`);
  if (levels.renamed > 0)
    parts.push(`${plural(levels.renamed, 'level')} renamed`);
  const levelOther = levels.added + levels.deleted + levels.modified;
  if (levelOther > 0) parts.push(`${plural(levelOther, 'level')} changed`);
  const nodeChanges = nodes.added + nodes.deleted + nodes.modified;
  if (nodeChanges > 0) parts.push(`${plural(nodeChanges, 'node')} changed`);

  return {
    stepFree: sf,
    fastest: fa,
    links,
    nodes,
    levels,
    elevators,
    signage,
    riderVisible,
    badges,
    detail: parts.join(' · '),
  };
}

/** Lower is more severe; used to order the station cards. */
export function stationSeverity(s: StationSummary): number {
  if (s.fastest.lost > 0) return 0;
  if (s.stepFree.lost > 0) return 1;
  if (s.fastest.slower + s.stepFree.slower > 0) return 2;
  if (s.riderVisible) return 3;
  return 4;
}

// ── Everything one station view needs ──────────────────────────────

export interface StationAnalysis {
  station: StationPathwaysDiff;
  labels: Map<string, NodeLabel>;
  matrices: Record<RouteMode, ReachabilityMatrix>;
  summary: StationSummary;
}

export function analyzeStation(station: StationPathwaysDiff): StationAnalysis {
  const labels = buildNodeLabels(station);
  const stepFree = computeMatrix(station, labels, 'step_free');
  const fastest = computeMatrix(station, labels, 'fastest');
  return {
    station,
    labels,
    matrices: { step_free: stepFree, fastest },
    summary: summarizeStation(station, stepFree, fastest),
  };
}
