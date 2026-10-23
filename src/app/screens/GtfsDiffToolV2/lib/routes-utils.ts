/**
 * Pure helpers for the routes view: status/flag filtering, search, bounds
 * and one-line summaries of a route's impact.
 */

import type {
  LonLat,
  RouteFlag,
  RouteImpact,
  RouteShapeDiff,
  ShapeStatus,
} from './entity-diff-types';
import { formatDistance, normalizeText } from './stops-utils';

export type RouteKind = 'added' | 'removed' | 'modified' | 'unchanged';

export const ROUTE_KINDS: RouteKind[] = [
  'added',
  'removed',
  'modified',
  'unchanged',
];

export const ROUTE_KIND_COLORS: Record<RouteKind, string> = {
  added: '#2e7d32',
  removed: '#d32f2f',
  modified: '#ed6c02',
  unchanged: '#757575',
};

export const ROUTE_KIND_LABELS: Record<RouteKind, string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Modified',
  unchanged: 'Unchanged',
};

export const ROUTE_FLAGS: RouteFlag[] = [
  'path',
  'stops',
  'trips',
  'services',
  'attributes',
  'network',
];

export const ROUTE_FLAG_LABELS: Record<RouteFlag, string> = {
  path: 'Path',
  stops: 'Stops',
  trips: 'Trips',
  services: 'Services',
  attributes: 'Attributes',
  network: 'Network',
};

export interface RouteFilters {
  kinds: RouteKind[];
  /** Show routes having any of these changes; empty = no restriction. */
  flags: RouteFlag[];
  search: string;
}

export function routeKind(r: RouteImpact): RouteKind {
  return r.status === 'deleted' ? 'removed' : r.status;
}

export function routeMatchesSearch(r: RouteImpact, query: string): boolean {
  const q = normalizeText(query);
  if (q === '') return true;
  return [r.route_id, r.short_name, r.long_name].some((s) =>
    normalizeText(s).includes(q),
  );
}

export function filterRoutes(
  routes: RouteImpact[],
  f: RouteFilters,
): RouteImpact[] {
  return routes.filter(
    (r) =>
      f.kinds.includes(routeKind(r)) &&
      (f.flags.length === 0 || f.flags.some((fl) => r.flags[fl])) &&
      routeMatchesSearch(r, f.search),
  );
}

/** Natural sort by short name (M2 before M10). */
export function sortRoutes(routes: RouteImpact[]): RouteImpact[] {
  return [...routes].sort((a, b) =>
    (a.short_name || a.route_id).localeCompare(
      b.short_name || b.route_id,
      undefined,
      { numeric: true },
    ),
  );
}

export function routeBounds(routes: RouteImpact[]): [LonLat, LonLat] | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const r of routes) {
    for (const d of r.directions) {
      for (const line of [d.geometry.base, d.geometry.new]) {
        for (const [lon, lat] of line ?? []) {
          minLon = Math.min(minLon, lon);
          maxLon = Math.max(maxLon, lon);
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
        }
      }
    }
  }
  return Number.isFinite(minLon)
    ? [
        [minLon, minLat],
        [maxLon, maxLat],
      ]
    : null;
}

// ── Shapes ─────────────────────────────────────────────────────────

/** Mirrors PATH_CHANGE_THRESHOLD_M in the generator; diffs carry their own value. */
export const DEFAULT_PATH_THRESHOLD_M = 30;

/** Most significant first; also the order shapes are listed in. */
export const SHAPE_STATUSES: ShapeStatus[] = [
  'rerouted',
  'added',
  'deleted',
  'redrawn',
  'renamed',
  'points',
  'unchanged',
];

export const SHAPE_STATUS_LABELS: Record<ShapeStatus, string> = {
  rerouted: 'Re-routed',
  added: 'Added',
  deleted: 'Removed',
  redrawn: 'Redrawn',
  renamed: 'Renamed',
  points: 'Points only',
  unchanged: 'Unchanged',
};

export const SHAPE_STATUS_COLORS: Record<ShapeStatus, string> = {
  rerouted: '#7b1fa2',
  added: '#2e7d32',
  deleted: '#d32f2f',
  redrawn: '#ed6c02',
  renamed: '#0288d1',
  points: '#9e9e9e',
  unchanged: '#757575',
};

/** Statuses that never change what riders see; hidden unless asked for. */
export const MINOR_SHAPE_STATUSES: ShapeStatus[] = [
  'points',
  'renamed',
  'unchanged',
];

export function shapeStatusHelp(
  status: ShapeStatus,
  sameM: number,
  thresholdM: number,
): string {
  switch (status) {
    case 'rerouted':
      return `Same shape_id, path moved more than ${thresholdM} m.`;
    case 'redrawn':
      return `Same shape_id, path moved ${sameM}–${thresholdM} m: redigitized along the same roads.`;
    case 'points':
      return `Same geometry (within ${sameM} m); only points, coordinate precision or shape_dist_traveled changed.`;
    case 'renamed':
      return 'New shape_id with the same geometry as a removed shape of this route.';
    case 'added':
      return 'shape_id only in the new feed.';
    case 'deleted':
      return 'shape_id only in the original feed.';
    default:
      return 'Identical rows in both feeds.';
  }
}

