/**
 * Mock data and logic for the location directory endpoints:
 *   GET /v1/locations (list and search)
 *   GET /v1/locations/lookup (one location by path, with its children)
 *   GET /v1/locations/{location_id} and /v1/locations/{location_id}/children
 *   GET /v1/search with `location_id` / `location_path` (a location's feeds)
 *
 * Locations form a tree of variable depth under the continents (Los Angeles
 * sits under a county, San Francisco directly under California). Continents
 * have negative ids and parent their countries; a country without continent
 * starts its own path. Feed counts, `has_feeds` and the `sort=location`
 * relevance are derived from MOCK_FEEDS' stop locations, so the mock behaves
 * like the API: a feed counts once per location, sub-areas included.
 * Location ids, feed ids, URLs and names are fictional mock data.
 */
import type { components } from '../app/services/feeds/types';

type Feed = components['schemas']['SearchFeedItemResult'];
type LocationResult = components['schemas']['LocationSearchResult'];
type FeedCounts = components['schemas']['LocationFeedCounts'];
type LocationsResponse = components['schemas']['LocationSearchResponse'];
type LocationDetail = components['schemas']['LocationDetail'];
interface FeedsResponse {
  total: number;
  results: Feed[];
}

type PlaceType = 'continent' | 'country' | 'subdivision' | 'municipality';

interface Place {
  id: number;
  parent: number | null;
  type: PlaceType;
  name: string;
  /**
   * Continent code, ISO 3166-1 (countries) or ISO 3166-2 (subdivisions)
   * code.
   */
  code?: string;
}

/** Fixed ids, as in the API; Asia and South America have no feeds here. */
const continent = (id: number, name: string, code: string): Place => ({
  id,
  parent: null,
  type: 'continent',
  name,
  code,
});
const AFRICA = -1;
const EUROPE = -4;
const NORTH_AMERICA = -5;
const OCEANIA = -6;

const country = (
  id: number,
  name: string,
  code: string,
  continentId: number | null,
): Place => ({ id, parent: continentId, type: 'country', name, code });
const subdivision = (
  id: number,
  parent: number,
  name: string,
  code: string,
): Place => ({ id, parent, type: 'subdivision', name, code });
const municipality = (id: number, parent: number, name: string): Place => ({
  id,
  parent,
  type: 'municipality',
  name,
});

export const MOCK_PLACES: Place[] = [
  continent(AFRICA, 'Africa', 'AF'),
  continent(-2, 'Antarctica', 'AN'),
  continent(-3, 'Asia', 'AS'),
  continent(EUROPE, 'Europe', 'EU'),
  continent(NORTH_AMERICA, 'North America', 'NA'),
  continent(OCEANIA, 'Oceania', 'OC'),
  continent(-7, 'South America', 'SA'),
  country(100, 'Canada', 'CA', NORTH_AMERICA),
  subdivision(110, 100, 'Québec', 'CA-QC'),
  municipality(111, 110, 'Montréal'),
  municipality(112, 110, 'Laval'),
  municipality(113, 110, 'Longueuil'),
  municipality(114, 110, 'Québec'),
  subdivision(120, 100, 'Ontario', 'CA-ON'),
  municipality(121, 120, 'Toronto'),
  subdivision(130, 100, 'British Columbia', 'CA-BC'),
  municipality(131, 130, 'Vancouver'),
  country(200, 'United States', 'US', NORTH_AMERICA),
  subdivision(210, 200, 'California', 'US-CA'),
  // Extra intermediate level: county > city.
  municipality(211, 210, 'Los Angeles County'),
  municipality(212, 211, 'Los Angeles'),
  municipality(213, 211, 'Pasadena'),
  municipality(214, 210, 'San Francisco'),
  subdivision(220, 200, 'New York', 'US-NY'),
  municipality(221, 220, 'New York'),
  subdivision(230, 200, 'Ohio', 'US-OH'),
  // Siblings sharing a name: both slugs get `-<location_id>`.
  municipality(123456, 230, 'Washington Township'),
  municipality(123457, 230, 'Washington Township'),
  country(300, 'France', 'FR', EUROPE),
  subdivision(310, 300, 'Île-de-France', 'FR-IDF'),
  municipality(311, 310, 'Paris'),
  country(400, 'Germany', 'DE', EUROPE),
  subdivision(410, 400, 'Berlin', 'DE-BE'),
  municipality(411, 410, 'Berlin'),
  country(500, 'Australia', 'AU', OCEANIA),
  subdivision(510, 500, 'New South Wales', 'AU-NSW'),
  municipality(511, 510, 'Sydney'),
  country(600, 'South Africa', 'ZA', AFRICA),
  subdivision(610, 600, 'Western Cape', 'ZA-WC'),
  municipality(611, 610, 'Cape Town'),
  // No continent in the classification: its path starts at the country.
  country(700, 'Clipperton', 'CP', null),
];

