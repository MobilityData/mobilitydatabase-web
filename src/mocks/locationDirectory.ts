/**
 * Mock data and logic for the location directory endpoints:
 *   GET /v1/locations (continents and geopolygon locations)
 *   GET /v1/search with `continent` / `location_id` (the feeds of a location)
 *
 * Locations form a tree of variable depth (Los Angeles sits under a county,
 * San Francisco directly under California). Feed counts, `has_feeds` and the
 * `sort=location` relevance are derived from MOCK_FEEDS' stop locations, so
 * the mock behaves like the API: a feed counts once per location, sub-areas
 * included. Location ids, feed ids, URLs and names are fictional mock data.
 */
import type { components } from '../app/services/feeds/types';

type Feed = components['schemas']['SearchFeedItemResult'];
type LocationResult = components['schemas']['LocationSearchResult'];
type FeedCounts = components['schemas']['LocationFeedCounts'];
type LocationsResponse = components['schemas']['LocationSearchResponse'];
interface FeedsResponse {
  total: number;
  results: Feed[];
}

interface Continent {
  slug: string;
  code: string;
  name: string;
}

const CONTINENTS: Continent[] = [
  { slug: 'africa', code: 'AF', name: 'Africa' },
  { slug: 'antarctica', code: 'AN', name: 'Antarctica' },
  { slug: 'europe', code: 'EU', name: 'Europe' },
  { slug: 'north-america', code: 'NA', name: 'North America' },
  { slug: 'oceania', code: 'OC', name: 'Oceania' },
];

type PlaceType = 'country' | 'subdivision' | 'municipality';

interface Place {
  id: number;
  parent: number | null;
  type: PlaceType;
  name: string;
  /** ISO 3166-1 (countries) or ISO 3166-2 (subdivisions) code. */
  code?: string;
  /** Countries only. */
  continent?: string;
}

const country = (
  id: number,
  name: string,
  code: string,
  continent: string,
): Place => ({ id, parent: null, type: 'country', name, code, continent });
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
  country(100, 'Canada', 'CA', 'north-america'),
  subdivision(110, 100, 'Québec', 'CA-QC'),
  municipality(111, 110, 'Montréal'),
  municipality(112, 110, 'Laval'),
  municipality(113, 110, 'Longueuil'),
  municipality(114, 110, 'Québec'),
  subdivision(120, 100, 'Ontario', 'CA-ON'),
  municipality(121, 120, 'Toronto'),
  subdivision(130, 100, 'British Columbia', 'CA-BC'),
  municipality(131, 130, 'Vancouver'),
  country(200, 'United States', 'US', 'north-america'),
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
  country(300, 'France', 'FR', 'europe'),
  subdivision(310, 300, 'Île-de-France', 'FR-IDF'),
  municipality(311, 310, 'Paris'),
  country(400, 'Germany', 'DE', 'europe'),
  subdivision(410, 400, 'Berlin', 'DE-BE'),
  municipality(411, 410, 'Berlin'),
  country(500, 'Australia', 'AU', 'oceania'),
  subdivision(510, 500, 'New South Wales', 'AU-NSW'),
  municipality(511, 510, 'Sydney'),
  country(600, 'South Africa', 'ZA', 'africa'),
  subdivision(610, 600, 'Western Cape', 'ZA-WC'),
  municipality(611, 610, 'Cape Town'),
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

/** The place and its ancestors, from the country down. */
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

function continentOf(place: Place): Continent | undefined {
  const slug = chainOf(place)[0].continent;
  return CONTINENTS.find((continent) => continent.slug === slug);
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
];

interface MockFeed {
  feed: Feed;
  stopPlaces: number[];
}