/** A shape that changes where the route runs (not just how it is drawn). */
export function isPathChangingShape(
  sh: RouteShapeDiff,
  thresholdM: number,
): boolean {
  if (sh.status === 'rerouted') return true;
  if (sh.status === 'added' || sh.status === 'deleted') {
    return sh.deviation_m == null || sh.deviation_m > thresholdM;
  }
  return false;
}

/** Path change of an added/removed shape, explained. */
export function shapeDeviationText(
  sh: RouteShapeDiff,
  thresholdM: number,
): string {
  if (sh.deviation_m == null) {
    return sh.status === 'added'
      ? 'No shape in the original feed to compare with'
      : sh.status === 'deleted'
        ? 'No shape left in the new feed to compare with'
        : '—';
  }
  if (sh.status === 'added' || sh.status === 'deleted') {
    const verb =
      sh.status === 'added' ? 'New road, up to' : 'Abandoned road, up to';
    return sh.deviation_m > thresholdM
      ? `${verb} ${formatDistance(sh.deviation_m)} from the route's other shapes`
      : `Follows the route's existing roads (within ${formatDistance(sh.deviation_m)})`;
  }
  return formatDistance(sh.deviation_m);
}

export function shapeBounds(sh: RouteShapeDiff): [LonLat, LonLat] | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const line of [sh.geometry.base, sh.geometry.new]) {
    for (const [lon, lat] of line ?? []) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  return Number.isFinite(minLon)
    ? [
        [minLon, minLat],
        [maxLon, maxLat],
      ]
    : null;
}

/** Largest path change of a route: its main patterns, or any of its shapes. */
export function maxPathChange(
  r: RouteImpact,
  thresholdM = DEFAULT_PATH_THRESHOLD_M,
): number | null {
  const values = r.directions
    .map((d) => d.path_change_m)
    .filter((v): v is number => v != null);
  for (const sh of r.shapes ?? []) {
    if (sh.deviation_m != null && isPathChangingShape(sh, thresholdM))
      values.push(sh.deviation_m);
  }
  return values.length > 0 ? Math.max(...values) : null;
}

/** One-line summary of what changed, for the list. */
export function routeSummary(
  r: RouteImpact,
  thresholdM = DEFAULT_PATH_THRESHOLD_M,
): string {
  if (r.status === 'added')
    return `New route · ${r.trips.new} trips · ${r.stops.new_count} stops`;
  if (r.status === 'deleted')
    return `Route removed · had ${r.trips.base} trips · ${r.stops.base_count} stops`;
  if (r.status === 'unchanged')
    return `${r.trips.new} trips · ${r.stops.new_count} stops`;
  const parts: string[] = [];
  if (r.flags.path)
    parts.push(
      `path changed (up to ${formatDistance(maxPathChange(r, thresholdM))})`,
    );
  if (r.flags.stops) {
    const s = [
      r.stops.added.length > 0 && `+${r.stops.added.length}`,
      r.stops.removed.length > 0 && `−${r.stops.removed.length}`,
    ]
      .filter(Boolean)
      .join(' / ');
    parts.push(s ? `${s} stops` : 'stop order changed');
  }
  if (r.flags.trips) parts.push(`trips ${r.trips.base} → ${r.trips.new}`);
  if (r.flags.services) parts.push('services changed');
  if (r.flags.attributes)
    parts.push(
      `${r.field_changes.map((c) => c.field.replace(/^route_/, '')).join(', ')} changed`,
    );
  if (r.flags.network) parts.push('network changed');
  return parts.join(' · ');
}

/** How a stop relates to the selected route between the two feeds. */
export type StopRelation = 'added' | 'removed' | 'kept';

export const STOP_RELATION_COLORS: Record<StopRelation, string> = {
  added: '#2e7d32',
  removed: '#d32f2f',
  kept: '#ffffff',
};

export const STOP_RELATION_LABELS: Record<StopRelation, string> = {
  added: 'Now served by this route',
  removed: 'No longer served by this route',
  kept: 'Served before and after',
};

/** All stops to draw for a route, with their relation to it. */
export function routeStops(
  r: RouteImpact,
): Array<{ stop_id: string; relation: StopRelation }> {
  const added = new Set(r.stops.added);
  const removed = new Set(r.stops.removed);
  const ids = new Set<string>([...r.stops.added, ...r.stops.removed]);
  for (const d of r.directions)
    for (const o of d.pattern_diff) ids.add(o.stop_id);
  return [...ids].map((id) => ({
    stop_id: id,
    relation: added.has(id) ? 'added' : removed.has(id) ? 'removed' : 'kept',
  }));
}
