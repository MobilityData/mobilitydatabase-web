import {
  getMockLocationFeeds,
  getMockLocations,
  isLocationSearch,
  slugify,
} from './locationDirectory';

type Locations = ReturnType<typeof getMockLocations>;
type Feeds = ReturnType<typeof getMockLocationFeeds>;

function ok<T>(result: { status: number; body: unknown }, label: string): T {
  if (result.status !== 200) throw new Error(`expected 200 for ${label}`);
  return result.body as T;
}

type LocationsBody = Extract<Locations, { status: 200 }>['body'];
type FeedsBody = Extract<Feeds, { status: 200 }>['body'];

function locations(query: string): LocationsBody {
  return ok(getMockLocations(new URLSearchParams(query)), query);
}

function location(id: number, query: string = '') {
  const { results } = locations(`location_id=${id}&${query}`);
  expect(results).toHaveLength(1);
  return results[0];
}

function feeds(query: string): FeedsBody {
  return ok(getMockLocationFeeds(new URLSearchParams(query)), query);
}

describe('location directory mocks', () => {
  it('slugifies names like the API', () => {
    expect(slugify('Québec')).toBe('quebec');
    expect(slugify('Saint-Jean-sur-Richelieu')).toBe(
      'saint-jean-sur-richelieu',
    );
    expect(slugify('Île-de-France')).toBe('ile-de-france');
    expect(slugify('Montréal (région)')).toBe('montreal-region');
  });

  it('lists the continents, without location id, most feeds first', () => {
    const all = locations('location_type=continent&include=feed_counts');
    expect(all.total).toBe(7);
    const antarctica = all.results.find((row) => row.slug === 'antarctica');
    expect(antarctica).toMatchObject({
      location_id: null,
      parent_location_id: null,
      continent_code: 'AN',
      path_slugs: ['antarctica'],
      path_names: ['Antarctica'],
      feed_counts: { total: 0 },
    });

    const { results } = locations(
      'location_type=continent&has_feeds=true&include=feed_counts&sort=feed_count',
    );
    expect(results.map((row) => row.slug)).toEqual([
      'north-america',
      'europe',
      'oceania',
      'africa',
    ]);
  });

  it('starts every path at the country, with id-name slugs below it', () => {
    expect(location(110)).toMatchObject({
      parent_location_id: 100,
      continent_code: 'NA',
      slug: '110-quebec',
      path_slugs: ['ca', '110-quebec'],
      path_names: ['Canada', 'Québec'],
      display_name: 'Canada, Québec',
    });
    // A country has no parent: its continent is its continent_code.
    expect(location(100)).toMatchObject({
      parent_location_id: null,
      continent_code: 'NA',
      slug: 'ca',
      path_slugs: ['ca'],
    });
    expect(location(700)).toMatchObject({
      continent_code: null,
      path_slugs: ['cp'],
    });
  });

  it('lists children with parent_location_id and rolls counts up', () => {
    expect(location(111, 'include=feed_counts').feed_counts?.total).toBe(22);

    const quebec = location(110, 'include=feed_counts');
    expect(quebec.feed_counts?.total).toBeGreaterThan(22);
    const children = locations(
      'parent_location_id=110&include=feed_counts&has_feeds=true&sort=feed_count&limit=2',
    );
    expect(children.total).toBe(4);
    // Laval and Québec tie on 2 feeds: by display name.
    expect(children.results.map((row) => row.slug)).toEqual([
      '111-montreal',
      '112-laval',
    ]);
    expect(children.results[0].feed_counts?.total).toBe(22);
  });

  it('matches nothing for unknown ids', () => {
    expect(locations('location_id=42').total).toBe(0);
    expect(locations('parent_location_id=42').total).toBe(0);
    expect(locations('location_id=abc').total).toBe(0);
  });

  it('has a variable depth, and ids tell same-named siblings apart', () => {
    expect(location(212).path_names).toHaveLength(4);
    expect(location(214).path_slugs).toEqual([
      'us',
      '210-california',
      '214-san-francisco',
    ]);
    expect(
      locations('parent_location_id=230&has_feeds=true').results.map(
        (row) => row.slug,
      ),
    ).toEqual(['123456-washington-township', '123457-washington-township']);
  });

  it('pages results and rejects unsupported parameters', () => {
    const all = locations('parent_location_id=110');
    const second = locations('parent_location_id=110&limit=2&offset=2');
    expect(second.total).toBe(all.total);
    expect(second.results).toEqual(all.results.slice(2, 4));
    expect(all.results[0].feed_counts).toBeUndefined();
    expect(getMockLocations(new URLSearchParams('sort=name')).status).toBe(400);
    expect(getMockLocations(new URLSearchParams('limit=101')).status).toBe(400);
    expect(
      getMockLocations(new URLSearchParams('include=children')).status,
    ).toBe(400);
  });

  it('filters by continent, slug or code', () => {
    const bySlug = locations('continent=europe&location_type=country');
    const byCode = locations('continent=EU&location_type=country');
    expect(bySlug.results.map((row) => row.slug)).toEqual(['fr', 'de']);
    expect(byCode).toEqual(bySlug);
  });

  it('routes location searches only', () => {
    expect(isLocationSearch(new URLSearchParams('location_id=1'))).toBe(true);
    expect(isLocationSearch(new URLSearchParams('continent=europe'))).toBe(
      true,
    );
    expect(isLocationSearch(new URLSearchParams('status=active'))).toBe(false);
  });

  it('paginates the feeds of a location, most relevant first', () => {
    const query = 'location_id=111&sort=location&limit=20';
    const first = feeds(query);
    const second = feeds(`${query}&offset=20`);
    expect(first.total).toBe(22);
    expect(first.results).toHaveLength(20);
    expect(second.results).toHaveLength(2);
    // The commuter train also serves Laval and Longueuil: least relevant.
    expect(second.results[1].feed_name).toBe('Commuter trains');
  });

  it('lists the feeds of a continent by slug or code', () => {
    expect(feeds('continent=europe&sort=location').total).toBe(3);
    expect(feeds('continent=EU&sort=location').total).toBe(3);
    expect(feeds('continent=asia').total).toBe(0);
    expect(feeds('continent=atlantis').total).toBe(0);
    // Continents have no location id.
    expect(feeds('location_id=-4').total).toBe(0);
  });

  it('rejects sort=location alone and both location parameters', () => {
    const status = (query: string): number =>
      getMockLocationFeeds(new URLSearchParams(query)).status;
    expect(status('sort=location')).toBe(400);
    expect(status('location_id=110&continent=europe')).toBe(400);
  });
});
