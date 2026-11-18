/**
 * Where every output of a diff lives, relative to the diff's folder. The
 * single source of the layout: the build scripts write and the app reads
 * through these paths, so neither spells a path of its own.
 *
 *   manifest.json            every published file with its size (written last)
 *   report.json              feeds, one entry per GTFS file, the analyses, top highlights
 *   raw/<file>.parquet       file-level diff of one GTFS file (rows of both feeds)
 *   analysis/                computed tables, named after the GTFS things they describe
 *     stops.json, stops.parquet
 *     routes.json, routes.parquet, shapes.parquet
 *     services.json, services.parquet, service_dates.parquet
 *     pathways.json
 *   highlights/
 *     index.json             every section's highlights in one ranking
 *     <section>.json         one section's highlights with their entity lists
 *   views/                   copies shaped for one viewer; never needed to read the diff
 *     trips/index.json       the Trips view's day index
 *     trips/calendar.json    the Trips view's calendar
 *     trips/day-routes.parquet  each comparison's trip changes by route and direction
 *     trips/<side>.parquet   each feed's trips, one JSON row per trip, by service
 *     routes-overview.pmtiles
 *   .build/                  build-only intermediates, never published
 *
 * Pure, no imports, type-strippable: the Node generators import it directly.
 */

export const MANIFEST_FILE = 'manifest.json';
export const REPORT_FILE = 'report.json';

export const RAW_DIR = 'raw';
export const ANALYSIS_DIR = 'analysis';
export const HIGHLIGHTS_DIR = 'highlights';
export const VIEWS_DIR = 'views';
/** Build-only files; dotfiles are left out of the manifest. */
export const BUILD_DIR = '.build';

/** The raw table of one GTFS file: 'stops.txt' -> 'raw/stops.parquet'. */
export function rawTablePath(gtfsFile: string): string {
  return `${RAW_DIR}/${gtfsFile.replace(/\.[^.]+$/, '')}.parquet`;
}

/** Each analysis's JSON (settings, counts, the paths of its tables), by analysis. */
export const ANALYSIS_FILES = {
  stops: 'analysis/stops.json',
  routes: 'analysis/routes.json',
  services: 'analysis/services.json',
  pathways: 'analysis/pathways.json',
} as const;

export type AnalysisName = keyof typeof ANALYSIS_FILES;

/** The analyses' Parquet tables. */
export const STOPS_TABLE = 'analysis/stops.parquet';
export const ROUTES_TABLE = 'analysis/routes.parquet';
export const SHAPES_TABLE = 'analysis/shapes.parquet';
export const SERVICES_TABLE = 'analysis/services.parquet';
export const SERVICE_DATES_TABLE = 'analysis/service_dates.parquet';

/** Highlight sections, named after the GTFS things their highlights list. */
export const HIGHLIGHT_SECTIONS = [
  'stops',
  'routes',
  'services',
  'trips',
] as const;

export type HighlightSection = (typeof HIGHLIGHT_SECTIONS)[number];

export const HIGHLIGHTS_INDEX_FILE = 'highlights/index.json';

/** One section's highlights file: 'routes' -> 'highlights/routes.json'. */
export function highlightsFilePath(section: string): string {
  return `${HIGHLIGHTS_DIR}/${section}.json`;
}

/** The Trips view's files. */
export const TRIPS_INDEX_FILE = 'views/trips/index.json';
export const TRIPS_CALENDAR_FILE = 'views/trips/calendar.json';
/** Trip changes of every calendar comparison by route and direction (lib/trips-day-routes). */
export const TRIPS_DAY_ROUTES_FILE = 'views/trips/day-routes.parquet';

/** One feed's trips table: 'base' -> 'views/trips/base.parquet'. */
export function tripsTablePath(side: 'base' | 'new'): string {
  return `${VIEWS_DIR}/trips/${side}.parquet`;
}

/** Prototype: the routes overview as vector tiles (hand-made, kept on rebuilds). */
export const ROUTES_OVERVIEW_TILES = 'views/routes-overview.pmtiles';

/** Build-only: each route's service on the typical days (the highlights step reads it). */
export const TRIPS_SERVICE_FILE = '.build/trips-service.json';
