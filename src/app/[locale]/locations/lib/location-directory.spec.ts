import {
  buildBreadcrumbSteps,
  buildLocationHref,
  buildPlaceName,
  fetchAllPages,
  filterByName,
  formatCount,
  getContinentSlug,
  getFeedCountEntries,
  getLocationName,
  getLocationSegments,
  getPageCount,
  getPageOffset,
  getTotalFeedCount,
  isLocationAtPath,
  type LocationResult,
  normalizeLocationName,
  parseLocationSegments,
  parsePageParam,
  sortByFeedCount,
} from './location-directory';

const northAmerica: LocationResult = {
  location_id: null,
  parent_location_id: null,
  location_type: 'continent',
  name: 'North America',
  slug: 'north-america',
  continent_slug: 'north-america',
  continent_name: 'North America',
  path_slugs: [],
  path_names: [],
};

// Variable depth: Montréal sits under an intermediate region.
const montreal: LocationResult = {
  location_id: 175905,
  parent_location_id: 161950,
  location_type: 'municipality',
  name: 'Montréal',
  slug: 'montreal',
  continent_slug: 'north-america',
  continent_name: 'North America',
  path_slugs: ['canada', 'quebec', 'montreal-region', 'montreal'],
  path_names: ['Canada', 'Québec', 'Montréal (region)', 'Montréal'],
};

const canada: LocationResult = {
  location_id: 1,
  parent_location_id: null,
  location_type: 'country',
  name: 'Canada',
  slug: 'canada',
  continent_slug: 'north-america',
  continent_name: 'North America',
  path_slugs: ['canada'],
  path_names: ['Canada'],
};

describe('parseLocationSegments', () => {
  it('returns an empty path at the root', () => {
    expect(parseLocationSegments(undefined)).toEqual({ path: [] });
    expect(parseLocationSegments([])).toEqual({ path: [] });
  });

  it('splits the continent from the path slugs, at any depth', () => {
    expect(parseLocationSegments(['north-america'])).toEqual({
      continent: 'north-america',
      path: [],
    });
    expect(parseLocationSegments(['north-america', 'canada'])).toEqual({
      continent: 'north-america',
      path: ['canada'],
    });
    const deep = ['canada', 'quebec', 'montreal-region', 'montreal', 'a', 'b'];
    expect(parseLocationSegments(['north-america', ...deep])).toEqual({
      continent: 'north-america',
      path: deep,
    });
  });

  it('accepts collision suffixes and non-Latin lowercase slugs', () => {
    expect(
      parseLocationSegments([
        'north-america',
        'united-states',
        'ohio',
        'washington-township-123456',
      ])?.path,
    ).toEqual(['united-states', 'ohio', 'washington-township-123456']);
    expect(parseLocationSegments(['asia', '東京'])?.path).toEqual(['東京']);
  });

  it('decodes percent-encoded segments', () => {
    expect(
      parseLocationSegments(['asia', encodeURIComponent('東京')])?.path,
    ).toEqual(['東京']);
  });

  it.each([
    [['north-america', '']],
    [['north-america', ' ']],
    [['North-America']],
    [['north-america', 'Canada']],
    [['north-america', 'can ada']],
    [['north-america', 'can%20ada']],
    [['north-america', 'canada.json']],
    [['north-america', '%E0%A4%A']],
  ])('rejects malformed segments %p', (segments) => {
    expect(parseLocationSegments(segments)).toBeNull();
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
    expect(
      buildLocationHref(['north-america', 'canada', 'quebec', 'montreal']),
    ).toBe('/locations/north-america/canada/quebec/montreal');
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
  it('links a location through its path slugs under the continent', () => {
    expect(getLocationSegments('north-america', montreal)).toEqual([
      'north-america',
      'canada',
      'quebec',
      'montreal-region',
      'montreal',
    ]);
    expect(
      buildLocationHref(getLocationSegments('north-america', canada)),
    ).toBe('/locations/north-america/canada');
  });

  it('links a continent through its own slug', () => {
    expect(getLocationSegments('', northAmerica)).toEqual(['north-america']);
    expect(getContinentSlug({ ...northAmerica, continent_slug: null })).toBe(
      'north-america',
    );
  });

  it('round-trips with URL parsing', () => {
    const href = buildLocationHref(
      getLocationSegments('north-america', montreal),
      2,
    );
    expect(href).toBe(
      '/locations/north-america/canada/quebec/montreal-region/montreal?page=2',
    );
    const segments = href.split('?')[0].split('/').slice(2);
    const parsed = parseLocationSegments(segments);
    expect(parsed).toEqual({
      continent: 'north-america',
      path: montreal.path_slugs,
    });
    expect(
      isLocationAtPath(montreal, 'north-america', parsed?.path ?? []),
    ).toBe(true);
  });

  it('checks the result is the requested location', () => {
    expect(isLocationAtPath(canada, 'north-america', ['canada'])).toBe(true);
    // The API also accepts continent codes: only the slug is canonical.
    expect(isLocationAtPath(canada, 'na', ['canada'])).toBe(false);
    expect(isLocationAtPath(canada, 'north-america', ['mexico'])).toBe(false);
  });

  it('names a location, falling back to its slug', () => {
    expect(getLocationName(montreal)).toBe('Montréal');
    expect(getLocationName({ ...montreal, name: null })).toBe('montreal');
    expect(getLocationName({ ...northAmerica, name: null })).toBe(
      'North America',
    );
  });
});

describe('buildBreadcrumbSteps', () => {
  it('is empty at the root', () => {
    expect(buildBreadcrumbSteps('', null)).toEqual([]);
  });

  it('has a single step on a continent', () => {
    expect(buildBreadcrumbSteps('north-america', northAmerica)).toEqual([
      { label: 'North America', segments: ['north-america'] },
    ]);
  });

  it('adds one step per path name, linked by the path slug prefix', () => {
    expect(buildBreadcrumbSteps('north-america', montreal)).toEqual([
      { label: 'North America', segments: ['north-america'] },
      { label: 'Canada', segments: ['north-america', 'canada'] },
      { label: 'Québec', segments: ['north-america', 'canada', 'quebec'] },
      {
        label: 'Montréal (region)',
        segments: ['north-america', 'canada', 'quebec', 'montreal-region'],
      },
      {
        label: 'Montréal',
        segments: [
          'north-america',
          'canada',
          'quebec',
          'montreal-region',
          'montreal',
        ],
      },
    ]);
  });

  it('falls back to the continent slug and ignores unaligned names', () => {
    const steps = buildBreadcrumbSteps('north-america', {
      ...canada,
      continent_name: null,
      path_names: ['Canada', 'Extra'],
    });
    expect(steps.map((step) => step.label)).toEqual([
      'north-america',
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