const PLACES_BY_ID = new Map(MOCK_PLACES.map((place) => [place.id, place]));

/** Same slug rule as the API: `Québec` -> `quebec`. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

/** Slug among siblings, with `-<id>` when a sibling shares it. */
function slugOf(place: Place): string {
  const slug = slugify(place.name);
  const collides = MOCK_PLACES.some(
    (other) =>
      other.id !== place.id &&
      other.parent === place.parent &&
      slugify(other.name) === slug,
  );
  return collides ? `${slug}-${place.id}` : slug;
}

/** The place and its ancestors, from the continent down. */
function chainOf(place: Place): Place[] {
  const chain: Place[] = [];
  let current: Place | undefined = place;
  while (current != undefined) {
    chain.unshift(current);
    current =
      current.parent === null ? undefined : PLACES_BY_ID.get(current.parent);
  }
  return chain;
}

function ancestorOfType(place: Place, type: PlaceType): Place | undefined {
  return chainOf(place).find((ancestor) => ancestor.type === type);
}

function isWithin(placeId: number, ancestorId: number): boolean {
  const place = PLACES_BY_ID.get(placeId);
  return (
    place != undefined && chainOf(place).some(({ id }) => id === ancestorId)
  );
}

type FeedSeed = [
  dataType: Feed['data_type'],
  provider: string,
  feedName: string,
  /** One entry per group of stops, all of equal weight. */
  stopPlaces: number[],
];

const MONTREAL = 111;
const EXO_SECTORS = [
  'Chambly-Richelieu-Carignan',
  'Haut-Saint-Laurent',
  'Laurentides',
  'Le Richelain',
  'Roussillon',
  'Sorel-Varennes',
  'Sud-Ouest',
  'Terrebonne-Mascouche',
  'Vallée du Richelieu',
  'La Presqu’Île',
  'L’Assomption',
  'Deux-Montagnes',
];

