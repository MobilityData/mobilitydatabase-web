import { foreignKeyTarget } from './foreign-keys';

jest.mock('../../../../i18n/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe('foreign key links', () => {
  it('maps GTFS foreign keys to the page that can show them selected', () => {
    expect(foreignKeyTarget('route_id', '1')).toEqual({
      tab: 'routes',
      kind: 'route',
      id: '1',
    });
    expect(foreignKeyTarget('shape_id', '010154')).toMatchObject({
      tab: 'routes',
      kind: 'shape',
    });
    expect(foreignKeyTarget('parent_station', 'place-brdwy')).toMatchObject({
      tab: 'stops',
      kind: 'stop',
    });
    expect(foreignKeyTarget('service_id', 'LMMJV')).toMatchObject({
      tab: 'calendar',
      kind: 'service',
    });
  });

  it('leaves other columns and empty values as text', () => {
    expect(foreignKeyTarget('trip_headsign', 'Harvard')).toBeNull();
    expect(foreignKeyTarget('route_id', '')).toBeNull();
    expect(foreignKeyTarget('stop_id', null)).toBeNull();
  });
});
