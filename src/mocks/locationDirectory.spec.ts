import {
  getMockLocationFeeds,
  getMockLocations,
  isLocationSearch,
  slugify,
} from './locationDirectory';

type Locations = ReturnType<typeof getMockLocations>;
type Feeds = ReturnType<typeof getMockLocationFeeds>;

function locations(
  query: string,
): NonNullable<Extract<Locations, { status: 200 }>['body']> {
  const result = getMockLocations(new URLSearchParams(query));
  if (result.status !== 200) throw new Error(`expected 200 for ${query}`);
  return result.body;
}

function feeds(query: string): Extract<Feeds, { status: 200 }>['body'] {
  const result = getMockLocationFeeds(new URLSearchParams(query));
  if (result.status !== 200) throw new Error(`expected 200 for ${query}`);
  return result.body;
}

function at(
  path: string,
): NonNullable<ReturnType<typeof locations>['results']>[number] {
  const [location] =
    locations(
      `continent=north-america&path=${path}&include_feed_counts=true&limit=1`,
    ).results ?? [];
  return location;
}

describe('location directory mocks', () => {
  it('slugifies names like the API', () => {
    expect(slugify('Québec')).toBe('quebec');
    expect(slugify('Saint-Jean-sur-Richelieu')).toBe(
      'saint-jean-sur-richelieu',
    );
    expect(slugify('Île-de-France')).toBe('ile-de-france');
  });

  it('lists continents with counts, empty ones included', () => {
    const { results } = locations(
      'location_type=continent&include_feed_counts=true',
    );
    expect(results?.map((row) => row.continent_slug)).toEqual([
      'africa',
      'antarctica',
      'europe',
      'north-america',
      'oceania',
    ]);
    const antarctica = results?.find((row) => row.slug === 'antarctica');
    expect(antarctica?.location_id).toBeNull();
    expect(antarctica?.path_slugs).toEqual([]);
    expect(antarctica?.feed_counts?.total).toBe(0);
  });

  it('lists the countries of a continent with feeds, most feeds first', () => {
    const { results } = locations(
      'continent=NA&location_type=country&has_feeds=true&include_feed_counts=true&sort=feed_count',
    );
    expect(results?.map((row) => row.path_slugs)).toEqual([
      ['canada'],
      ['united-states'],
    ]);
    expect(results?.[0].feed_counts?.total).toBeGreaterThan(
      results?.[1].feed_counts?.total ?? 0,
    );
  });

  it('resolves a path and rolls counts up', () => {
    const montreal = at('canada/quebec/montreal');
    expect(montreal.path_names).toEqual(['Canada', 'Québec', 'Montréal']);
    expect(montreal.feed_counts?.total).toBe(22);
    expect(at('canada/quebec').feed_counts?.total).toBeGreaterThan(22);
    expect(at('canada/quebec/nowhere')).toBeUndefined();
    expect(locations('continent=europe&path=canada').results).toEqual([]);
  });

  it('has a variable depth and collision-suffixed slugs', () => {
    const losAngeles = at(
      'united-states/california/los-angeles-county/los-angeles',
    );
    expect(losAngeles.path_names).toHaveLength(4);
    expect(
      at('united-states/california/san-francisco').path_slugs,
    ).toHaveLength(3);
    const ohio = at('united-states/ohio');
    const { results } = locations(
      `parent_location_id=${ohio.location_id}&has_feeds=true`,
    );
    expect(results?.map((row) => row.slug)).toEqual([
      'washington-township-123456',
      'washington-township-123457',
    ]);
  });

  it('pages children and rejects unsupported parameters', () => {
    const quebec = at('canada/quebec');
    const all = locations(`parent_location_id=${quebec.location_id}`);
    const second = locations(
      `parent_location_id=${quebec.location_id}&limit=2&offset=2`,
    );
    expect(second.total).toBe(all.total);
    expect(second.results).toEqual(all.results?.slice(2, 4));
    expect(all.results?.[0].feed_counts).toBeUndefined();
    expect(getMockLocations(new URLSearchParams('sort=name')).status).toBe(400);
    expect(getMockLocations(new URLSearchParams('limit=101')).status).toBe(400);
  });

  it('routes location searches only', () => {
    expect(isLocationSearch(new URLSearchParams('location_id=1'))).toBe(true);
    expect(isLocationSearch(new URLSearchParams('continent=europe'))).toBe(
      true,
    );
    expect(isLocationSearch(new URLSearchParams('status=active'))).toBe(false);
  });

  it('paginates the feeds of a location, most relevant first', () => {
    const montreal = at('canada/quebec/montreal');
    const query = `location_id=${montreal.location_id}&sort=location&limit=20`;
    const first = feeds(query);
    const second = feeds(`${query}&offset=20`);
    expect(first.total).toBe(22);
    expect(first.results).toHaveLength(20);
    expect(second.results).toHaveLength(2);
    // The commuter train also serves Laval and Longueuil: least relevant.
    expect(second.results[1].feed_name).toBe('Commuter trains');
  });

  it('lists the feeds of a continent and rejects sort=location alone', () => {
    expect(feeds('continent=europe&sort=location').total).toBe(3);
    expect(feeds('continent=asia').total).toBe(0);
    expect(
      getMockLocationFeeds(new URLSearchParams('sort=location')).status,
    ).toBe(400);
  });
});
