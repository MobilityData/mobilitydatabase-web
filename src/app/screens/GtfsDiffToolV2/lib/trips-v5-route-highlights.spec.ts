import type { GlobalHighlight } from './global-highlights';
import {
  highlightRouteIds,
  routeHighlights,
} from './trips-v5-route-highlights';

function highlight(
  id: string,
  entities?: GlobalHighlight['entities'],
): GlobalHighlight {
  return {
    key: `trips:${id}`,
    section: 'trips',
    id,
    rank: 1,
    score: 0.5,
    severity: 'warning',
    title: id,
    detail: '',
    affected: 0,
    entities,
  };
}

const DROPPED = highlight('routes_dropped', {
  kind: 'routes',
  routes: [{ route: 'M5B', base: 1, new: 0 }],
});
const ADDED = highlight('service_added', {
  kind: 'hours',
  rows: [
    { route: 'M1', label: 'M1', when: 'weekdays', base: [0], new: [1] },
    { route: 'M5B', label: 'M5B', when: 'weekdays', base: [0], new: [1] },
  ],
});
const LISTED = highlight('route_list', {
  kind: 'list',
  of: 'route',
  rows: [{ id: '5B', label: 'M5B', note: '', openId: 'M5B' }],
  total: 1,
});
const STOPS = highlight('stop_list', {
  kind: 'list',
  of: 'stop',
  rows: [{ id: 'M5B', label: '', note: '' }],
  total: 1,
});
const ROWS = highlight('boarding_restricted', {
  kind: 'rows',
  file: 'stop_times.txt',
  filters: { actions: ['modified'] },
  count: 630,
});

describe('highlightRouteIds', () => {
  it('reads route ids from routes, hours and route lists', () => {
    expect(highlightRouteIds(DROPPED)).toEqual(['M5B']);
    expect(highlightRouteIds(ADDED)).toEqual(['M1', 'M5B']);
    expect(highlightRouteIds(LISTED)).toEqual(['M5B']);
  });

  it('names no route for stops, rows or no entities', () => {
    expect(highlightRouteIds(STOPS)).toEqual([]);
    expect(highlightRouteIds(ROWS)).toEqual([]);
    expect(highlightRouteIds(highlight('bare'))).toEqual([]);
  });
});

describe('routeHighlights', () => {
  it('keeps the highlights naming the route, in order', () => {
    const all = [ROWS, DROPPED, STOPS, ADDED, LISTED];
    expect(routeHighlights(all, 'M5B').map((h) => h.id)).toEqual([
      'routes_dropped',
      'service_added',
      'route_list',
    ]);
    expect(routeHighlights(all, 'M1').map((h) => h.id)).toEqual([
      'service_added',
    ]);
    expect(routeHighlights(all, 'M9')).toEqual([]);
  });
});
