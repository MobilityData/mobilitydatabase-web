/**
 * Pure helpers for the /locations directory: URL segment and page parsing,
 * URL building and count formatting. Safe to import from server and client
 * components; holds no data fetching.
 */
import type { components } from '../../../services/feeds/types';

export type LocationDirectoryNode =
  components['schemas']['LocationDirectoryNode'];
export type LocationDirectoryLevel =
  components['schemas']['LocationDirectoryLevel'];
export type LocationDirectoryFeedCounts =
  components['schemas']['LocationDirectoryFeedCounts'];

export const LOCATIONS_BASE_PATH = '/locations';
export const LOCATION_FEEDS_PAGE_SIZE = 20;
/** continent > country > subdivision > municipality */
export const MAX_LOCATION_DEPTH = 4;
/** Anchor of the feed list; pagination links jump back to it. */
export const FEEDS_SECTION_ID = 'feeds';

/** Query parameters shared by both directory endpoints. */
export interface LocationQuery {
  continent?: string;
  /** Country slug, e.g. `canada`. */
  country?: string;
  subdivision?: string;
  municipality?: string;
}

const QUERY_KEYS_BY_DEPTH = [
  'continent',
  'country',
  'subdivision',
  'municipality',
] as const;

/**
 * Maps the optional catch-all segments to the directory query. Segments are
 * passed through untouched: API slugs are exactly the URL segments.
 *
 * @returns the query (empty at the root), or null when the path is deeper
 * than a municipality or contains an empty segment.
 */
export function parseLocationSegments(
  segments: readonly string[] | undefined,
): LocationQuery | null {
  if (segments == undefined) return {};
  if (segments.length > MAX_LOCATION_DEPTH) return null;
  const query: LocationQuery = {};
  for (let depth = 0; depth < segments.length; depth++) {
    const segment = segments[depth].trim();
    if (segment === '') return null;
    query[QUERY_KEYS_BY_DEPTH[depth]] = segment;
  }
  return query;
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
 * Locale-less path to a directory node, e.g.
 * `/locations/north-america/canada/quebec?page=2`. Page 1 has no query string so
 * that it stays the canonical URL of the node. Pass the result to the
 * next-intl `Link`, which adds the locale prefix.
 */
export function buildLocationHref(
  slugs: readonly string[],
  page: number = 1,
): string {
  const path = [LOCATIONS_BASE_PATH, ...slugs.map(encodeURIComponent)].join(
    '/',
  );
  return page > 1 ? `${path}?page=${page}` : path;
}

/** Slugs of every breadcrumb node, from the continent down. */
export function getBreadcrumbSlugs(
  breadcrumb: readonly LocationDirectoryNode[] | undefined,
): string[] {
  return (breadcrumb ?? []).map((node) => node.slug ?? '');
}

export const FEED_COUNT_DATA_TYPES = ['gtfs', 'gtfs_rt', 'gbfs'] as const;
export type FeedCountDataType = (typeof FEED_COUNT_DATA_TYPES)[number];

export interface FeedCountEntry {
  dataType: FeedCountDataType;
  count: number;
}

/** GTFS, GTFS-RT and GBFS counts in display order; missing counts are 0. */
export function getFeedCountEntries(
  counts: LocationDirectoryFeedCounts | undefined,
): FeedCountEntry[] {
  return FEED_COUNT_DATA_TYPES.map((dataType) => ({
    dataType,
    count: counts?.[dataType] ?? 0,
  }));
}

/** Total distinct feeds of a node, falling back to the sum by data type. */
export function getTotalFeedCount(
  counts: LocationDirectoryFeedCounts | undefined,
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
  T extends { name: string; counts: LocationDirectoryFeedCounts | undefined },
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

const CHILD_LEVEL: Record<
  LocationDirectoryLevel,
  LocationDirectoryLevel | null
> = {
  root: 'continent',
  continent: 'country',
  country: 'subdivision',
  subdivision: 'municipality',
  municipality: null,
};

/** The level of a node's children, or null for municipalities. */
export function getChildLevel(
  level: LocationDirectoryLevel | undefined,
): LocationDirectoryLevel | null {
  return CHILD_LEVEL[level ?? 'root'];
}

/**
 * Human-readable place for titles, most specific first:
 * `Montréal, Québec, Canada`. The continent is dropped once a country is
 * known; a continent on its own is returned as is. Empty at the root.
 */
export function buildPlaceName(
  breadcrumb: readonly LocationDirectoryNode[] | undefined,
): string {
  const names = (breadcrumb ?? [])
    .filter(
      (node, index, all) => !(node.level === 'continent' && all.length > 1),
    )
    .map((node) => node.name ?? node.slug ?? '')
    .filter((name) => name !== '');
  return names.reverse().join(', ');
}
