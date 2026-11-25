import {
  buildBreadcrumbSteps,
  buildLocationHref,
  buildPlaceName,
  type ContinentInfo,
  fetchAllPages,
  fetchRemainingPages,
  filterByName,
  formatCount,
  getChildrenKind,
  getFeedCountEntries,
  getLocationName,
  getLocationSegments,
  getPageCount,
  getPageOffset,
  getTotalFeedCount,
  isSameSegments,
  type LocationResult,
  normalizeLocationName,
  parseLocationRequest,
  parsePageParam,
  sortByFeedCount,
  toContinentInfo,
} from './location-directory';

const northAmerica: LocationResult = {
  location_id: null,
  parent_location_id: null,
  location_type: 'continent',
  continent_code: 'NA',
  name: 'North America',
  slug: 'north-america',
  path_slugs: ['north-america'],
  path_names: ['North America'],
};

const CONTINENTS: ContinentInfo[] = [
  { code: 'EU', slug: 'europe', name: 'Europe' },
  { code: 'NA', slug: 'north-america', name: 'North America' },
];

// Variable depth: Montréal sits under an intermediate region.
const montreal: LocationResult = {
  location_id: 175905,
  parent_location_id: 161950,
  location_type: 'municipality',
  continent_code: 'NA',
  name: 'Montréal',
  slug: '175905-montreal',
  path_slugs: [
    'ca',
    '61549-quebec',
    '161950-montreal-region',
    '175905-montreal',
  ],
  path_names: ['Canada', 'Québec', 'Montréal (region)', 'Montréal'],
};

const canada: LocationResult = {
  location_id: 1428125,
  parent_location_id: null,
  location_type: 'country',
  continent_code: 'NA',
  name: 'Canada',
  slug: 'ca',
  path_slugs: ['ca'],
  path_names: ['Canada'],
};

// A country without continent in the classification.
const clipperton: LocationResult = {
  location_id: 2,
  parent_location_id: null,
  location_type: 'country',
  continent_code: null,
  name: 'Clipperton',
  slug: 'cp',
  path_slugs: ['cp'],
  path_names: ['Clipperton'],
};

describe('parseLocationRequest', () => {
  it('is the root without segments', () => {
    expect(parseLocationRequest(undefined)).toEqual({
      kind: 'root',
      segments: [],
    });
    expect(parseLocationRequest([])).toEqual({ kind: 'root', segments: [] });
  });

  it('reads a continent from its slug', () => {
    expect(parseLocationRequest(['north-america'])).toEqual({
      kind: 'continent',
      segments: ['north-america'],
      continentSlug: 'north-america',
    });
  });

  it('reads a country from its code, with or without continent', () => {
    expect(parseLocationRequest(['north-america', 'ca'])).toEqual({
      kind: 'country',
      segments: ['north-america', 'ca'],
      countryCode: 'ca',
    });
    expect(parseLocationRequest(['cp'])).toEqual({
      kind: 'country',
      segments: ['cp'],
      countryCode: 'cp',
    });
  });

  it('reads a place from the id of its last segment, at any depth', () => {
    const segments = [
      'north-america',
      'ca',
      '61549-quebec',
      '161950-montreal-region',
      '175905-montreal',
    ];
    expect(parseLocationRequest(segments)).toEqual({
      kind: 'place',
      segments,
      locationId: 175905,
    });
    // The name part is only there to be read.
    expect(
      parseLocationRequest(['north-america', 'ca', '61549-old-name']),
    ).toMatchObject({ kind: 'place', locationId: 61549 });
    expect(parseLocationRequest(['asia', 'jp', '1234'])).toMatchObject({
      kind: 'place',
      locationId: 1234,
    });
  });

  it('decodes percent-encoded segments', () => {
    expect(
      parseLocationRequest([
        'asia',
        'jp',
        `1234-${encodeURIComponent('東京')}`,
      ]),
    ).toMatchObject({ kind: 'place', locationId: 1234 });
  });

  it.each([
    [['north-america', '']],
    [['north-america', ' ']],
    [['North-America']],
    [['north-america', 'CA']],
    [['north-america', 'canada']],
    [['north-america', 'ca', 'quebec']],
    [['north-america', 'ca', 'quebec', '175905-montreal']],
    [['north-america', 'ca', '0-nowhere']],
    [['north-america', 'ca', 'can ada']],
    [['north-america', 'ca', '61549-quebec.json']],
    [['north-america', 'ca', '%E0%A4%A']],
  ])('rejects malformed segments %p', (segments) => {
    expect(parseLocationRequest(segments)).toBeNull();
  });
});