function declaredLocation(
  placeId: number,
): NonNullable<Feed['locations']>[number] {
  const chain = chainOf(PLACES_BY_ID.get(placeId) as Place);
  const municipalities = chain.filter(({ type }) => type === 'municipality');
  return {
    country_code: chain[0].code,
    country: chain[0].name,
    subdivision_name: chain.find(({ type }) => type === 'subdivision')?.name,
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

/** Where to look for feeds: a continent slug and/or a location id. */
interface FeedScope {
  continent?: string;
  locationId?: number;
}

/** Share of a feed's stop groups inside the scope, 0 when outside. */
function shareIn({ stopPlaces }: MockFeed, scope: FeedScope): number {
  const inside = stopPlaces.filter((placeId) => {
    const place = PLACES_BY_ID.get(placeId) as Place;
    if (
      scope.continent != undefined &&
      continentOf(place)?.slug !== scope.continent
    ) {
      return false;
    }
    return scope.locationId == undefined || isWithin(placeId, scope.locationId);
  });
  return inside.length / stopPlaces.length;
}

function feedsIn(scope: FeedScope): MockFeed[] {
  return MOCK_FEEDS.filter((feed) => shareIn(feed, scope) > 0);
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
  scope: FeedScope;
  depth: number;
}

function continentRow(continent: Continent): Row {
  return {
    depth: 0,
    scope: { continent: continent.slug },
    result: {
      location_id: null,
      parent_location_id: null,
      name: continent.name,
      alt_name: null,
      location_type: 'continent',
      continent_code: continent.code,
      continent_slug: continent.slug,
      continent_name: continent.name,
      slug: continent.slug,
      path_slugs: [],
      path_names: [],
      country_name: null,
      country_code: null,
      subdivision_name: null,
      subdivision_code: null,
      display_name: continent.name,
    },
  };
}

function placeRow(place: Place): Row {
  const chain = chainOf(place);
  const continent = continentOf(place);
  const placeSubdivision = chain.find(({ type }) => type === 'subdivision');
  return {
    depth: chain.length,
    scope: { locationId: place.id },
    result: {
      location_id: place.id,
      parent_location_id: place.parent,
      name: place.name,
      alt_name: null,
      location_type: place.type,
      continent_code: continent?.code ?? null,
      continent_slug: continent?.slug ?? null,
      continent_name: continent?.name ?? null,
      slug: slugOf(place),
      path_slugs: chain.map(slugOf),
      path_names: chain.map(({ name }) => name),
      country_name: chain[0].name,
      country_code: chain[0].code ?? null,
      subdivision_name: placeSubdivision?.name ?? null,
      subdivision_code: placeSubdivision?.code ?? null,
      display_name: chain.map(({ name }) => name).join(', '),
    },
  };
}

const ROWS: Row[] = [
  ...CONTINENTS.map(continentRow),
  ...MOCK_PLACES.map(placeRow),
];

export type MockResult<T> =
  | { status: 200; body: T }
  | { status: 400; body: { detail: string } };

const badRequest = (detail: string): MockResult<never> => ({
  status: 400,
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

function readContinent(params: URLSearchParams): string | undefined {
  const value = params.get('continent')?.toLowerCase();
  if (value == undefined || value === '') return undefined;
  // Slug or code, case-insensitive; unknown values match nothing.
  return (
    CONTINENTS.find(({ slug, code }) =>
      [slug, code.toLowerCase()].includes(value),
    )?.slug ?? `unknown:${value}`
  );
}

const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** GET /v1/locations */
export function getMockLocations(
  params: URLSearchParams,
): MockResult<LocationsResponse> {
  const sort = params.get('sort') ?? 'admin_level';
  if (sort !== 'admin_level' && sort !== 'feed_count') {
    return badRequest('Unsupported sort.');
  }
  const paging = readPaging(params, 100);
  if (paging === null) return badRequest('Invalid limit or offset.');

  const locationType = params.get('location_type');
  const continent = readContinent(params);
  const parentId = params.get('parent_location_id');
  const path = params.get('path')?.toLowerCase();
  const countryCode = params.get('country_code')?.toUpperCase();
  const subdivisionCode = params.get('subdivision_code')?.toUpperCase();
  const words = normalize(params.get('search_query') ?? '')
    .split(/\s+/)
    .filter((word) => word !== '');
  const hasFeeds = params.get('has_feeds') === 'true';
  const includeCounts = params.get('include_feed_counts') === 'true';

  const rows = ROWS.map((row) => ({
    row,
    counts: countFeeds(feedsIn(row.scope)),
  })).filter(({ row: { result }, counts }) => {
    if (locationType != null && result.location_type !== locationType)
      return false;
    if (continent != undefined && result.continent_slug !== continent)
      return false;
    if (parentId != null && String(result.parent_location_id) !== parentId)
      return false;
    if (path != undefined && (result.path_slugs ?? []).join('/') !== path)
      return false;
    if (countryCode != undefined && result.country_code !== countryCode)
      return false;
    if (
      subdivisionCode != undefined &&
      result.subdivision_code !== subdivisionCode
    )
      return false;
    const haystack = normalize(result.display_name ?? '');
    if (!words.every((word) => haystack.includes(word))) return false;
    return !hasFeeds || (counts.total ?? 0) > 0;
  });

  rows.sort(
    (a, b) =>
      (sort === 'feed_count'
        ? (b.counts.total ?? 0) - (a.counts.total ?? 0)
        : a.row.depth - b.row.depth) ||
      (a.row.result.display_name ?? '').localeCompare(
        b.row.result.display_name ?? '',
      ),
  );

  return {
    status: 200,
    body: {
      total: rows.length,
      results: rows
        .slice(paging.offset, paging.offset + paging.limit)
        .map(({ row, counts }) =>
          includeCounts ? { ...row.result, feed_counts: counts } : row.result,
        ),
    },
  };
}

/** True when a /v1/search request targets a location. */
export function isLocationSearch(params: URLSearchParams): boolean {
  return (
    params.has('continent') ||
    params.has('location_id') ||
    params.get('sort') === 'location'
  );
}

/** GET /v1/search with `continent` and/or `location_id`. */
export function getMockLocationFeeds(
  params: URLSearchParams,
): MockResult<FeedsResponse> {
  const sort = params.get('sort') ?? 'created_at';
  const continent = readContinent(params);
  const rawLocationId = params.get('location_id');
  const locationId = rawLocationId == null ? undefined : Number(rawLocationId);
  if (locationId != undefined && !Number.isInteger(locationId)) {
    return badRequest('Invalid location_id.');
  }
  if (sort !== 'created_at' && sort !== 'location') {
    return badRequest('Unsupported sort.');
  }
  if (
    sort === 'location' &&
    continent == undefined &&
    locationId == undefined
  ) {
    return badRequest('sort=location requires continent or location_id.');
  }
  const paging = readPaging(params, 3500);
  if (paging === null) return badRequest('Invalid limit or offset.');

  const scope: FeedScope = { continent, locationId };
  const sorted = feedsIn(scope).sort((a, b) =>
    sort === 'location'
      ? shareIn(b, scope) - shareIn(a, scope) ||
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
