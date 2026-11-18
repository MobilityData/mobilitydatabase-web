import {
  getMockLocation,
  getMockLocationByPath,
  getMockLocationChildren,
  getMockLocationFeeds,
  getMockLocations,
  isLocationSearch,
  slugify,
} from './locationDirectory';

type Locations = ReturnType<typeof getMockLocations>;
type Detail = ReturnType<typeof getMockLocationByPath>;
type Feeds = ReturnType<typeof getMockLocationFeeds>;

function ok<T>(result: { status: number; body: unknown }, label: string): T {
  if (result.status !== 200) throw new Error(`expected 200 for ${label}`);
  return result.body as T;
}

type LocationsBody = Extract<Locations, { status: 200 }>['body'];
type DetailBody = Extract<Detail, { status: 200 }>['body'];
type FeedsBody = Extract<Feeds, { status: 200 }>['body'];

function locations(query: string): LocationsBody {
  return ok(getMockLocations(new URLSearchParams(query)), query);
}

function lookup(path: string, query: string = ''): DetailBody {
  return ok(
    getMockLocationByPath(new URLSearchParams(`path=${path}&${query}`)),
    path,
  );
}

function children(id: number | undefined, query: string = ''): LocationsBody {
  return ok(
    getMockLocationChildren(String(id), new URLSearchParams(query)),
    String(id),
  );
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
  });

  it('lists the continents with feeds, most feeds first', () => {
    const all = locations('location_type=continent&include=feed_counts');
    expect(all.total).toBe(7);
    const antarctica = all.results?.find((row) => row.slug === 'antarctica');
    expect(antarctica).toMatchObject({
      location_id: -2,
      parent_location_id: null,
      path: 'antarctica',
      path_slugs: ['antarctica'],
      path_names: ['Antarctica'],
      feed_counts: { total: 0 },
    });

    const { results } = locations(
      'location_type=continent&has_feeds=true&include=feed_counts&sort=feed_count',
    );
    expect(results?.map((row) => row.location_id)).toEqual([-5, -4, -6, -1]);
    expect(results?.[0].path).toBe('north-america');
  });

  it('starts every path at the continent', () => {
    const quebec = lookup('north-america/canada/quebec');
    expect(quebec).toMatchObject({
      location_id: 110,
      parent_location_id: 100,
      continent_code: 'NA',
      path: 'north-america/canada/quebec',
      path_slugs: ['north-america', 'canada', 'quebec'],
      path_names: ['North America', 'Canada', 'Québec'],
      display_name: 'Canada, Québec',
    });
    expect(lookup('north-america/canada').parent_location_id).toBe(-5);
    expect(lookup('clipperton')).toMatchObject({
      parent_location_id: null,
      continent_code: null,
      path_slugs: ['clipperton'],
    });
  });

  it('looks a path up with its children and rolls counts up', () => {
    const montreal = lookup(
      'north-america/canada/quebec/montreal',
      'include=feed_counts',
    );
    expect(montreal.feed_counts?.total).toBe(22);
    expect(montreal.children).toBeUndefined();

    const quebec = lookup(
      '/North-America/canada/quebec/',
      'include=feed_counts,children&has_feeds=true&sort=feed_count&limit=2',
    );
    expect(quebec.feed_counts?.total).toBeGreaterThan(22);
    expect(quebec.children?.total).toBe(4);
    // Laval and Québec tie on 2 feeds: by display name.
    expect(quebec.children?.results?.map((row) => row.slug)).toEqual([
      'montreal',
      'laval',
    ]);
    expect(quebec.children?.results?.[0].feed_counts?.total).toBe(22);
  });

  it('answers unknown paths and ids with a 404', () => {
    const notFound = (params: string): number =>
      getMockLocationByPath(new URLSearchParams(params)).status;
    expect(notFound('path=north-america/canada/nowhere')).toBe(404);
    // Paths start at the continent.
    expect(notFound('path=canada')).toBe(404);
    expect(notFound('path=')).toBe(400);
    expect(notFound('path=europe&include=everything')).toBe(400);
    expect(getMockLocation('42', new URLSearchParams()).status).toBe(404);
    expect(getMockLocationChildren('42', new URLSearchParams()).status).toBe(
      404,
    );
  });

  it('gets a location by id, continents included', () => {
    const europe = ok<DetailBody>(
      getMockLocation('-4', new URLSearchParams('include=children')),
      'europe',
    );
    expect(europe.path).toBe('europe');
    expect(europe.children?.results?.map((row) => row.slug)).toEqual([
      'france',
      'germany',
    ]);
  });

  it('has a variable depth and collision-suffixed slugs', () => {
    expect(
      lookup(
        'north-america/united-states/california/los-angeles-county/los-angeles',
      ).path_names,
    ).toHaveLength(5);
    expect(
      lookup('north-america/united-states/california/san-francisco').path_slugs,
    ).toHaveLength(4);
    const ohio = lookup('north-america/united-states/ohio');
    expect(
      children(ohio.location_id, 'has_feeds=true').results?.map(
        (row) => row.path,
      ),
    ).toEqual([
      'north-america/united-states/ohio/washington-township-123456',
      'north-america/united-states/ohio/washington-township-123457',
    ]);
  });

  it('pages children and rejects unsupported parameters', () => {
    const quebec = lookup('north-america/canada/quebec');
    const all = children(quebec.location_id);
    const second = children(quebec.location_id, 'limit=2&offset=2');
    expect(second.total).toBe(all.total);
    expect(second.results).toEqual(all.results?.slice(2, 4));
    expect(all.results?.[0].feed_counts).toBeUndefined();
    expect(getMockLocations(new URLSearchParams('sort=name')).status).toBe(400);
    expect(getMockLocations(new URLSearchParams('limit=101')).status).toBe(400);
    expect(
      getMockLocations(new URLSearchParams('include=children')).status,
    ).toBe(400);
  });

  it('filters the list by continent, slug or code', () => {
    const bySlug = locations('continent=europe&location_type=country');
    const byCode = locations('continent=EU&location_type=country');
    expect(bySlug.results?.map((row) => row.slug)).toEqual([
      'france',
      'germany',
    ]);
    expect(byCode).toEqual(bySlug);
  });

  it('routes location searches only', () => {
    expect(isLocationSearch(new URLSearchParams('location_id=1'))).toBe(true);
    expect(isLocationSearch(new URLSearchParams('location_path=europe'))).toBe(
      true,
    );
    expect(isLocationSearch(new URLSearchParams('status=active'))).toBe(false);
  });

  it('paginates the feeds of a location, most relevant first', () => {
    const query =
      'location_path=north-america/canada/quebec/montreal&sort=location&limit=20';
    const first = feeds(query);
    const second = feeds(`${query}&offset=20`);
    expect(first.total).toBe(22);
    expect(first.results).toHaveLength(20);
    expect(second.results).toHaveLength(2);
    // The commuter train also serves Laval and Longueuil: least relevant.
    expect(second.results[1].feed_name).toBe('Commuter trains');
    expect(feeds('location_id=111&sort=location&limit=20')).toEqual(first);
  });

  it('lists the feeds of a continent by id or path', () => {
    expect(feeds('location_path=europe&sort=location').total).toBe(3);
    expect(feeds('location_id=-4&sort=location').total).toBe(3);
    expect(feeds('location_path=asia').total).toBe(0);
    expect(feeds('location_path=atlantis').total).toBe(0);
  });

  it('rejects sort=location alone and both location parameters', () => {
    const status = (query: string): number =>
      getMockLocationFeeds(new URLSearchParams(query)).status;
    expect(status('sort=location')).toBe(400);
    expect(status('location_id=-4&location_path=europe')).toBe(400);
  });
});