describe('parsePageParam', () => {
  it('defaults to page 1 when absent', () => {
    expect(parsePageParam(undefined)).toBe(1);
  });

  it('accepts positive integers', () => {
    expect(parsePageParam('1')).toBe(1);
    expect(parsePageParam('2')).toBe(2);
    expect(parsePageParam('120')).toBe(120);
  });

  it.each(['', '0', '-1', '+2', '01', '1.5', '1e3', 'abc', ' 2', '2 '])(
    'rejects %p',
    (raw) => {
      expect(parsePageParam(raw)).toBeNull();
    },
  );

  it('rejects repeated params and unsafe integers', () => {
    expect(parsePageParam(['1', '2'])).toBeNull();
    expect(parsePageParam('99999999999999999999')).toBeNull();
  });
});

describe('pagination math', () => {
  it('computes the page count with a floor of 1', () => {
    expect(getPageCount(0)).toBe(1);
    expect(getPageCount(1)).toBe(1);
    expect(getPageCount(20)).toBe(1);
    expect(getPageCount(21)).toBe(2);
    expect(getPageCount(45, 10)).toBe(5);
  });

  it('computes the API offset of a 1-based page', () => {
    expect(getPageOffset(1)).toBe(0);
    expect(getPageOffset(2)).toBe(20);
    expect(getPageOffset(3, 10)).toBe(20);
  });
});

describe('buildLocationHref', () => {
  it('builds the root and nested paths', () => {
    expect(buildLocationHref([])).toBe('/locations');
    expect(buildLocationHref(['north-america', 'ca', '61549-quebec'])).toBe(
      '/locations/north-america/ca/61549-quebec',
    );
  });

  it('adds ?page only after the first page', () => {
    expect(buildLocationHref(['europe'], 1)).toBe('/locations/europe');
    expect(buildLocationHref(['europe'], 2)).toBe('/locations/europe?page=2');
    expect(buildLocationHref([], 3)).toBe('/locations?page=3');
  });

  it('encodes unsafe characters in segments', () => {
    expect(buildLocationHref(['a b', 'c/d'])).toBe('/locations/a%20b/c%2Fd');
  });
});

describe('location segments and names', () => {
  it('reads the continents of the API results', () => {
    expect(toContinentInfo([northAmerica, canada])).toEqual([
      { code: 'NA', slug: 'north-america', name: 'North America' },
    ]);
  });

  it('links a location through its continent and path slugs', () => {
    expect(getLocationSegments(montreal, CONTINENTS)).toEqual([
      'north-america',
      'ca',
      '61549-quebec',
      '161950-montreal-region',
      '175905-montreal',
    ]);
    expect(buildLocationHref(getLocationSegments(canada, CONTINENTS))).toBe(
      '/locations/north-america/ca',
    );
    expect(
      buildLocationHref(getLocationSegments(northAmerica, CONTINENTS)),
    ).toBe('/locations/north-america');
    expect(buildLocationHref(getLocationSegments(clipperton, CONTINENTS))).toBe(
      '/locations/cp',
    );
  });

  it('round-trips with URL parsing', () => {
    const segments = getLocationSegments(montreal, CONTINENTS);
    const href = buildLocationHref(segments, 2);
    expect(href).toBe(
      '/locations/north-america/ca/61549-quebec/161950-montreal-region/175905-montreal?page=2',
    );
    const parsed = parseLocationRequest(href.split('?')[0].split('/').slice(2));
    expect(parsed).toMatchObject({ kind: 'place', locationId: 175905 });
    expect(isSameSegments(parsed?.segments ?? [], segments)).toBe(true);
  });

  it('compares segment lists', () => {
    expect(isSameSegments(['europe', 'fr'], ['europe', 'fr'])).toBe(true);
    expect(isSameSegments(['asia', 'fr'], ['europe', 'fr'])).toBe(false);
    expect(isSameSegments(['europe'], ['europe', 'fr'])).toBe(false);
  });

  it('names a location, falling back to its slug', () => {
    expect(getLocationName(montreal)).toBe('Montréal');
    expect(getLocationName({ ...montreal, name: null })).toBe(
      '175905-montreal',
    );
    expect(getLocationName(northAmerica)).toBe('North America');
  });
});

