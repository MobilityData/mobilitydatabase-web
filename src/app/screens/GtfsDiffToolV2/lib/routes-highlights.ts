/**
 * Notable highlights of the routes page: rider-facing route regressions found
 * in routes_map (each route's rows, stops, paths and shapes in both feeds).
 */

import type { RouteImpact, RoutesMapSource } from './entity-diff-types';
import {
  type EntityRow,
  type Highlight,
  makeHighlight,
  plural,
  rankHighlights,
} from './highlights';
import { formatDistance } from './stops-utils';
import { maxPathChange } from './routes-utils';

export type RoutesHighlight = Highlight<EntityRow[]>;

function changeOf(r: RouteImpact, field: string) {
  return r.field_changes.find((c) => c.field === field);
}

export function routesHighlights(map: RoutesMapSource): RoutesHighlight[] {
  const out: RoutesHighlight[] = [];
  const threshold = map.path_change_threshold_m;
  const row = (r: RouteImpact, note: string): EntityRow => ({
    id: r.short_name || r.route_id,
    label: r.long_name,
    note,
  });
  // Shown by short name; opened by route_id.
  const withId = (r: RouteImpact, note: string): EntityRow => ({
    ...row(r, note),
    openId: r.route_id,
  });

  const removed = map.routes.filter((r) => r.status === 'deleted');
  if (removed.length > 0) {
    out.push(
      makeHighlight(
        'routes_removed',
        0.9,
        `${plural(removed.length, 'route')} removed`,
        'In routes.txt or served by trips in the original feed only.',
        removed.map((r) => withId(r, `had ${plural(r.trips.base, 'trip')}`)),
      ),
    );
  }

  // Mode change (bus ↔ rail…): a different vehicle and often a different stop.
  const mode = map.routes.filter(
    (r) => r.status === 'modified' && changeOf(r, 'route_type'),
  );
  if (mode.length > 0) {
    out.push(
      makeHighlight(
        'mode_changed',
        0.8,
        `${plural(mode.length, 'route')} changed mode (route_type)`,
        'route_type changed.',
        mode.map((r) => {
          const c = changeOf(r, 'route_type');
          return withId(r, `route_type ${c?.base_value} → ${c?.new_value}`);
        }),
      ),
    );
  }

  // Routes that stop serving some of their stops.
  const dropping = map.routes
    .filter((r) => r.status === 'modified' && r.stops.removed.length > 0)
    .sort((a, b) => b.stops.removed.length - a.stops.removed.length);
  if (dropping.length > 0) {
    const most = dropping[0].stops.removed.length;
    out.push(
      makeHighlight(
        'stops_dropped',
        0.5 + 0.4 * Math.min(1, most / 20),
        `${plural(dropping.length, 'route')} stop serving some of their stops`,
        `Up to ${plural(most, 'stop')} on one route.`,
        dropping.map((r) =>
          withId(
            r,
            `−${plural(r.stops.removed.length, 'stop')} (${r.stops.base_count} → ${r.stops.new_count})`,
          ),
        ),
      ),
    );
  }

  // Re-routed: a path (main pattern or any shape) moved past the threshold.
  const rerouted = map.routes
    .filter((r) => r.status === 'modified' && r.flags.path)
    .map((r) => ({ r, m: maxPathChange(r, threshold) ?? 0 }))
    .filter((x) => x.m > threshold)
    .sort((a, b) => b.m - a.m);
  if (rerouted.length > 0) {
    out.push(
      makeHighlight(
        'rerouted',
        0.45 + 0.4 * Math.min(1, rerouted[0].m / 5000),
        `${plural(rerouted.length, 'route')} re-routed`,
        `Paths moved by up to ${formatDistance(rerouted[0].m)}.`,
        rerouted.map((x) => withId(x.r, `up to ${formatDistance(x.m)}`)),
      ),
    );
  }

  // Renamed routes (what riders see on vehicles and in apps).
  const renamed = map.routes.filter(
    (r) =>
      r.status === 'modified' &&
      (changeOf(r, 'route_short_name') || changeOf(r, 'route_long_name')),
  );
  if (renamed.length > 0) {
    out.push(
      makeHighlight(
        'renamed',
        0.35,
        `${plural(renamed.length, 'route')} renamed`,
        'route_short_name or route_long_name changed.',
        renamed.map((r) => {
          const c =
            changeOf(r, 'route_short_name') ?? changeOf(r, 'route_long_name');
          return withId(r, `was “${c?.base_value ?? ''}”`);
        }),
      ),
    );
  }

  const network = map.routes.filter(
    (r) => r.status === 'modified' && r.flags.network,
  );
  if (network.length > 0) {
    out.push(
      makeHighlight(
        'network_changed',
        0.3,
        `${plural(network.length, 'route')} moved to another network`,
        'network_id changed (fares and transfers can follow).',
        network.map((r) =>
          withId(r, `${r.networks.base ?? '∅'} → ${r.networks.new ?? '∅'}`),
        ),
      ),
    );
  }

  // Dead data: shapes no trip uses.
  const unused = map.unused_shapes ?? [];
  if (unused.length > 0) {
    out.push(
      makeHighlight(
        'unused_shapes',
        0.2,
        `${plural(unused.length, 'shape')} no trip uses`,
        'In shapes.txt but referenced by no trip in either feed.',
        unused.map((s) => ({ id: s.shape_id, label: '', note: s.status })),
      ),
    );
  }

  return rankHighlights(out);
}
