/**
 * Mock data and logic for the location directory endpoints:
 *   GET /v1/locations/directory
 *   GET /v1/locations/directory/feeds
 *
 * The directory tree, the rolled-up counts, the breadcrumb and the children
 * are all derived from MOCK_FEEDS' declared locations, so the mock behaves
 * like the API: a feed counts once per node, 400 on a broken hierarchy, 404
 * when nothing is located there, feeds sorted by relevance to the node.
 * Feed ids, URLs and names are fictional mock data.
 */
import type { components } from '../app/services/feeds/types';

type Feed = components['schemas']['SearchFeedItemResult'];
type DirectoryNode = components['schemas']['LocationDirectoryNode'];
type DirectoryLevel = components['schemas']['LocationDirectoryLevel'];
type FeedCounts = components['schemas']['LocationDirectoryFeedCounts'];
type DirectoryResponse = components['schemas']['LocationDirectoryResponse'];
type FeedsResponse = components['schemas']['LocationDirectoryFeedsResponse'];

const CONTINENTS: Record<string, { code: string; name: string }> = {
  africa: { code: 'AF', name: 'Africa' },
  europe: { code: 'EU', name: 'Europe' },
  'north-america': { code: 'NA', name: 'North America' },
  oceania: { code: 'OC', name: 'Oceania' },
};

const COUNTRIES: Record<string, { name: string; continent: string }> = {
  AU: { name: 'Australia', continent: 'oceania' },
  CA: { name: 'Canada', continent: 'north-america' },
  DE: { name: 'Germany', continent: 'europe' },
  FR: { name: 'France', continent: 'europe' },
  US: { name: 'United States', continent: 'north-america' },
  ZA: { name: 'South Africa', continent: 'africa' },
};