const FEED_SEEDS: FeedSeed[] = [
  // Canada-wide
  ['gtfs', 'Example Intercity Rail', 'National rail network', [110, 120, 130]],
  // Québec, stops not geolocated to a municipality
  ['gtfs', 'Example Coach Lines', 'Intercity coaches', [110]],
  ['gtfs_rt', 'Example Coach Lines', 'Trip updates', [110]],
  // Montréal: 22 feeds, more than one page
  ['gtfs', 'Société de transport de Montréal', 'Bus and metro', [MONTREAL]],
  ['gtfs_rt', 'Société de transport de Montréal', 'Trip updates', [MONTREAL]],
  ['gtfs_rt', 'Société de transport de Montréal', 'Alerts', [MONTREAL]],
  ['gtfs', 'Réseau express métropolitain', 'REM light metro', [MONTREAL]],
  ['gtfs', 'exo', 'Commuter trains', [MONTREAL, 112, 113]],
  ['gtfs_rt', 'exo', 'Commuter trains - trip updates', [MONTREAL]],
  ...EXO_SECTORS.map(
    (sector): FeedSeed => ['gtfs', 'exo', `Buses - ${sector}`, [MONTREAL]],
  ),
  ['gbfs', 'BIXI Montréal', 'Bike share', [MONTREAL]],
  ['gbfs', 'Example Scooters', 'Montréal e-scooters', [MONTREAL]],
  ['gbfs', 'Example Car Share', 'Montréal car share', [MONTREAL]],
  ['gtfs_rt', 'exo', 'Commuter trains - vehicle positions', [MONTREAL]],
  // Elsewhere in Québec
  ['gtfs', 'Société de transport de Laval', 'Buses', [112]],
  ['gtfs', 'Réseau de transport de Longueuil', 'Buses', [113]],
  ['gtfs', 'Réseau de transport de la Capitale', 'Buses', [114]],
  ['gtfs_rt', 'Réseau de transport de la Capitale', 'Vehicle positions', [114]],
  // Ontario and British Columbia
  ['gtfs', 'Example Regional Transit', 'Regional rail and buses', [120, 121]],
  ['gtfs', 'Toronto Transit Commission', 'Surface and subway', [121]],
  ['gtfs_rt', 'Toronto Transit Commission', 'Trip updates', [121]],
  ['gbfs', 'Bike Share Toronto', 'Bike share', [121]],
  ['gtfs', 'Example Coast Transit', 'Buses and SkyTrain', [131]],
  // United States
  ['gtfs', 'Example Metro Los Angeles', 'Bus', [212, 213]],
  ['gtfs_rt', 'Example Metro Los Angeles', 'Trip updates', [212]],
  ['gtfs', 'Example County Transit', 'County buses', [211]],
  ['gtfs', 'Example Bay Area Rail', 'Rapid transit', [214]],
  ['gbfs', 'Example Bikes SF', 'Bike share', [214]],
  ['gtfs', 'Example Metropolitan Transit', 'Subway', [221]],
  ['gtfs_rt', 'Example Metropolitan Transit', 'Subway trip updates', [221]],
  ['gtfs', 'Example Township Shuttle', 'Shuttle', [123456]],
  ['gtfs', 'Example Township Dial-a-Ride', 'Dial-a-ride', [123457]],
  // Europe
  ['gtfs', 'Example Île-de-France Mobilités', 'Regional network', [311]],
  ['gbfs', 'Example Vélo Paris', 'Bike share', [311]],
  ['gtfs', 'Example Verkehrsverbund Berlin', 'Regional network', [411]],
  // Oceania
  ['gtfs', 'Example Transport NSW', 'Sydney network', [511]],
  ['gtfs_rt', 'Example Transport NSW', 'Trip updates', [511]],
  // Africa
  ['gtfs', 'Example Cape Town Bus', 'Bus rapid transit', [611]],
  // No continent
  ['gtfs', 'Example Island Boats', 'Supply boats', [700]],
];

interface MockFeed {
  feed: Feed;
  stopPlaces: number[];
}

function declaredLocation(
  placeId: number,
): NonNullable<Feed['locations']>[number] {
  const place = PLACES_BY_ID.get(placeId) as Place;
  const chain = chainOf(place);
  const placeCountry = ancestorOfType(place, 'country');
  const municipalities = chain.filter(({ type }) => type === 'municipality');
  return {
    country_code: placeCountry?.code,
    country: placeCountry?.name,
    subdivision_name: ancestorOfType(place, 'subdivision')?.name,
    municipality: municipalities[municipalities.length - 1]?.name,
  };
}

function toMockFeed(
  [dataType, provider, feedName, stopPlaces]: FeedSeed,
  index: number,
): MockFeed {
  const id = `mock-loc-${String(index + 1).padStart(3, '0')}`;
  return {
    stopPlaces,
    feed: {
      id,
      data_type: dataType,
      status: 'active',
      official: index % 3 === 0,
      seasonal: false,
      provider,
      feed_name: feedName,
      external_ids: [{ external_id: id, source: 'mdb' }],
      source_info: {
        producer_url: `https://example.com/${id}/${dataType}`,
        authentication_type: 0,
      },
      locations: stopPlaces.map(declaredLocation),
      entity_types: dataType === 'gtfs_rt' ? ['tu', 'vp'] : undefined,
      versions: dataType === 'gbfs' ? ['2.3'] : undefined,
    },
  };
}

