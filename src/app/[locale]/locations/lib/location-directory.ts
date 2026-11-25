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
/** Maximum `limit` of the `/v1/locations` endpoints. */
export const LOCATIONS_API_PAGE_SIZE = 100;
/** Anchor of the feed list; pagination links jump back to it. */
export const FEEDS_SECTION_ID = 'feeds';

// URL segments: lowercase letters (any script), digits and hyphens, e.g.
// `north-america`, `ca`, `175905-montreal`.
const SLUG_PATTERN = /^[\p{Ll}\p{Lo}\p{M}\p{Nd}-]+$/u;
// A country's segment is its ISO 3166-1 alpha-2 code, lowercased.
const COUNTRY_SEGMENT_PATTERN = /^[a-z]{2}$/;
// Below the country, a segment starts with the location id; the rest is the
// name, only there to be read.
const PLACE_SEGMENT_PATTERN = /^(\d+)(?:-|$)/;

function decodeSegment(segment: string): string | null {
  if (!segment.includes('%')) return segment;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** The location id at the start of a place segment (`175905-montreal`). */
function placeIdOf(segment: string): number | null {
  const match = PLACE_SEGMENT_PATTERN.exec(segment);
  if (match === null) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * The location a directory URL asks for. `segments` are the URL segments as
 * requested, to compare with the location's canonical segments.
 */
export type LocationRequest =
  | { kind: 'root'; segments: string[] }
  | { kind: 'continent'; segments: string[]; continentSlug: string }
  | { kind: 'country'; segments: string[]; countryCode: string }
  | { kind: 'place'; segments: string[]; locationId: number };

/**
 * Parses the optional catch-all segments of `/locations/...`:
 * `<continent>/<country code>/<id>-<name>/...`, as deep as the location. A
 * country without continent starts at its code. Only the last segment
 * identifies the location (continent slug, country code or location id);
 * the others are checked against its canonical URL by the page.
 *
 * @returns null when a segment is malformed: empty, uppercase, spaces,
 * punctuation other than `-`, or a place segment without its id.
 */
export function parseLocationRequest(
  rawSegments: readonly string[] | undefined,
): LocationRequest | null {
  const segments: string[] = [];
  for (const rawSegment of rawSegments ?? []) {
    const segment = decodeSegment(rawSegment);
    if (segment === null || !SLUG_PATTERN.test(segment)) return null;
    segments.push(segment);
  }
  if (segments.length === 0) return { kind: 'root', segments };
  // Continent slugs are never two letters long, unlike country codes.
  const startsWithContinent = !COUNTRY_SEGMENT_PATTERN.test(segments[0]);
  const fromCountry = startsWithContinent ? segments.slice(1) : segments;
  if (fromCountry.length === 0) {
    return { kind: 'continent', segments, continentSlug: segments[0] };
  }
  if (!COUNTRY_SEGMENT_PATTERN.test(fromCountry[0])) return null;
  if (fromCountry.length === 1) {
    return { kind: 'country', segments, countryCode: fromCountry[0] };
  }
  const placeIds = fromCountry.slice(1).map(placeIdOf);
  const locationId = placeIds[placeIds.length - 1];
  if (placeIds.includes(null) || locationId == null) return null;
  return { kind: 'place', segments, locationId };
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
 * `/locations/north-america/ca/61549-quebec?page=2`. Page 1 has no query
 * string so that it stays the canonical URL of the location. Pass the result
 * to the next-intl `Link`, which adds the locale prefix.
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

/** Display name of a location, falling back to its slug. */
export function getLocationName(location: LocationResult): string {
  return location.name ?? location.slug ?? '';
}

/** A continent, as the directory names and links it. */
export interface ContinentInfo {
  code: string;
  slug: string;
  name: string;
}

/** The continents of the `/v1/locations` results, by code. */
export function toContinentInfo(
  continents: readonly LocationResult[],
): ContinentInfo[] {
  return continents.flatMap((continent) =>
    continent.location_type === 'continent' &&
    continent.continent_code != undefined
      ? [
          {
            code: continent.continent_code,
            slug: continent.slug,
            name: getLocationName(continent),
          },
        ]
      : [],
  );
}

function continentOf(
  location: LocationResult,
  continents: readonly ContinentInfo[],
): ContinentInfo | undefined {
  return continents.find(({ code }) => code === location.continent_code);
}

/**
 * Canonical URL segments of a location: a continent's slug, then for any
 * other location its continent's slug and its `path_slugs`, from the country
 * down (`['north-america', 'ca', '61549-quebec']`). A country without
 * continent starts at its code.
 */
export function getLocationSegments(
  location: LocationResult,
  continents: readonly ContinentInfo[],
): string[] {
  if (location.location_type === 'continent') return [location.slug];
  const continent = continentOf(location, continents);
  return continent !== undefined
    ? [continent.slug, ...location.path_slugs]
    : [...location.path_slugs];
}

/** Whether two segment lists are the same URL path. */
export function isSameSegments(
  a: readonly string[],
  b: readonly string[],
): boolean {
  return a.length === b.length && a.every((segment, i) => segment === b[i]);
}

/** What the children of a directory page are, for their heading and search. */
export type ChildrenKind = 'continents' | 'countries' | 'places';

/** Continents at the root, countries in a continent, places below. */
export function getChildrenKind(location: LocationResult | null): ChildrenKind {
  if (location === null) return 'continents';
  return location.location_type === 'continent' ? 'countries' : 'places';
}

export interface BreadcrumbStep {
  label: string;
  /** URL segments of this step, continent first. */
  segments: string[];
}

/**
 * One step per level of the location, continent first: its continent, then
 * one per `path_names` entry, each linked through the matching prefix of
 * `path_slugs`. Empty at the root.
 */
export function buildBreadcrumbSteps(
  location: LocationResult | null,
  continents: readonly ContinentInfo[],
): BreadcrumbStep[] {
  if (location === null) return [];
  if (location.location_type === 'continent') {
    return [{ label: getLocationName(location), segments: [location.slug] }];
  }
  const continent = continentOf(location, continents);
  const prefix = continent !== undefined ? [continent.slug] : [];
  const steps: BreadcrumbStep[] =
    continent !== undefined
      ? [{ label: continent.name, segments: prefix }]
      : [];
  const names = location.path_names;
  const slugs = location.path_slugs;
  const depth = Math.min(names.length, slugs.length);
  for (let index = 0; index < depth; index++) {
    steps.push({
      label: names[index],
      segments: [...prefix, ...slugs.slice(0, index + 1)],
    });
  }
  return steps;
}

/**
 * Human-readable place for titles, most specific first: `Montréal, Québec,
 * Canada`. A continent is named on its own; empty at the root.
 */
export function buildPlaceName(location: LocationResult | null): string {
  if (location === null) return '';
  if (location.location_type === 'continent') return getLocationName(location);
  // `path_names` runs from the country down.
  const names = location.path_names;
  if (names.length === 0) return getLocationName(location);
  return [...names].reverse().join(', ');
}

export interface ResultsPage<T> {
  total?: number;
  results?: T[];
}

export type PageFetcher<T> = (
  offset: number,
  limit: number,
) => Promise<ResultsPage<T>>;

/**
 * Completes the first page of an offset-paginated endpoint: it tells the
 * total and the effective page size, the remaining pages are then fetched
 * in parallel.
 */
export async function fetchRemainingPages<T>(
  first: ResultsPage<T>,
  fetchPage: PageFetcher<T>,
  pageSize: number = LOCATIONS_API_PAGE_SIZE,
): Promise<T[]> {
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

/** Every result of an offset-paginated endpoint; see fetchRemainingPages. */
export async function fetchAllPages<T>(
  fetchPage: PageFetcher<T>,
  pageSize: number = LOCATIONS_API_PAGE_SIZE,
): Promise<T[]> {
  const first = await fetchPage(0, pageSize);
  return await fetchRemainingPages(first, fetchPage, pageSize);
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
