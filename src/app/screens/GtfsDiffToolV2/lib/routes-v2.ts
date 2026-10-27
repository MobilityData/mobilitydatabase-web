/**
 * Pure helpers of the routes v2 page: change chips and overview styling
 * categories, the one-line summary, typical-day trips, the collapsed stop
 * strip and the highlight presets.
 */

import type {
  PatternOp,
  RouteFlag,
  RouteImpact,
  TypicalDay,
} from './entity-diff-types';
import type { Highlight, EntityRow } from './highlights';
import { type RouteChange, type RouteV2Filters } from './map-table-query';
import { ROUTE_FLAGS, ROUTE_FLAG_LABELS, type RouteKind } from './routes-utils';

export const ROUTE_CHANGE_LABELS: Record<RouteChange, string> = {
  ...ROUTE_FLAG_LABELS,
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

/** A route's change chips: Added / Removed, or a modified route's flags. */
export function routeChanges(
  kind: RouteKind,
  flags: Record<RouteFlag, boolean>,
): RouteChange[] {
  if (kind === 'added' || kind === 'removed') return [kind];
  if (kind === 'unchanged') return [];
  return ROUTE_FLAGS.filter((f) => flags[f]);
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
  return flags.path || flags.stops ? 'major' : 'minor';
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
    label: 'Schedule or attributes only',
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

/** One generated line, e.g. "Schedule changed. Path and stops unchanged." */
export function routeSummaryLine(r: RouteImpact): string {
  if (r.status === 'added') return 'New route in this feed.';
  if (r.status === 'deleted') return 'Route removed from this feed.';
  if (r.status === 'unchanged') return 'Nothing changed.';
  const parts: Array<[string, boolean]> = [
    ['path', r.flags.path],
    ['stops', r.flags.stops],
    ['schedule', r.flags.trips || r.flags.services],
  ];
  const changed = parts.filter(([, c]) => c).map(([w]) => w);
  if (r.flags.attributes) changed.push('attributes');
  if (r.flags.network) changed.push('network');
  const same = parts.filter(([, c]) => !c).map(([w]) => w);
  return [
    changed.length > 0 ? sentence(changed, 'changed') : '',
    same.length > 0 ? sentence(same, 'unchanged') : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export const TYPICAL_DAYS: Array<{ day: TypicalDay; label: string }> = [
  { day: 'weekday', label: 'Weekday' },
  { day: 'saturday', label: 'Saturday' },
  { day: 'sunday', label: 'Sunday' },
];

// ── Stop strip ─────────────────────────────────────────────────────

/** Unchanged runs longer than this are collapsed to their ends. */
export const STRIP_COLLAPSE_RUN = 3;

export type StripRow =
  | { type: 'stop'; op: PatternOp; index: number }
  | { type: 'gap'; count: number; from: number };

/**
 * A direction's stop sequence diff with long runs of unchanged stops
 * collapsed to their first and last stop and a gap between them (keyed by
 * its first hidden index; listed in `expanded` to show it whole).
 */
export function stopStripRows(
  ops: PatternOp[],
  expanded: ReadonlySet<number> = new Set(),
): StripRow[] {
  const rows: StripRow[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].op !== 'keep') {
      rows.push({ type: 'stop', op: ops[i], index: i });
      i++;
      continue;
    }
    let j = i;
    while (j < ops.length && ops[j].op === 'keep') j++;
    const from = i + 1;
    if (j - i > STRIP_COLLAPSE_RUN && !expanded.has(from)) {
      rows.push({ type: 'stop', op: ops[i], index: i });
      rows.push({ type: 'gap', count: j - i - 2, from });
      rows.push({ type: 'stop', op: ops[j - 1], index: j - 1 });
    } else {
      for (let k = i; k < j; k++)
        rows.push({ type: 'stop', op: ops[k], index: k });
    }
    i = j;
  }
  return rows;
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

/** Services table of the calendar page (scripts/lib/calendar-tables.mjs). */
export const CALENDAR_SERVICES_PATH = 'calendar/services.parquet';

export type ServiceGroupKey =
  | 'added'
  | 'removed'
  | 'modified'
  | 'unchanged'
  | 'both';

export interface ServiceGroup {
  key: ServiceGroupKey;
  label: string;
  ids: string[];
}

const SERVICE_GROUP_LABELS: Record<ServiceGroupKey, string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Modified',
  unchanged: 'Unchanged',
  both: 'In both feeds',
};

/**
 * A route's service_ids by list header: added / removed for this route
 * (used only by the new / the original feed's trips), then the ones used by
 * both split by their calendar status (modified / unchanged), or kept
 * together while that status is unknown. Empty groups are left out; `search`
 * keeps the ids containing it (case-insensitive).
 */
export function serviceGroups(
  services: { base: string[]; new: string[] },
  status: Record<string, string> | null,
  search = '',
): ServiceGroup[] {
  const base = new Set(services.base);
  const next = new Set(services.new);
  const needle = search.trim().toLowerCase();
  const all = [...new Set([...services.base, ...services.new])]
    .filter((id) => needle === '' || id.toLowerCase().includes(needle))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const groups: Record<ServiceGroupKey, string[]> = {
    added: [],
    removed: [],
    modified: [],
    unchanged: [],
    both: [],
  };
  for (const id of all) {
    if (!base.has(id)) groups.added.push(id);
    else if (!next.has(id)) groups.removed.push(id);
    else if (status == null) groups.both.push(id);
    else if (status[id] === 'modified') groups.modified.push(id);
    else groups.unchanged.push(id);
  }
  return (Object.keys(groups) as ServiceGroupKey[])
    .filter((key) => groups[key].length > 0)
    .map((key) => ({
      key,
      label: SERVICE_GROUP_LABELS[key],
      ids: groups[key],
    }));
}