const MOCK_FEEDS: MockFeed[] = FEED_SEEDS.map(toMockFeed);

/** Share of a feed's stop groups inside the location, 0 when outside. */
function shareIn({ stopPlaces }: MockFeed, locationId: number): number {
  const inside = stopPlaces.filter((placeId) => isWithin(placeId, locationId));
  return inside.length / stopPlaces.length;
}

function feedsIn(locationId: number): MockFeed[] {
  return MOCK_FEEDS.filter((feed) => shareIn(feed, locationId) > 0);
}

function countFeeds(feeds: MockFeed[]): FeedCounts {
  const count = (dataType: Feed['data_type']): number =>
    feeds.filter(({ feed }) => feed.data_type === dataType).length;
  return {
    gtfs: count('gtfs'),
    gtfs_rt: count('gtfs_rt'),
    gbfs: count('gbfs'),
    total: feeds.length,
  };
}

interface Row {
  result: LocationResult;
  depth: number;
  counts: FeedCounts;
}

function toRow(place: Place): Row {
  const chain = chainOf(place);
  const placeContinent = ancestorOfType(place, 'continent');
  const placeCountry = ancestorOfType(place, 'country');
  const placeSubdivision = ancestorOfType(place, 'subdivision');
  const pathSlugs = chain.map(slugOf);
  // From the country down, or the continent itself.
  const displayChain =
    place.type === 'continent'
      ? chain
      : chain.filter(({ type }) => type !== 'continent');
  return {
    depth: chain.length,
    counts: countFeeds(feedsIn(place.id)),
    result: {
      location_id: place.id,
      parent_location_id: place.parent,
      name: place.name,
      alt_name: null,
      location_type: place.type,
      continent_code: placeContinent?.code ?? null,
      slug: slugOf(place),
      path: pathSlugs.join('/'),
      path_slugs: pathSlugs,
      path_names: chain.map(({ name }) => name),
      country_name: placeCountry?.name ?? null,
      country_code: placeCountry?.code ?? null,
      subdivision_name: placeSubdivision?.name ?? null,
      subdivision_code: placeSubdivision?.code ?? null,
      display_name: displayChain.map(({ name }) => name).join(', '),
    },
  };
}

const ROWS: Row[] = MOCK_PLACES.map(toRow);
const ROWS_BY_ID = new Map(
  ROWS.map((row) => [row.result.location_id as number, row]),
);

export type MockResult<T> =
  | { status: 200; body: T }
  | { status: 400 | 404; body: { detail: string } };

const badRequest = (detail: string): MockResult<never> => ({
  status: 400,
  body: { detail },
});

const notFound = (detail: string): MockResult<never> => ({
  status: 404,
  body: { detail },
});

function readPaging(
  params: URLSearchParams,
  maxLimit: number,
): { limit: number; offset: number } | null {
  const limit = Number(params.get('limit') ?? String(maxLimit));
  const offset = Number(params.get('offset') ?? '0');
  if (!Number.isInteger(limit) || limit < 0 || limit > maxLimit) return null;
  if (!Number.isInteger(offset) || offset < 0) return null;
  return { limit, offset };
}

/** The comma-separated `include` values, or null when one is unsupported. */
function readInclude(
  params: URLSearchParams,
  allowed: readonly string[],
): Set<string> | null {
  const values = (params.get('include') ?? '')
    .split(',')
    .filter((value) => value !== '');
  if (values.some((value) => !allowed.includes(value))) return null;
  return new Set(values);
}

