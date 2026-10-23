/**
 * Notable highlights of the stops page: rider-facing stop regressions found
 * in stops_map (the changed stops with their before / after rows).
 */

import type { StopChange, StopsMapSource } from './entity-diff-types';
import {
  type EntityRow,
  type Highlight,
  makeHighlight,
  plural,
  rankHighlights,
} from './highlights';
import { formatDistance } from './stops-utils';

export type StopsHighlight = Highlight<EntityRow[]>;

/** A move worth calling out (smaller ones are usually GPS refinements). */
export const STOP_MOVE_FAR_M = 100;

function routesText(ids: string[], name: (id: string) => string): string {
  const names = ids.map(name);
  return names.length <= 3
    ? names.join(', ')
    : `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
}

function field(s: StopChange, side: 'base' | 'new', column: string): string {
  return s[side]?.[column] ?? '';
}

function changed(s: StopChange, column: string): boolean {
  return s.field_changes.some((c) => c.field === column);
}

export function stopsHighlights(
  map: StopsMapSource,
  routeName: (routeId: string) => string = (id) => id,
): StopsHighlight[] {
  const out: StopsHighlight[] = [];
  const row = (s: StopChange, note: string): EntityRow => ({
    id: s.stop_id,
    label: s.name,
    note,
  });

  // Stops a route served in the original feed, gone from the new one.
  const servedRemoved = map.stops.filter(
    (s) => s.status === 'deleted' && s.route_ids.base.length > 0,
  );
  if (servedRemoved.length > 0) {
    out.push(
      makeHighlight(
        'served_removed',
        0.9,
        `${plural(servedRemoved.length, 'stop')} removed that routes served`,
        'In the original feed at least one trip stopped there.',
        servedRemoved.map((s) =>
          row(s, `served by ${routesText(s.route_ids.base, routeName)}`),
        ),
      ),
    );
  }

  // Accessibility regressions.
  const wheelchair = map.stops.filter(
    (s) =>
      s.status === 'modified' &&
      field(s, 'base', 'wheelchair_boarding') === '1' &&
      field(s, 'new', 'wheelchair_boarding') !== '1',
  );
  if (wheelchair.length > 0) {
    out.push(
      makeHighlight(
        'wheelchair_lost',
        0.85 + 0.1 * Math.min(1, wheelchair.length / 100),
        `${plural(wheelchair.length, 'stop')} no longer wheelchair accessible`,
        'wheelchair_boarding was 1 in the original feed and is not in the new one.',
        wheelchair.map((s) =>
          row(
            s,
            `wheelchair_boarding 1 → ${field(s, 'new', 'wheelchair_boarding') || 'empty'}`,
          ),
        ),
      ),
    );
  }

  // Stops that moved far enough for riders to notice.
  const moved = map.stops
    .filter((s) => (s.moved_m ?? 0) >= STOP_MOVE_FAR_M)
    .sort((a, b) => (b.moved_m ?? 0) - (a.moved_m ?? 0));
  if (moved.length > 0) {
    const farthest = moved[0].moved_m ?? 0;
    out.push(
      makeHighlight(
        'moved_far',
        0.5 + 0.4 * Math.min(1, farthest / 1000),
        `${plural(moved.length, 'stop')} moved more than ${STOP_MOVE_FAR_M} m`,
        `The farthest moved ${formatDistance(farthest)}.`,
        moved.map((s) => row(s, `moved ${formatDistance(s.moved_m)}`)),
      ),
    );
  }

  // Station structure: a stop moved to another station, or changed type.
  const station = map.stops.filter(
    (s) =>
      s.status === 'modified' &&
      (changed(s, 'parent_station') || changed(s, 'location_type')),
  );
  if (station.length > 0) {
    out.push(
      makeHighlight(
        'station_changed',
        0.4,
        `${plural(station.length, 'stop')} changed station or type`,
        'parent_station or location_type changed.',
        station.map((s) => {
          const c =
            s.field_changes.find((x) => x.field === 'parent_station') ??
            s.field_changes.find((x) => x.field === 'location_type');
          return row(
            s,
            c
              ? `${c.field} ${c.base_value || '∅'} → ${c.new_value || '∅'}`
              : '',
          );
        }),
      ),
    );
  }

  // Renamed stops (what riders read on signs and in apps).
  const renamed = map.stops.filter(
    (s) => s.status === 'modified' && changed(s, 'stop_name'),
  );
  if (renamed.length > 0) {
    out.push(
      makeHighlight(
        'renamed',
        0.35 + 0.1 * Math.min(1, renamed.length / 200),
        `${plural(renamed.length, 'stop')} renamed`,
        'stop_name changed.',
        renamed.map((s) => row(s, `was “${field(s, 'base', 'stop_name')}”`)),
      ),
    );
  }

  // New stops that no trip stops at: usually unfinished data.
  const unserved = map.stops.filter(
    (s) => s.status === 'added' && s.route_ids.new.length === 0,
  );
  if (unserved.length > 0) {
    out.push(
      makeHighlight(
        'new_unserved',
        0.3,
        `${plural(unserved.length, 'new stop')} no trip serves`,
        'Added to stops.txt, but no stop_times row uses them.',
        unserved.map((s) => row(s, 'no trip stops here')),
      ),
    );
  }

  return rankHighlights(out);
}
