/**
 * Pure helpers of the routes v2 detail's directions: card labels and change
 * chips, the selected direction's stops (or their union over directions),
 * its shapes, and the ?dir= URL parameter. A selected direction is its
 * direction_id; null means "All directions".
 */

import type {
  RouteDetail,
  RouteDirectionDiff,
  RouteShapeDiff,
} from './entity-diff-types';
import type { DirectionStops } from './route-tables';
import { STOP_KIND_COLORS } from './stops-utils';

/** The URL parameter holding the selected direction. */
export const DIR_PARAM = 'dir';

/** Whether a direction runs in both feeds or only in one. */
export type DirectionPresence = 'both' | 'added' | 'removed';

export function directionPresence(d: RouteDirectionDiff): DirectionPresence {
  const base =
    d.headsign.base != null || d.shape_id.base != null || d.geometry.base;
  const next =
    d.headsign.new != null || d.shape_id.new != null || d.geometry.new;
  if (next && !base) return 'added';
  if (base && !next) return 'removed';
  return 'both';
}

/** "0 → Harvard": the new headsign, else the base one. */
export function directionLabel(d: RouteDirectionDiff): string {
  const headsign = d.headsign.new ?? d.headsign.base;
  return headsign
    ? `${d.direction_id || '—'} → ${headsign}`
    : `Direction ${d.direction_id || '—'}`;
}

/** The base headsign when the new one differs, else null. */
export function headsignWas(d: RouteDirectionDiff): string | null {
  const { base, new: next } = d.headsign;
  return base && next && base !== next ? base : null;
}

/**
 * The direction's main line moved past the threshold. A new main shape id
 * alone (a renamed shape, same geometry) is not a path change.
 */
export function directionPathChanged(
  d: RouteDirectionDiff,
  thresholdM: number,
): boolean {
  return d.path_change_m != null && d.path_change_m > thresholdM;
}

const NO_STOPS: DirectionStops = { added: [], removed: [], moved: [] };

/** A direction card: its label and change chips. */
export interface DirectionSummary {
  direction_id: string;
  label: string;
  presence: DirectionPresence;
  headsignWas: string | null;
  pathChanged: boolean;
  added: number;
  removed: number;
  moved: number;
}

export function directionSummaries(
  route: Pick<RouteDetail, 'directions' | 'direction_stops'>,
  thresholdM: number,
): DirectionSummary[] {
  return route.directions.map((d) => {
    const s = route.direction_stops[d.direction_id] ?? NO_STOPS;
    return {
      direction_id: d.direction_id,
      label: directionLabel(d),
      presence: directionPresence(d),
      headsignWas: headsignWas(d),
      pathChanged: directionPathChanged(d, thresholdM),
      added: s.added.length,
      removed: s.removed.length,
      moved: s.moved.length,
    };
  });
}

/** A card's stop chip, e.g. "+3 −1 stops"; null without added or removed stops. */
export function stopCountLabel(added: number, removed: number): string | null {
  const parts = [
    added > 0 ? `+${added}` : '',
    removed > 0 ? `−${removed}` : '',
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return `${parts.join(' ')} stop${added + removed === 1 ? '' : 's'}`;
}

function uniq(ids: Iterable<string>): string[] {
  return [...new Set(ids)];
}

/**
 * The added / removed / moved stops of one direction, or for null (All
 * directions) their union over every direction and the route's own added
 * and removed stops, each list deduplicated. A stop added to one direction
 * and removed from another is in both lists.
 */
export function stopsForDirection(
  route: Pick<RouteDetail, 'direction_stops' | 'stops'>,
  dir: string | null,
): DirectionStops {
  if (dir != null) return route.direction_stops[dir] ?? NO_STOPS;
  const all = Object.values(route.direction_stops);
  return {
    added: uniq([...all.flatMap((s) => s.added), ...route.stops.added]),
    removed: uniq([...all.flatMap((s) => s.removed), ...route.stops.removed]),
    moved: uniq(all.flatMap((s) => s.moved)),
  };
}

export type DirectionStopRelation = keyof DirectionStops;

export const DIRECTION_STOP_LABELS: Record<DirectionStopRelation, string> = {
  added: 'Added',
  removed: 'Removed',
  moved: 'Moved',
};

/** Like the stops page: green added, red removed, purple moved. */
export const DIRECTION_STOP_COLORS: Record<DirectionStopRelation, string> = {
  added: STOP_KIND_COLORS.added,
  removed: STOP_KIND_COLORS.removed,
  moved: STOP_KIND_COLORS.moved,
};

/** One marker per stop: added, else removed, else moved. */
export function stopMarkers(
  stops: DirectionStops,
): Array<{ stop_id: string; relation: DirectionStopRelation }> {
  const seen = new Set<string>();
  const out: Array<{ stop_id: string; relation: DirectionStopRelation }> = [];
  for (const relation of ['added', 'removed', 'moved'] as const) {
    for (const id of stops[relation]) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ stop_id: id, relation });
    }
  }
  return out;
}

/** The route's directions drawn for a selection (every one for null). */
export function selectedDirections(
  directions: RouteDirectionDiff[],
  dir: string | null,
): RouteDirectionDiff[] {
  return dir == null
    ? directions
    : directions.filter((d) => d.direction_id === dir);
}

/**
 * The shapes a direction uses, its main shape(s) first (in either feed;
 * a renamed shape by either id); every shape, as given, for null.
 */
export function directionShapes(
  shapes: RouteShapeDiff[],
  directions: RouteDirectionDiff[],
  dir: string | null,
): RouteShapeDiff[] {
  if (dir == null) return shapes;
  const d = directions.find((x) => x.direction_id === dir);
  const main = new Set(
    [d?.shape_id.base, d?.shape_id.new].filter((id): id is string => !!id),
  );
  const isMain = (sh: RouteShapeDiff): boolean =>
    main.has(sh.shape_id) ||
    (sh.renamed_from != null && main.has(sh.renamed_from));
  const used = shapes.filter((sh) => sh.directions.includes(dir));
  return [...used.filter(isMain), ...used.filter((sh) => !isMain(sh))];
}

/**
 * The selected direction from ?dir=: null (All directions) when absent,
 * unknown, or the route has a single direction.
 */
export function parseDirParam(
  value: string | null,
  directionIds: string[],
): string | null {
  if (value == null || directionIds.length <= 1) return null;
  return directionIds.includes(value) ? value : null;
}

/** A query string (no leading "?") with ?dir= set, or removed for null. */
export function withDirParam(search: string, dir: string | null): string {
  const params = new URLSearchParams(search);
  if (dir == null) params.delete(DIR_PARAM);
  else params.set(DIR_PARAM, dir);
  return params.toString();
}
