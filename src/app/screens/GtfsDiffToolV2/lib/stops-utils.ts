/**
 * Pure helpers for the stops map: classification, filtering, search and
 * geometry for the "moved" arrows.
 */

import type { LonLat, StopChange } from './entity-diff-types';

/** Display kind: a moved stop is a modified stop whose position changed enough. */
export type StopKind = 'added' | 'removed' | 'modified' | 'moved';

export const STOP_KINDS: StopKind[] = ['added', 'removed', 'modified', 'moved'];

export const STOP_KIND_COLORS: Record<StopKind, string> = {
  added: '#2e7d32',
  removed: '#d32f2f',
  modified: '#ed6c02',
  moved: '#7b1fa2',
};

export const STOP_KIND_LABELS: Record<StopKind, string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Modified',
  moved: 'Moved',
};

const COORD_FIELDS = new Set(['stop_lat', 'stop_lon']);

export interface StopFilters {
  kinds: StopKind[];
  /** Minimum distance (m) for a modified stop to count as moved. */
  minMoveM: number;
  /** Hide stops whose only change is coordinates shifting less than minMoveM. */
  hidePrecisionOnly: boolean;
  search: string;
}

export function stopKind(s: StopChange, minMoveM: number): StopKind {
  if (s.status === 'added') return 'added';
  if (s.status === 'deleted') return 'removed';
  return s.moved_m != null && s.moved_m >= minMoveM ? 'moved' : 'modified';
}

/** Only stop_lat/stop_lon changed, and by less than the move threshold. */
export function isPrecisionOnly(s: StopChange, minMoveM: number): boolean {
  return (
    s.status === 'modified' &&
    s.field_changes.length > 0 &&
    s.field_changes.every((c) => COORD_FIELDS.has(c.field)) &&
    stopKind(s, minMoveM) !== 'moved'
  );
}

/** Lowercase and strip accents so "zona universitaria" matches "Zona Universitària". */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function matchesSearch(s: StopChange, query: string): boolean {
  const q = normalizeText(query);
  if (q === '') return true;
  const names = [s.stop_id, s.base?.stop_name ?? '', s.new?.stop_name ?? ''];
  return names.some((n) => normalizeText(n).includes(q));
}

export function filterStops(stops: StopChange[], f: StopFilters): StopChange[] {
  return stops.filter(
    (s) =>
      f.kinds.includes(stopKind(s, f.minMoveM)) &&
      !(f.hidePrecisionOnly && isPrecisionOnly(s, f.minMoveM)) &&
      matchesSearch(s, f.search),
  );
}

export function countKinds(
  stops: StopChange[],
  f: Omit<StopFilters, 'kinds'>,
): Record<StopKind, number> {
  const counts: Record<StopKind, number> = {
    added: 0,
    removed: 0,
    modified: 0,
    moved: 0,
  };
  for (const s of stops) {
    if (f.hidePrecisionOnly && isPrecisionOnly(s, f.minMoveM)) continue;
    if (!matchesSearch(s, f.search)) continue;
    counts[stopKind(s, f.minMoveM)]++;
  }
  return counts;
}

/** Where a stop is drawn: its new position, or its old one if removed. */
export function displayCoord(s: StopChange): LonLat | null {
  return s.new_coord ?? s.base_coord;
}

/** [[minLon, minLat], [maxLon, maxLat]] over both positions of every stop, or null. */
export function boundsOf(stops: StopChange[]): [LonLat, LonLat] | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const s of stops) {
    for (const c of [s.base_coord, s.new_coord]) {
      if (c == null) continue;
      minLon = Math.min(minLon, c[0]);
      maxLon = Math.max(maxLon, c[0]);
      minLat = Math.min(minLat, c[1]);
      maxLat = Math.max(maxLat, c[1]);
    }
  }
  return Number.isFinite(minLon)
    ? [
        [minLon, minLat],
        [maxLon, maxLat],
      ]
    : null;
}

/** Initial compass bearing from a to b, degrees clockwise from north. */
export function bearing(a: LonLat, b: LonLat): number {
  const rad = (d: number): number => (d * Math.PI) / 180;
  const [lon1, lat1] = [rad(a[0]), rad(a[1])];
  const [lon2, lat2] = [rad(b[0]), rad(b[1])];
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function formatDistance(m: number | null): string {
  if (m == null) return '—';
  if (m < 1) return `${Math.round(m * 100)} cm`;
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