/** Same slug rule as the API: `Québec` -> `quebec`. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type Place = [countryCode: string, subdivision?: string, municipality?: string];
type FeedSeed = [
  dataType: Feed['data_type'],
  provider: string,
  feedName: string,
  places: Place[],
];

const MONTREAL: Place = ['CA', 'Québec', 'Montréal'];
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
  ['gtfs', 'Example Intercity Rail', 'National rail network', [['CA']]],
  // Québec (subdivision level only)
  ['gtfs', 'Example Coach Lines', 'Intercity coaches', [['CA', 'Québec']]],
  ['gtfs_rt', 'Example Coach Lines', 'Trip updates', [['CA', 'Québec']]],
  // Montréal: more than one page of feeds
  ['gtfs', 'Société de transport de Montréal', 'Bus and metro', [MONTREAL]],
  ['gtfs_rt', 'Société de transport de Montréal', 'Trip updates', [MONTREAL]],
  ['gtfs_rt', 'Société de transport de Montréal', 'Alerts', [MONTREAL]],
  ['gtfs', 'Réseau express métropolitain', 'REM light metro', [MONTREAL]],
  [
    'gtfs',
    'exo',
    'Commuter trains',
    [MONTREAL, ['CA', 'Québec', 'Laval'], ['CA', 'Québec', 'Longueuil']],
  ],
  ['gtfs_rt', 'exo', 'Commuter trains - trip updates', [MONTREAL]],
  ...EXO_SECTORS.map(
    (sector): FeedSeed => ['gtfs', 'exo', `Buses - ${sector}`, [MONTREAL]],
  ),
  ['gbfs', 'BIXI Montréal', 'Bike share', [MONTREAL]],
  ['gbfs', 'Example Scooters', 'Montréal e-scooters', [MONTREAL]],
  ['gbfs', 'Example Car Share', 'Montréal car share', [MONTREAL]],
  ['gtfs_rt', 'exo', 'Commuter trains - vehicle positions', [MONTREAL]],
  // Elsewhere in Québec
  [
    'gtfs',
    'Société de transport de Laval',
    'Buses',
    [['CA', 'Québec', 'Laval']],
  ],
  [
    'gtfs',
    'Réseau de transport de Longueuil',
    'Buses',
    [['CA', 'Québec', 'Longueuil']],
  ],
  [
    'gtfs',
    'Réseau de transport de la Capitale',
    'Buses',
    [['CA', 'Québec', 'Québec']],
  ],
  [
    'gtfs_rt',
    'Réseau de transport de la Capitale',
    'Vehicle positions',
    [['CA', 'Québec', 'Québec']],
  ],
  // Ontario
  [
    'gtfs',
    'Example Regional Transit',
    'Regional rail and buses',
    [['CA', 'Ontario']],
  ],
  [
    'gtfs',
    'Toronto Transit Commission',
    'Surface and subway',
    [['CA', 'Ontario', 'Toronto']],
  ],
  [
    'gtfs_rt',
    'Toronto Transit Commission',
    'Trip updates',
    [['CA', 'Ontario', 'Toronto']],
  ],
  ['gbfs', 'Bike Share Toronto', 'Bike share', [['CA', 'Ontario', 'Toronto']]],
  // British Columbia
  [
    'gtfs',
    'Example Coast Transit',
    'Buses and SkyTrain',
    [['CA', 'British Columbia', 'Vancouver']],
  ],
  // United States
  [
    'gtfs',
    'Example Metro Los Angeles',
    'Bus',
    [['US', 'California', 'Los Angeles']],
  ],
  [
    'gtfs',
    'Example Bay Area Rail',
    'Rapid transit',
    [
      ['US', 'California', 'San Francisco'],
      ['US', 'California', 'Oakland'],
    ],
  ],
  [
    'gtfs_rt',
    'Example Bay Area Rail',
    'Trip updates',
    [['US', 'California', 'San Francisco']],
  ],
  [
    'gbfs',
    'Example Bikes SF',
    'Bike share',
    [['US', 'California', 'San Francisco']],
  ],
  [
    'gtfs',
    'Example Metropolitan Transit',
    'Subway',
    [['US', 'New York', 'New York']],
  ],
  [
    'gtfs_rt',
    'Example Metropolitan Transit',
    'Subway trip updates',
    [['US', 'New York', 'New York']],
  ],
  // Europe
  [
    'gtfs',
    'Example Île-de-France Mobilités',
    'Regional network',
    [['FR', 'Île-de-France', 'Paris']],
  ],
  [
    'gbfs',
    'Example Vélo Paris',
    'Bike share',
    [['FR', 'Île-de-France', 'Paris']],
  ],
  [
    'gtfs',
    'Example Verkehrsverbund Berlin',
    'Regional network',
    [['DE', 'Berlin', 'Berlin']],
  ],
  // Oceania
  [
    'gtfs',
    'Example Transport NSW',
    'Sydney network',
    [['AU', 'New South Wales', 'Sydney']],
  ],
  [
    'gtfs_rt',
    'Example Transport NSW',
    'Trip updates',
    [['AU', 'New South Wales', 'Sydney']],
  ],
  // Africa
  [
    'gtfs',
    'Example Cape Town Bus',
    'Bus rapid transit',
    [['ZA', 'Western Cape', 'Cape Town']],
  ],
];

function toFeed(
  [dataType, provider, feedName, places]: FeedSeed,
  index: number,
): Feed {
  const id = `mock-loc-${String(index + 1).padStart(3, '0')}`;
  return {
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
    locations: places.map(([countryCode, subdivision, municipality]) => ({
      country_code: countryCode,
      country: COUNTRIES[countryCode].name,
      subdivision_name: subdivision,
      municipality,
    })),
    entity_types: dataType === 'gtfs_rt' ? ['tu', 'vp'] : undefined,
    versions: dataType === 'gbfs' ? ['2.3'] : undefined,
  };
}

export const MOCK_FEEDS: Feed[] = FEED_SEEDS.map(toFeed);

export interface DirectoryQuery {
  continent?: string;
  country_code?: string;
  subdivision?: string;
  municipality?: string;
}

type FeedLocation = NonNullable<Feed['locations']>[number];

/** Depth of a declared location: 1 country, 2 subdivision, 3 municipality. */
function locationDepth(location: FeedLocation): number {
  if (location.municipality != undefined) return 3;
  if (location.subdivision_name != undefined) return 2;
  return 1;
}

