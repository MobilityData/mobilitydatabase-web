import {
  buildLocationHref,
  buildPlaceName,
  filterByName,
  formatCount,
  getBreadcrumbSlugs,
  getChildLevel,
  getFeedCountEntries,
  getPageCount,
  getPageOffset,
  getTotalFeedCount,
  normalizeLocationName,
  type LocationDirectoryNode,
  parseLocationSegments,
  parsePageParam,
  sortByFeedCount,
} from './location-directory';

const breadcrumb: LocationDirectoryNode[] = [
  {
    level: 'continent',
    slug: 'north-america',
    code: 'NA',
    name: 'North America',
  },
  { level: 'country', slug: 'canada', code: 'CA', name: 'Canada' },
  { level: 'subdivision', slug: 'quebec', code: null, name: 'Québec' },
  { level: 'municipality', slug: 'montreal', code: null, name: 'Montréal' },
];

describe('parseLocationSegments', () => {
  it('returns an empty query at the root', () => {
    expect(parseLocationSegments(undefined)).toEqual({});
    expect(parseLocationSegments([])).toEqual({});
  });

  it('maps each segment to its API parameter, untouched', () => {
    expect(parseLocationSegments(['north-america'])).toEqual({
      continent: 'north-america',
    });
    expect(
      parseLocationSegments(['north-america', 'canada', 'quebec', 'montreal']),
    ).toEqual({
      continent: 'north-america',
      country: 'canada',
      subdivision: 'quebec',
      municipality: 'montreal',
    });
  });

  it('rejects paths deeper than a municipality', () => {
    expect(
      parseLocationSegments([
        'north-america',
        'canada',
        'quebec',
        'montreal',
        'x',
      ]),
    ).toBeNull();
  });

  it('rejects empty segments', () => {
    expect(parseLocationSegments(['north-america', ' '])).toBeNull();
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

  it('round-trips with the breadcrumb slugs', () => {
    expect(buildLocationHref(getBreadcrumbSlugs(breadcrumb), 2)).toBe(
      '/locations/north-america/canada/quebec/montreal?page=2',
    );
    expect(getBreadcrumbSlugs(undefined)).toEqual([]);
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

describe('getChildLevel', () => {
  it('walks one level down and stops at municipalities', () => {
    expect(getChildLevel('root')).toBe('continent');
    expect(getChildLevel(undefined)).toBe('continent');
    expect(getChildLevel('continent')).toBe('country');
    expect(getChildLevel('country')).toBe('subdivision');
    expect(getChildLevel('subdivision')).toBe('municipality');
    expect(getChildLevel('municipality')).toBeNull();
  });
});

describe('buildPlaceName', () => {
  it('is empty at the root', () => {
    expect(buildPlaceName([])).toBe('');
    expect(buildPlaceName(undefined)).toBe('');
  });

  it('names a continent on its own', () => {
    expect(buildPlaceName(breadcrumb.slice(0, 1))).toBe('North America');
  });

  it('lists the most specific place first, without the continent', () => {
    expect(buildPlaceName(breadcrumb.slice(0, 2))).toBe('Canada');
    expect(buildPlaceName(breadcrumb)).toBe('Montréal, Québec, Canada');
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
