/**
 * Route list filters and the per-route page of the trips view
 * (/gtfs-diff-tool-v2/<dataset>/trips-v2/<route_id>).
 *
 * Filters, the service day and the direction live in the query string, so
 * going back from a route page restores the list as it was.
 */

import type { RouteInfo } from './entity-diff-types';
import type { DayDiff, RouteDirDiff, RouteVerdict } from './trips-types';
import { TRIP_CLASSES } from './trips-utils';
import { normalizeText } from './stops-utils';

/** Verdicts offered as filters, in display order. */
export const FILTER_VERDICTS: RouteVerdict[] = [
  'less_service',
  'more_service',
  'retimed',
  'pattern',
  'rules_attributes',
];

export interface RouteRowFilters {
  /** Rows with any of these verdicts; empty = every changed row. */
  verdicts: RouteVerdict[];
  /** route_id, short / long name or headsign (accent-insensitive). */
  search: string;
}

export const EMPTY_ROUTE_FILTERS: RouteRowFilters = {
  verdicts: [],
  search: '',
};

function matchesSearch(
  r: RouteDirDiff,
  query: string,
  routes: Record<string, RouteInfo>,
): boolean {
  const q = normalizeText(query);
  if (q === '') return true;
  const info = routes[r.route];
  return [
    r.route,
    info?.short_name ?? '',
    info?.long_name ?? '',
    r.headsign,
  ].some((s) => normalizeText(s).includes(q));
}

export function filterRouteRows(
  rows: RouteDirDiff[],
  f: RouteRowFilters,
  routes: Record<string, RouteInfo>,
): RouteDirDiff[] {
  return rows.filter(
    (r) =>
      (f.verdicts.length === 0 ||
        f.verdicts.some((v) => r.verdicts.includes(v))) &&
      matchesSearch(r, f.search, routes),
  );
}

/** Rows per verdict under the search (not the verdict filter itself). */
export function verdictCounts(
  rows: RouteDirDiff[],
  search: string,
  routes: Record<string, RouteInfo>,
): Record<RouteVerdict, number> {
  const counts = Object.fromEntries(
    FILTER_VERDICTS.map((v) => [v, 0]),
  ) as Record<RouteVerdict, number>;
  for (const r of rows) {
    if (!matchesSearch(r, search, routes)) continue;
    for (const v of r.verdicts) if (v in counts) counts[v]++;
  }
  return counts;
}

// ── Query string ───────────────────────────────────────────────────

export function parseRouteFilters(params: URLSearchParams): RouteRowFilters {
  const verdicts = (params.get('change') ?? '')
    .split(',')
    .filter((v): v is RouteVerdict =>
      (FILTER_VERDICTS as string[]).includes(v),
    );
  return { verdicts, search: params.get('q') ?? '' };
}

/** Write filters into `params` (dropping empty ones). */
export function writeRouteFilters(
  params: URLSearchParams,
  f: RouteRowFilters,
): void {
  if (f.verdicts.length > 0) params.set('change', f.verdicts.join(','));
  else params.delete('change');
  if (f.search !== '') params.set('q', f.search);
  else params.delete('q');
}

/**
 * Trips views with route pages: v2, v3 and v5 (one route page; v3 and v5
 * open the technical drill-down in a popup, v5 drops the feed chips and the
 * route list link and puts the day in a subheader).
 */
export type TripsView = 'trips-v2' | 'trips-v3' | 'trips-v5' | 'trips-v6';

/**
 * Views whose route page is the lighter Trips v5 one: Trips v6 opens the
 * same page from a route's calendar.
 */
export function isV5Style(view: TripsView): boolean {
  return view === 'trips-v5' || view === 'trips-v6';
}

/** Trips v6's page of one route: its calendar. */
export function tripsV6RouteHref(datasetId: string, routeId: string): string {
  return `/gtfs-diff-tool-v2/${datasetId}/trips-v6/${encodeURIComponent(routeId)}`;
}

/** The Trips view the report's links open (summary, highlights, routes). */
export const DEFAULT_TRIPS_VIEW: TripsView = 'trips-v5';

/**
 * /gtfs-diff-tool-v2/<dataset>/trips-v2/<route_id>?day=…&dir=…, carrying the
 * list's filters so "All routes" restores the list as it was. In Trips v6
 * /trips-v6/<route_id> is the route's calendar, its day page being
 * /trips-v6/<route_id>/detail?day=….
 */
export function tripsRouteHref(
  datasetId: string,
  routeId: string,
  opts: {
    day?: string | null;
    dir?: string | null;
    filters?: RouteRowFilters;
    view?: TripsView;
  } = {},
): string {
  const params = new URLSearchParams();
  if (opts.day) params.set('day', opts.day);
  if (opts.dir != null) params.set('dir', opts.dir);
  if (opts.filters) writeRouteFilters(params, opts.filters);
  const qs = params.toString();
  const view = opts.view ?? 'trips-v2';
  const page = view === 'trips-v6' ? '/detail' : '';
  return `/gtfs-diff-tool-v2/${datasetId}/${view}/${encodeURIComponent(routeId)}${page}${qs ? `?${qs}` : ''}`;
}

/** The list page, keeping the service day and filters. */
export function tripsListHref(
  datasetId: string,
  day?: string | null,
  filters?: RouteRowFilters,
  view: TripsView = 'trips-v2',
): string {
  const params = new URLSearchParams();
  if (day) params.set('day', day);
  if (filters) writeRouteFilters(params, filters);
  const qs = params.toString();
  return `/gtfs-diff-tool-v2/${datasetId}/${view}${qs ? `?${qs}` : ''}`;
}

// ── Route page ─────────────────────────────────────────────────────

/**
 * The day's diff restricted to one route_id, every direction or only `dir`,
 * totals recomputed.
 */
export function scopeDayToRoute(
  day: DayDiff,
  routeId: string,
  dir?: string,
): DayDiff {
  const routes = day.routes.filter(
    (r) => r.route === routeId && (dir == null || r.dir === dir),
  );
  const class_counts = Object.fromEntries(
    TRIP_CLASSES.map((c) => [c, 0]),
  ) as DayDiff['class_counts'];
  let minor = 0;
  const trips = { base: 0, new: 0 };
  for (const r of routes) {
    for (const c of TRIP_CLASSES) class_counts[c] += r.class_counts[c] ?? 0;
    minor += r.minor_count;
    trips.base += r.trips.base;
    trips.new += r.trips.new;
  }
  return { ...day, routes, class_counts, minor_count: minor, trips };
}

/** Direction to open: the requested one, else the most impacted. */
export function defaultDirection(
  rows: RouteDirDiff[],
  requested: string | null,
): RouteDirDiff | null {
  if (rows.length === 0) return null;
  const asked =
    requested == null ? undefined : rows.find((r) => r.dir === requested);
  return asked ?? [...rows].sort((a, b) => b.impact - a.impact)[0];
}
