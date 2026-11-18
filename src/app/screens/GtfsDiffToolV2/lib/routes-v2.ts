/**
 * Pure helpers of the routes v2 page: change chips and overview styling
 * categories, the one-line summary and the highlight presets (directions:
 * lib/routes-v2-directions). Only the route's own changes count here
 * (ROUTE_V2_FLAGS): trips and services belong to the Trips and Service
 * Dates pages.
 */

import type { RouteFlag, RouteImpact } from './entity-diff-types';
import type { Highlight, EntityRow } from './highlights';
import {
  ROUTE_V2_FLAGS,
  type RouteChange,
  type RouteV2Filters,
} from './map-table-query';
import { ROUTE_FLAG_LABELS, type RouteKind } from './routes-utils';

export const ROUTE_CHANGE_LABELS: Record<RouteChange, string> = {
  path: ROUTE_FLAG_LABELS.path,
  stops: ROUTE_FLAG_LABELS.stops,
  attributes: ROUTE_FLAG_LABELS.attributes,
  network: ROUTE_FLAG_LABELS.network,
  added: 'Added',
  removed: 'Removed',
};

export const DEFAULT_V2_FILTERS: RouteV2Filters = {
  changes: [],
  kinds: [],
  showUnchanged: false,
  agencyId: null,
  search: '',
  routeIds: null,
};

/**
 * A route's change chips: Added / Removed, or a modified route's own flags
 * (none for trips or services changes alone).
 */
export function routeChanges(
  kind: RouteKind,
  flags: Record<RouteFlag, boolean>,
): RouteChange[] {
  if (kind === 'added' || kind === 'removed') return [kind];
  if (kind === 'unchanged') return [];
  return ROUTE_V2_FLAGS.filter((f) => flags[f]);
}

/** How the overview map draws a route. */
export type OverviewCategory =
  | 'removed'
  | 'added'
  | 'major'
  | 'minor'
  | 'unchanged';

export function overviewCategory(
  kind: RouteKind,
  flags: Record<RouteFlag, boolean>,
): OverviewCategory {
  if (kind === 'removed' || kind === 'added' || kind === 'unchanged')
    return kind;
  if (flags.path || flags.stops) return 'major';
  return flags.attributes || flags.network ? 'minor' : 'unchanged';
}

export const OVERVIEW_STYLES: Record<
  Exclude<OverviewCategory, 'unchanged'>,
  { label: string; color: string; width: number; dashed: boolean }
> = {
  major: {
    label: 'Path or stops changed',
    color: '#ed6c02',
    width: 4,
    dashed: false,
  },
  minor: {
    label: 'Attributes or network only',
    color: '#9e9e9e',
    width: 1.5,
    dashed: false,
  },
  added: { label: 'Added', color: '#2e7d32', width: 3, dashed: false },
  removed: { label: 'Removed', color: '#d32f2f', width: 2.5, dashed: true },
};

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

function sentence(words: string[], tail: string): string {
  const s = `${joinWords(words)} ${tail}.`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** One generated line, e.g. "Attributes changed. Path and stops unchanged." */
export function routeSummaryLine(r: RouteImpact): string {
  if (r.status === 'added') return 'New route in this feed.';
  if (r.status === 'deleted') return 'Route removed from this feed.';
  const parts: Array<[string, boolean]> = [
    ['path', r.flags.path],
    ['stops', r.flags.stops],
  ];
  const changed = parts.filter(([, c]) => c).map(([w]) => w);
  if (r.flags.attributes) changed.push('attributes');
  if (r.flags.network) changed.push('network');
  if (changed.length === 0) return 'Nothing changed.';
  const same = parts.filter(([, c]) => !c).map(([w]) => w);
  return [
    changed.length > 0 ? sentence(changed, 'changed') : '',
    same.length > 0 ? sentence(same, 'unchanged') : '',
  ]
    .filter(Boolean)
    .join(' ');
}

// ── Highlight presets ──────────────────────────────────────────────

/** Highlights that match a "What changed" chip. */
const PRESET_CHANGES: Record<string, RouteChange> = {
  routes_removed: 'removed',
  rerouted: 'path',
  stops_dropped: 'stops',
  network_changed: 'network',
};

/**
 * The filters a highlight applies: its "What changed" chip when there is
 * one, else its routes. Null for highlights that aren't about routes.
 */
export function highlightPreset(
  h: Highlight<EntityRow[]>,
): RouteV2Filters | null {
  const change = PRESET_CHANGES[h.id];
  if (change) return { ...DEFAULT_V2_FILTERS, changes: [change] };
  const ids = (h.entities ?? [])
    .map((e) => e.openId)
    .filter((id): id is string => id != null);
  return ids.length > 0 ? { ...DEFAULT_V2_FILTERS, routeIds: ids } : null;
}

export function sameFilters(a: RouteV2Filters, b: RouteV2Filters): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