function readSort(
  params: URLSearchParams,
): 'admin_level' | 'feed_count' | null {
  const sort = params.get('sort') ?? 'admin_level';
  return sort === 'admin_level' || sort === 'feed_count' ? sort : null;
}

function readContinent(params: URLSearchParams): number | undefined {
  const value = params.get('continent')?.toLowerCase();
  if (value == undefined || value === '') return undefined;
  // Slug or code, case-insensitive; unknown values match nothing.
  return (
    ROWS.find(
      ({ result }) =>
        result.location_type === 'continent' &&
        [result.slug, result.continent_code?.toLowerCase()].includes(value),
    )?.result.location_id ?? Number.NaN
  );
}

const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function sortRows(rows: Row[], sort: 'admin_level' | 'feed_count'): Row[] {
  return [...rows].sort(
    (a, b) =>
      (sort === 'feed_count'
        ? (b.counts.total ?? 0) - (a.counts.total ?? 0)
        : a.depth - b.depth) ||
      (a.result.display_name ?? '').localeCompare(b.result.display_name ?? ''),
  );
}

/**
 * Filters, sorts and pages rows like the list endpoints; `include` adds the
 * feed counts.
 */
function listRows(
  rows: Row[],
  params: URLSearchParams,
  include: Set<string>,
): MockResult<LocationsResponse> {
  const sort = readSort(params);
  if (sort === null) return badRequest('Unsupported sort.');
  const paging = readPaging(params, 100);
  if (paging === null) return badRequest('Invalid limit or offset.');
  const hasFeeds = params.get('has_feeds') === 'true';
  const matching = sortRows(
    rows.filter(({ counts }) => !hasFeeds || (counts.total ?? 0) > 0),
    sort,
  );
  return {
    status: 200,
    body: {
      total: matching.length,
      results: matching
        .slice(paging.offset, paging.offset + paging.limit)
        .map(({ result, counts }) =>
          include.has('feed_counts')
            ? { ...result, feed_counts: counts }
            : result,
        ),
    },
  };
}

/** GET /v1/locations */
export function getMockLocations(
  params: URLSearchParams,
): MockResult<LocationsResponse> {
  const include = readInclude(params, ['feed_counts']);
  if (include === null) return badRequest('Unsupported include.');
  const locationType = params.get('location_type');
  const continentId = readContinent(params);
  const countryCode = params.get('country_code')?.toUpperCase();
  const subdivisionCode = params.get('subdivision_code')?.toUpperCase();
  const words = normalize(params.get('search_query') ?? '')
    .split(/\s+/)
    .filter((word) => word !== '');

  const rows = ROWS.filter(({ result }) => {
    if (locationType != null && result.location_type !== locationType)
      return false;
    if (
      continentId != undefined &&
      !isWithin(result.location_id as number, continentId)
    )
      return false;
    if (countryCode != undefined && result.country_code !== countryCode)
      return false;
    if (
      subdivisionCode != undefined &&
      result.subdivision_code !== subdivisionCode
    )
      return false;
    const haystack = normalize(result.display_name ?? '');
    return words.every((word) => haystack.includes(word));
  });
  return listRows(rows, params, include);
}

function childRows(locationId: number): Row[] {
  return ROWS.filter(({ result }) => result.parent_location_id === locationId);
}

/** The location of `row`, with its children when `include` has them. */
function detailOf(
  row: Row,
  params: URLSearchParams,
): MockResult<LocationDetail> {
  const include = readInclude(params, ['feed_counts', 'children']);
  if (include === null) return badRequest('Unsupported include.');
  const location: LocationDetail = include.has('feed_counts')
    ? { ...row.result, feed_counts: row.counts }
    : { ...row.result };
  if (!include.has('children')) return { status: 200, body: location };
  const children = listRows(
    childRows(row.result.location_id as number),
    params,
    include,
  );
  if (children.status !== 200) return children;
  return { status: 200, body: { ...location, children: children.body } };
}

