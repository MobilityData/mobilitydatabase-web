/**
 * Pure helpers for the /locations directory: URL segment and page parsing,
 * URL and breadcrumb building, paging and count formatting. Safe to import
 * from server and client components; holds no data fetching.
 */
import type { components } from '../../../services/feeds/types';

export type LocationResult = components['schemas']['LocationSearchResult'];
export type LocationFeedCounts = components['schemas']['LocationFeedCounts'];

export const LOCATIONS_BASE_PATH = '/locations';
export const LOCATION_FEEDS_PAGE_SIZE = 20;
/** Maximum `limit` of `GET /v1/locations`. */
export const LOCATIONS_API_PAGE_SIZE = 100;
/** Anchor of the feed list; pagination links jump back to it. */
export const FEEDS_SECTION_ID = 'feeds';

/**
 * A directory location as addressed by its URL: the continent slug, then the
 * `path_slugs` of the location from the country down. Both are empty at the
 * root; `path` is empty on a continent page.
 */
export interface LocationPath {
  continent?: string;
  path: string[];
}

// API slugs: lowercase letters (any script), digits and hyphens, e.g.
// `north-america`, `montreal`, `washington-township-123456`.
const SLUG_PATTERN = /^[\p{Ll}\p{Lo}\p{M}\p{Nd}-]+$/u;

function decodeSegment(segment: string): string | null {
  if (!segment.includes('%')) return segment;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * Maps the optional catch-all segments to a location path: the first segment
 * is the continent, the others are the location's path slugs, at any depth.
 *
 * @returns the path (empty at the root), or null when a segment is not a
 * valid slug (empty, uppercase, spaces, punctuation other than `-`).
 */
export function parseLocationSegments(
  segments: readonly string[] | undefined,
): LocationPath | null {
  if (segments == undefined || segments.length === 0) return { path: [] };
  const slugs: string[] = [];
  for (const segment of segments) {
    const slug = decodeSegment(segment);
    if (slug === null || !SLUG_PATTERN.test(slug)) return null;
    slugs.push(slug);
  }
  const [continent, ...path] = slugs;
  return { continent, path };
}

const PAGE_PATTERN = /^[1-9]\d*$/;

/**
 * Parses the 1-based `?page=` search param.
 *
 * @returns 1 when absent, the page number when it is a positive integer
 * written without leading zeros or signs, otherwise null.
 */
export function parsePageParam(
  raw: string | string[] | undefined,
): number | null {
  if (raw == undefined) return 1;
  if (typeof raw !== 'string' || !PAGE_PATTERN.test(raw)) return null;
  const page = Number(raw);
  return Number.isSafeInteger(page) ? page : null;
}

/** Number of pages needed for `total` items; never less than 1. */
export function getPageCount(
  total: number,
  pageSize: number = LOCATION_FEEDS_PAGE_SIZE,
): number {
  if (total <= 0) return 1;
  return Math.ceil(total / pageSize);
}

/** API offset of the first item of a 1-based page. */
export function getPageOffset(
  page: number,
  pageSize: number = LOCATION_FEEDS_PAGE_SIZE,
): number {
  return (page - 1) * pageSize;
}

/**
 * Locale-less path to a directory location, e.g.
 * `/locations/north-america/canada/quebec?page=2`. Page 1 has no query string
 * so that it stays the canonical URL of the location. Pass the result to the
 * next-intl `Link`, which adds the locale prefix.
 */
export function buildLocationHref(
  segments: readonly string[],
  page: number = 1,
): string {
  const path = [LOCATIONS_BASE_PATH, ...segments.map(encodeURIComponent)].join(
    '/',
  );
  return page > 1 ? `${path}?page=${page}` : path;
}

/** URL slug of a continent row; continents have no geopolygon path. */
export function getContinentSlug(continent: LocationResult): string {
  return continent.continent_slug ?? continent.slug ?? '';
}

/** Display name of a location, falling back to its slug. */
export function getLocationName(location: LocationResult): string {
  if (location.location_type === 'continent') {
    return (
      location.name ?? location.continent_name ?? getContinentSlug(location)
    );
  }
  return location.name ?? location.slug ?? '';
}

/**
 * URL segments of a location under the continent of the current page:
 * `[continent, ...path_slugs]`. A continent row links to its own slug.
 */
export function getLocationSegments(
  continentSlug: string,
  location: LocationResult,
): string[] {
  if (location.location_type === 'continent') {
    return [getContinentSlug(location)];
  }
  return [continentSlug, ...(location.path_slugs ?? [])];
}

export interface BreadcrumbStep {
  label: string;
  /** URL segments of this step, continent first. */
  segments: string[];
}

/**
 * The continent, then one step per `path_names` entry, each linked through
 * the matching prefix of `path_slugs`. Empty at the root.
 */
export function buildBreadcrumbSteps(
  continentSlug: string,
  location: LocationResult | null,
): BreadcrumbStep[] {
  if (location === null) return [];
  const continentStep: BreadcrumbStep = {
    label:
      location.continent_name ??
      (location.location_type === 'continent'
        ? getLocationName(location)
        : continentSlug),
    segments: [continentSlug],
  };
  if (location.location_type === 'continent') return [continentStep];
  const names = location.path_names ?? [];
  const slugs = location.path_slugs ?? [];
  const depth = Math.min(names.length, slugs.length);
  const steps = [continentStep];
  for (let index = 0; index < depth; index++) {
    steps.push({
      label: names[index],
      segments: [continentSlug, ...slugs.slice(0, index + 1)],
    });
  }
  return steps;
}

/**
 * Human-readable place for titles, most specific first:
 * `Montréal, Québec, Canada`. A continent is named on its own; empty at the
 * root.
 */
export function buildPlaceName(location: LocationResult | null): string {
  if (location === null) return '';
  if (location.location_type === 'continent') return getLocationName(location);
  const names = location.path_names ?? [];
  if (names.length === 0) return getLocationName(location);
  return [...names].reverse().join(', ');
}

/** True when the API result is the location the URL asked for. */
export function isLocationAtPath(
  location: LocationResult,
  continentSlug: string,
  path: readonly string[],
): boolean {
  return (
    location.continent_slug === continentSlug &&
    (location.path_slugs ?? []).join('/') === path.join('/')
  );
}

export interface ResultsPage<T> {
  total?: number;
  results?: T[];
}

/**
 * Fetches every result of an offset-paginated endpoint: the first page tells
 * the total and the effective page size, the remaining pages are then
 * fetched in parallel.
 */
export async function fetchAllPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<ResultsPage<T>>,
  pageSize: number = LOCATIONS_API_PAGE_SIZE,
): Promise<T[]> {
  const first = await fetchPage(0, pageSize);
  const results = [...(first.results ?? [])];
  const total = first.total ?? results.length;
  // A server that caps `limit` lower than asked still pages consistently.
  const step = results.length;
  if (step === 0 || step >= total) return results;
  const offsets: number[] = [];
  for (let offset = step; offset < total; offset += step) {
    offsets.push(offset);
  }
  const rest = await Promise.all(
    offsets.map(async (offset) => await fetchPage(offset, pageSize)),
  );
  for (const page of rest) results.push(...(page.results ?? []));
  return results;
}