function matches(location: FeedLocation, query: DirectoryQuery): boolean {
  const country = COUNTRIES[location.country_code ?? ''];
  if (country == undefined) return false;
  if (query.continent != undefined && country.continent !== query.continent)
    return false;
  if (
    query.country_code != undefined &&
    location.country_code?.toLowerCase() !== query.country_code.toLowerCase()
  )
    return false;
  if (
    query.subdivision != undefined &&
    slugify(location.subdivision_name ?? '') !== query.subdivision
  )
    return false;
  if (
    query.municipality != undefined &&
    slugify(location.municipality ?? '') !== query.municipality
  )
    return false;
  return true;
}

function feedsIn(query: DirectoryQuery): Feed[] {
  return MOCK_FEEDS.filter((feed) =>
    (feed.locations ?? []).some((location) => matches(location, query)),
  );
}

function countFeeds(feeds: Feed[]): FeedCounts {
  return {
    gtfs: feeds.filter((feed) => feed.data_type === 'gtfs').length,
    gtfs_rt: feeds.filter((feed) => feed.data_type === 'gtfs_rt').length,
    gbfs: feeds.filter((feed) => feed.data_type === 'gbfs').length,
    total: feeds.length,
  };
}

function levelOf(query: DirectoryQuery): DirectoryLevel {
  if (query.municipality != undefined) return 'municipality';
  if (query.subdivision != undefined) return 'subdivision';
  if (query.country_code != undefined) return 'country';
  if (query.continent != undefined) return 'continent';
  return 'root';
}

/** 400 when a parameter is missing its parent or the country is elsewhere. */
function isValidHierarchy(query: DirectoryQuery): boolean {
  if (query.country_code != undefined && query.continent == undefined)
    return false;
  if (query.subdivision != undefined && query.country_code == undefined)
    return false;
  if (query.municipality != undefined && query.subdivision == undefined)
    return false;
  if (query.country_code != undefined) {
    const country = COUNTRIES[query.country_code.toUpperCase()];
    if (country != undefined && country.continent !== query.continent)
      return false;
  }
  return true;
}

function makeNode(
  level: DirectoryLevel,
  slug: string,
  code: string | null,
  name: string,
  query: DirectoryQuery,
): DirectoryNode {
  return {
    level,
    slug,
    code,
    name,
    feed_counts: countFeeds(feedsIn(query)),
  };
}

function nodeFor(
  query: DirectoryQuery,
  displayName?: string,
): DirectoryNode | undefined {
  const level = levelOf(query);
  switch (level) {
    case 'continent': {
      const slug = query.continent ?? '';
      const continent = CONTINENTS[slug];
      return continent == undefined
        ? undefined
        : makeNode(level, slug, continent.code, continent.name, query);
    }
    case 'country': {
      const code = (query.country_code ?? '').toUpperCase();
      const country = COUNTRIES[code];
      return country == undefined
        ? undefined
        : makeNode(level, code.toLowerCase(), code, country.name, query);
    }
    case 'subdivision':
      return makeNode(
        level,
        query.subdivision ?? '',
        null,
        displayName ?? query.subdivision ?? '',
        query,
      );
    case 'municipality':
      return makeNode(
        level,
        query.municipality ?? '',
        null,
        displayName ?? query.municipality ?? '',
        query,
      );
    default:
      return undefined;
  }
}

/** Original (accented) names of a subdivision/municipality, by slug. */
function displayNameOf(
  feeds: Feed[],
  field: 'subdivision_name' | 'municipality',
  slug: string,
): string | undefined {
  for (const feed of feeds) {
    for (const location of feed.locations ?? []) {
      const value = location[field];
      if (value != undefined && slugify(value) === slug) return value;
    }
  }
  return undefined;
}