function normalizePath(path: string): string {
  return path.toLowerCase().replace(/^\/+|\/+$/g, '');
}

/** GET /v1/locations/lookup */
export function getMockLocationByPath(
  params: URLSearchParams,
): MockResult<LocationDetail> {
  const path = normalizePath(params.get('path') ?? '');
  if (path === '') return badRequest('Missing path.');
  const row = ROWS.find(({ result }) => result.path === path);
  if (row == undefined) return notFound(`No location at ${path}.`);
  return detailOf(row, params);
}

function readLocationId(raw: string): number | undefined {
  const id = Number(raw);
  return Number.isInteger(id) ? id : undefined;
}

/** GET /v1/locations/{location_id} */
export function getMockLocation(
  rawId: string,
  params: URLSearchParams,
): MockResult<LocationDetail> {
  const id = readLocationId(rawId);
  if (id === undefined) return badRequest('Invalid location_id.');
  const row = ROWS_BY_ID.get(id);
  if (row == undefined) return notFound(`No location ${id}.`);
  return detailOf(row, params);
}

/** GET /v1/locations/{location_id}/children */
export function getMockLocationChildren(
  rawId: string,
  params: URLSearchParams,
): MockResult<LocationsResponse> {
  const id = readLocationId(rawId);
  if (id === undefined) return badRequest('Invalid location_id.');
  if (!ROWS_BY_ID.has(id)) return notFound(`No location ${id}.`);
  const include = readInclude(params, ['feed_counts']);
  if (include === null) return badRequest('Unsupported include.');
  return listRows(childRows(id), params, include);
}

/** True when a /v1/search request targets a location. */
export function isLocationSearch(params: URLSearchParams): boolean {
  return (
    params.has('location_id') ||
    params.has('location_path') ||
    params.get('sort') === 'location'
  );
}

/** GET /v1/search with `location_id` or `location_path`. */
export function getMockLocationFeeds(
  params: URLSearchParams,
): MockResult<FeedsResponse> {
  const sort = params.get('sort') ?? 'created_at';
  const rawLocationId = params.get('location_id');
  const rawPath = params.get('location_path');
  if (rawLocationId != null && rawPath != null) {
    return badRequest('Pass location_id or location_path, not both.');
  }
  let locationId: number | undefined;
  if (rawLocationId != null) {
    locationId = readLocationId(rawLocationId);
    if (locationId === undefined) return badRequest('Invalid location_id.');
  }
  if (sort !== 'created_at' && sort !== 'location') {
    return badRequest('Unsupported sort.');
  }
  if (sort === 'location' && rawLocationId == null && rawPath == null) {
    return badRequest('sort=location requires location_id or location_path.');
  }
  const paging = readPaging(params, 3500);
  if (paging === null) return badRequest('Invalid limit or offset.');

  if (rawPath != null) {
    const path = normalizePath(rawPath);
    locationId = ROWS.find(({ result }) => result.path === path)?.result
      .location_id;
    // Unknown values return no feed.
    if (locationId == undefined) {
      return { status: 200, body: { total: 0, results: [] } };
    }
  }

  const scoped =
    locationId == undefined
      ? MOCK_FEEDS
      : ROWS_BY_ID.has(locationId)
        ? feedsIn(locationId)
        : [];
  const sorted = [...scoped].sort((a, b) =>
    sort === 'location' && locationId != undefined
      ? shareIn(b, locationId) - shareIn(a, locationId) ||
        (a.feed.provider ?? '').localeCompare(b.feed.provider ?? '') ||
        (a.feed.feed_name ?? '').localeCompare(b.feed.feed_name ?? '') ||
        a.feed.id.localeCompare(b.feed.id)
      : // Newest first: the mock ids grow with the creation order.
        b.feed.id.localeCompare(a.feed.id),
  );
  return {
    status: 200,
    body: {
      total: sorted.length,
      results: sorted
        .slice(paging.offset, paging.offset + paging.limit)
        .map(({ feed }) => feed),
    },
  };
}