describe('buildBreadcrumbSteps', () => {
  it('is empty at the root', () => {
    expect(buildBreadcrumbSteps(null, CONTINENTS)).toEqual([]);
  });

  it('has a single step on a continent', () => {
    expect(buildBreadcrumbSteps(northAmerica, CONTINENTS)).toEqual([
      { label: 'North America', segments: ['north-america'] },
    ]);
  });

  it('starts with the continent, then one step per path name', () => {
    expect(buildBreadcrumbSteps(montreal, CONTINENTS)).toEqual([
      { label: 'North America', segments: ['north-america'] },
      { label: 'Canada', segments: ['north-america', 'ca'] },
      {
        label: 'Québec',
        segments: ['north-america', 'ca', '61549-quebec'],
      },
      {
        label: 'Montréal (region)',
        segments: [
          'north-america',
          'ca',
          '61549-quebec',
          '161950-montreal-region',
        ],
      },
      {
        label: 'Montréal',
        segments: [
          'north-america',
          'ca',
          '61549-quebec',
          '161950-montreal-region',
          '175905-montreal',
        ],
      },
    ]);
  });

  it('starts at the country without continent', () => {
    expect(buildBreadcrumbSteps(clipperton, CONTINENTS)).toEqual([
      { label: 'Clipperton', segments: ['cp'] },
    ]);
  });

  it('ignores unaligned names', () => {
    const steps = buildBreadcrumbSteps(
      { ...canada, path_names: ['Canada', 'Extra'] },
      CONTINENTS,
    );
    expect(steps.map((step) => step.label)).toEqual([
      'North America',
      'Canada',
    ]);
  });
});

describe('buildPlaceName', () => {
  it('is empty at the root', () => {
    expect(buildPlaceName(null)).toBe('');
  });

  it('names a continent on its own', () => {
    expect(buildPlaceName(northAmerica)).toBe('North America');
  });

  it('lists the most specific place first, without the continent', () => {
    expect(buildPlaceName(canada)).toBe('Canada');
    expect(buildPlaceName(montreal)).toBe(
      'Montréal, Montréal (region), Québec, Canada',
    );
  });

  it('keeps the country of a location without continent', () => {
    expect(buildPlaceName(clipperton)).toBe('Clipperton');
  });

  it('falls back to the name without path names', () => {
    expect(buildPlaceName({ ...canada, path_names: [] })).toBe('Canada');
  });
});

describe('getChildrenKind', () => {
  it('lists continents at the root', () => {
    expect(getChildrenKind(null)).toBe('continents');
  });

  it('lists countries in a continent', () => {
    expect(getChildrenKind(northAmerica)).toBe('countries');
  });

  it('lists places below a country', () => {
    expect(getChildrenKind(canada)).toBe('places');
    expect(getChildrenKind(montreal)).toBe('places');
  });
});