export const FEED_COUNT_DATA_TYPES = ['gtfs', 'gtfs_rt', 'gbfs'] as const;
export type FeedCountDataType = (typeof FEED_COUNT_DATA_TYPES)[number];

export interface FeedCountEntry {
  dataType: FeedCountDataType;
  count: number;
}

/** GTFS, GTFS-RT and GBFS counts in display order; missing counts are 0. */
export function getFeedCountEntries(
  counts: LocationFeedCounts | undefined,
): FeedCountEntry[] {
  return FEED_COUNT_DATA_TYPES.map((dataType) => ({
    dataType,
    count: counts?.[dataType] ?? 0,
  }));
}

/** Total distinct feeds of a location, falling back to the sum by type. */
export function getTotalFeedCount(
  counts: LocationFeedCounts | undefined,
): number {
  if (counts?.total != undefined) return counts.total;
  return getFeedCountEntries(counts).reduce(
    (sum, entry) => sum + entry.count,
    0,
  );
}

/** Lowercased and without accents, so "Québec" matches "quebec". */
export function normalizeLocationName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Most feeds first; ties by name, ignoring accents and case. */
export function sortByFeedCount<
  T extends { name: string; counts: LocationFeedCounts | undefined },
>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      getTotalFeedCount(b.counts) - getTotalFeedCount(a.counts) ||
      normalizeLocationName(a.name).localeCompare(
        normalizeLocationName(b.name),
      ),
  );
}

/** Items whose name contains the query, ignoring accents and case. */
export function filterByName<T extends { name: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const normalizedQuery = normalizeLocationName(query);
  if (normalizedQuery === '') return [...items];
  return items.filter((item) =>
    normalizeLocationName(item.name).includes(normalizedQuery),
  );
}

/** Locale-aware integer formatting, e.g. 1234 -> "1,234" (en). */
export function formatCount(value: number | undefined, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    value ?? 0,
  );
}
