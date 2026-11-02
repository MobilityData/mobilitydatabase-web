import {
  getMockDirectory,
  getMockDirectoryFeeds,
  readDirectoryQuery,
  slugify,
} from './locationDirectory';

describe('location directory mocks', () => {
  it('slugifies names like the API', () => {
    expect(slugify('Québec')).toBe('quebec');
    expect(slugify('Saint-Jean-sur-Richelieu')).toBe(
      'saint-jean-sur-richelieu',
    );
    expect(slugify('Île-de-France')).toBe('ile-de-france');
  });

  it('lists continents at the root', () => {
    const result = getMockDirectory({});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.level).toBe('root');
    expect(result.body.breadcrumb).toEqual([]);
    expect(result.body.children?.map((node) => node.slug)).toEqual([
      'africa',
      'europe',
      'north-america',
      'oceania',
    ]);
  });

  it('resolves the Montréal breadcrumb and rolls counts up', () => {
    const query = readDirectoryQuery(
      new URLSearchParams(
        'continent=north-america&country_code=ca&subdivision=quebec&municipality=montreal',
      ),
    );
    const result = getMockDirectory(query);
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.breadcrumb?.map((node) => node.name)).toEqual([
      'North America',
      'Canada',
      'Québec',
      'Montréal',
    ]);
    expect(result.body.children).toEqual([]);
    const montreal = result.body.feed_counts?.total ?? 0;
    const quebec = result.body.breadcrumb?.[2].feed_counts?.total ?? 0;
    expect(montreal).toBeGreaterThan(20);
    expect(quebec).toBeGreaterThan(montreal);
  });

  it('returns 400 on a broken hierarchy and 404 when nothing is there', () => {
    expect(getMockDirectory({ country_code: 'ca' }).status).toBe(400);
    expect(
      getMockDirectory({ continent: 'europe', country_code: 'ca' }).status,
    ).toBe(400);
    expect(getMockDirectory({ continent: 'antarctica' }).status).toBe(404);
  });

  it('paginates feeds, most relevant to the node first', () => {
    const query = {
      continent: 'north-america',
      country_code: 'ca',
      subdivision: 'quebec',
    };
    const first = getMockDirectoryFeeds(query, 20, 0);
    const second = getMockDirectoryFeeds(query, 20, 20);
    if (first.status !== 200 || second.status !== 200) {
      throw new Error('expected 200');
    }
    expect(first.body.results).toHaveLength(20);
    expect(second.body.results?.length).toBe((first.body.total ?? 0) - 20);
    // Feeds declared at the Québec level outrank municipality-level ones.
    expect(first.body.results?.[0].locations?.[0].municipality).toBeUndefined();
  });
});
