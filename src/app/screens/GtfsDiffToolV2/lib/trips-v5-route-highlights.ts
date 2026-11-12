/**
 * The notable highlights about one route, for the Trips v5 route page
 * (/gtfs-diff-tool-v2/<dataset>/trips-v5/<route_id>): those whose entities
 * name the route. Highlights about rows or dates name no route and are left
 * out.
 *
 * Pure; type-only imports.
 */

import type { GlobalHighlight } from './global-highlights';

/** Route ids a highlight's entities name. */
export function highlightRouteIds(h: GlobalHighlight): string[] {
  const e = h.entities;
  if (e == null) return [];
  switch (e.kind) {
    case 'routes':
      return e.routes.map((r) => r.route);
    case 'hours':
    case 'spans':
      return e.rows.map((r) => r.route);
    case 'list':
      return e.of === 'route' ? e.rows.map((r) => r.openId ?? r.id) : [];
    default:
      return [];
  }
}

/** The highlights naming `routeId`, in their ranking order. */
export function routeHighlights(
  highlights: GlobalHighlight[],
  routeId: string,
): GlobalHighlight[] {
  return highlights.filter((h) => highlightRouteIds(h).includes(routeId));
}