function childrenOf(query: DirectoryQuery): DirectoryNode[] {
  const level = levelOf(query);
  const children = new Map<string, DirectoryNode>();
  for (const feed of feedsIn(query)) {
    for (const location of feed.locations ?? []) {
      if (!matches(location, query)) continue;
      const countryCode = location.country_code ?? '';
      let childQuery: DirectoryQuery | undefined;
      let name: string | undefined;
      if (level === 'root') {
        childQuery = { continent: COUNTRIES[countryCode].continent };
      } else if (level === 'continent') {
        childQuery = { ...query, country_code: countryCode.toLowerCase() };
      } else if (level === 'country' && location.subdivision_name != null) {
        name = location.subdivision_name;
        childQuery = { ...query, subdivision: slugify(name) };
      } else if (level === 'subdivision' && location.municipality != null) {
        name = location.municipality;
        childQuery = { ...query, municipality: slugify(name) };
      }
      if (childQuery == undefined) continue;
      const key = JSON.stringify(childQuery);
      if (!children.has(key)) {
        const node = nodeFor(childQuery, name);
        if (node != undefined) children.set(key, node);
      }
    }
  }
  return [...children.values()].sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? ''),
  );
}

function breadcrumbOf(query: DirectoryQuery): DirectoryNode[] {
  const all = feedsIn(query);
  const steps: DirectoryQuery[] = [];
  if (query.continent != undefined) steps.push({ continent: query.continent });
  if (query.country_code != undefined)
    steps.push({ ...steps[0], country_code: query.country_code });
  if (query.subdivision != undefined)
    steps.push({ ...steps[1], subdivision: query.subdivision });
  if (query.municipality != undefined)
    steps.push({ ...steps[2], municipality: query.municipality });
  return steps.flatMap((step) => {
    const level = levelOf(step);
    const name =
      level === 'subdivision'
        ? displayNameOf(all, 'subdivision_name', step.subdivision ?? '')
        : level === 'municipality'
          ? displayNameOf(all, 'municipality', step.municipality ?? '')
          : undefined;
    const node = nodeFor(step, name);
    return node == undefined ? [] : [node];
  });
}

export type MockResult<T> =
  | { status: 200; body: T }
  | { status: 400 | 404; body: { detail: string } };

export function readDirectoryQuery(params: URLSearchParams): DirectoryQuery {
  const read = (key: string): string | undefined => {
    const value = params.get(key);
    return value == null || value === '' ? undefined : value;
  };
  return {
    continent: read('continent'),
    country_code: read('country_code'),
    subdivision: read('subdivision'),
    municipality: read('municipality'),
  };
}

export function getMockDirectory(
  query: DirectoryQuery,
): MockResult<DirectoryResponse> {
  if (!isValidHierarchy(query)) {
    return { status: 400, body: { detail: 'Invalid location hierarchy.' } };
  }
  const feeds = feedsIn(query);
  if (feeds.length === 0) {
    return { status: 404, body: { detail: 'No feed located there.' } };
  }
  return {
    status: 200,
    body: {
      level: levelOf(query),
      breadcrumb: breadcrumbOf(query),
      feed_counts: countFeeds(feeds),
      children: childrenOf(query),
    },
  };
}

export function getMockDirectoryFeeds(
  query: DirectoryQuery,
  limit: number,
  offset: number,
): MockResult<FeedsResponse> {
  if (!isValidHierarchy(query)) {
    return { status: 400, body: { detail: 'Invalid location hierarchy.' } };
  }
  const relevance = (feed: Feed): number =>
    Math.max(
      ...(feed.locations ?? [])
        .filter((location) => matches(location, query))
        .map(locationDepth),
    );
  const sorted = feedsIn(query).sort(
    (a, b) =>
      relevance(a) - relevance(b) ||
      (a.provider ?? '').localeCompare(b.provider ?? '') ||
      (a.feed_name ?? '').localeCompare(b.feed_name ?? '') ||
      a.id.localeCompare(b.id),
  );
  return {
    status: 200,
    body: {
      total: sorted.length,
      results: sorted.slice(offset, offset + limit),
    },
  };
}
