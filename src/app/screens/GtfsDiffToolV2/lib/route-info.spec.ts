import { presenceOf, routeInfoFromRows, routeInfoSql } from './route-info';

describe('presenceOf', () => {
  it('maps a routes-map status to the feeds a route is in', () => {
    expect(presenceOf('deleted')).toBe('base');
    expect(presenceOf('added')).toBe('new');
    expect(presenceOf('modified')).toBe('both');
    expect(presenceOf('unchanged')).toBe('both');
  });
});

describe('routeInfoFromRows', () => {
  it('keys the lookup by route_id', () => {
    expect(
      routeInfoFromRows([
        {
          route_id: 'C6',
          short_name: 'C6',
          long_name: 'Castellbisbal - Rubí',
          color: '0037FF',
          text_color: 'FFFFFF',
          status: 'unchanged',
        },
        {
          route_id: 'M5B',
          short_name: 'M5B',
          long_name: null,
          color: null,
          text_color: undefined,
          status: 'deleted',
        },
      ]),
    ).toEqual({
      C6: {
        short_name: 'C6',
        long_name: 'Castellbisbal - Rubí',
        color: '0037FF',
        text_color: 'FFFFFF',
        presence: 'both',
      },
      M5B: {
        short_name: 'M5B',
        long_name: '',
        color: '',
        text_color: '',
        presence: 'base',
      },
    });
  });

  it('is empty for no rows', () => {
    expect(routeInfoFromRows([])).toEqual({});
  });
});

describe('routeInfoSql', () => {
  it('reads only the name and colour columns of the routes.txt raw table', () => {
    expect(routeInfoSql('v')).toContain(
      "COLUMNS('^[bn]_route_(short_name|long_name|color|text_color)$')",
    );
  });
});

describe('routeInfoFromRows on raw routes.txt rows', () => {
  it('takes the new feed values, else the base ones', () => {
    expect(
      routeInfoFromRows([
        // A compact unchanged row: base values NULL where equal.
        {
          route_id: 'C6',
          status: 'unchanged',
          b_route_short_name: null,
          n_route_short_name: 'C6',
          b_route_color: null,
          n_route_color: '0037FF',
        },
        {
          route_id: 'M5B',
          status: 'deleted',
          b_route_short_name: 'M5B',
          n_route_short_name: null,
          b_route_long_name: 'Old line',
          n_route_long_name: null,
        },
        {
          route_id: 'N1',
          status: 'added',
          b_route_short_name: null,
          n_route_short_name: 'N1',
        },
      ]),
    ).toEqual({
      C6: {
        short_name: 'C6',
        long_name: '',
        color: '0037FF',
        text_color: '',
        presence: 'both',
      },
      M5B: {
        short_name: 'M5B',
        long_name: 'Old line',
        color: '',
        text_color: '',
        presence: 'base',
      },
      N1: {
        short_name: 'N1',
        long_name: '',
        color: '',
        text_color: '',
        presence: 'new',
      },
    });
  });
});