describe('fetchAllPages', () => {
  const pageOf = (
    total: number,
    offset: number,
    limit: number,
  ): { total: number; results: number[] } => ({
    total,
    results: Array.from(
      { length: Math.max(0, Math.min(limit, total - offset)) },
      (_, index) => offset + index,
    ),
  });

  it('stops after the first page when it holds everything', async () => {
    const fetchPage = jest.fn(async (offset: number, limit: number) =>
      pageOf(42, offset, limit),
    );
    await expect(fetchAllPages(fetchPage)).resolves.toHaveLength(42);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(0, 100);
  });

  it('fetches the remaining pages in order', async () => {
    const fetchPage = jest.fn(async (offset: number, limit: number) =>
      pageOf(250, offset, limit),
    );
    const results = await fetchAllPages(fetchPage);
    expect(results).toEqual(Array.from({ length: 250 }, (_, index) => index));
    expect(fetchPage.mock.calls).toEqual([
      [0, 100],
      [100, 100],
      [200, 100],
    ]);
  });

  it('follows a server that returns fewer results than asked', async () => {
    const fetchPage = jest.fn(async (offset: number) => pageOf(25, offset, 10));
    await expect(fetchAllPages(fetchPage)).resolves.toHaveLength(25);
    expect(fetchPage.mock.calls.map(([offset]) => offset)).toEqual([0, 10, 20]);
  });

  it('completes a first page fetched elsewhere', async () => {
    const fetchPage = jest.fn(async (offset: number, limit: number) =>
      pageOf(230, offset, limit),
    );
    const results = await fetchRemainingPages(pageOf(230, 0, 100), fetchPage);
    expect(results).toEqual(Array.from({ length: 230 }, (_, index) => index));
    expect(fetchPage.mock.calls).toEqual([
      [100, 100],
      [200, 100],
    ]);
    await expect(
      fetchRemainingPages(pageOf(42, 0, 100), fetchPage),
    ).resolves.toHaveLength(42);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('handles empty and total-less responses', async () => {
    await expect(
      fetchAllPages(async () => ({ total: 0, results: [] })),
    ).resolves.toEqual([]);
    await expect(fetchAllPages(async () => ({}))).resolves.toEqual([]);
    await expect(
      fetchAllPages(async () => ({ results: [1, 2] })),
    ).resolves.toEqual([1, 2]);
  });
});

describe('feed counts', () => {
  it('lists GTFS, GTFS-RT and GBFS in order, defaulting to 0', () => {
    expect(getFeedCountEntries({ gtfs: 4, gbfs: 1 })).toEqual([
      { dataType: 'gtfs', count: 4 },
      { dataType: 'gtfs_rt', count: 0 },
      { dataType: 'gbfs', count: 1 },
    ]);
    expect(getFeedCountEntries(undefined).map((e) => e.count)).toEqual([
      0, 0, 0,
    ]);
  });

  it('prefers the distinct total over the per-type sum', () => {
    expect(getTotalFeedCount({ gtfs: 2, gtfs_rt: 2, gbfs: 1, total: 4 })).toBe(
      4,
    );
    expect(getTotalFeedCount({ gtfs: 2, gtfs_rt: 2, gbfs: 1 })).toBe(5);
    expect(getTotalFeedCount(undefined)).toBe(0);
  });

  it('formats counts for the locale', () => {
    expect(formatCount(1234, 'en')).toBe('1,234');
    expect(formatCount(undefined, 'en')).toBe('0');
    // fr groups with a narrow no-break space
    expect(formatCount(1234, 'fr').replace(/\s/g, ' ')).toBe('1 234');
  });
});

describe('normalizeLocationName', () => {
  it('drops accents and case', () => {
    expect(normalizeLocationName('  Québec ')).toBe('quebec');
    expect(normalizeLocationName('São Paulo')).toBe('sao paulo');
  });
});

describe('sortByFeedCount', () => {
  const item = (
    name: string,
    total: number,
  ): { name: string; counts: { total: number } } => ({
    name,
    counts: { total },
  });

  it('puts the most feeds first, then sorts by name', () => {
    const sorted = sortByFeedCount([
      item('Laval', 3),
      item('Montréal', 22),
      item('Québec', 3),
      item('Gatineau', 1),
      item('Lévis', 3),
    ]);
    expect(sorted.map(({ name }) => name)).toEqual([
      'Montréal',
      'Laval',
      'Lévis',
      'Québec',
      'Gatineau',
    ]);
  });

  it('does not mutate its input', () => {
    const items = [item('B', 1), item('A', 2)];
    sortByFeedCount(items);
    expect(items.map(({ name }) => name)).toEqual(['B', 'A']);
  });
});

describe('filterByName', () => {
  const items = [{ name: 'Montréal' }, { name: 'Québec' }, { name: 'Laval' }];

  it('matches anywhere in the name, ignoring accents and case', () => {
    expect(filterByName(items, 'MONTRE')).toEqual([{ name: 'Montréal' }]);
    expect(filterByName(items, 'bec')).toEqual([{ name: 'Québec' }]);
  });

  it('returns every item for a blank query', () => {
    expect(filterByName(items, '  ')).toEqual(items);
  });
});
