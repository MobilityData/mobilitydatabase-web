import type { RouteImpact } from './entity-diff-types';
import type { EntityRow, Highlight } from './highlights';
import {
  DEFAULT_V2_FILTERS,
  highlightPreset,
  overviewCategory,
  routeChanges,
  routeSummaryLine,
} from './routes-v2';

const NO_FLAGS = {
  path: false,
  stops: false,
  trips: false,
  services: false,
  attributes: false,
  network: false,
};

function route(
  status: RouteImpact['status'],
  flags: Partial<RouteImpact['flags']> = {},
): RouteImpact {
  return {
    route_id: 'R',
    status,
    short_name: 'R',
    long_name: '',
    route_type: '3',
    color: '',
    text_color: '',
    base: null,
    new: null,
    field_changes: [],
    flags: { ...NO_FLAGS, ...flags },
    networks: { base: null, new: null },
    trips: { base: 1, new: 1 },
    services: { base: [], new: [] },
    stops: { base_count: 0, new_count: 0, added: [], removed: [] },
    directions: [],
  };
}

describe('routeSummaryLine', () => {
  it('says what changed and what did not', () => {
    expect(
      routeSummaryLine(
        route('modified', { path: true, stops: true, services: true }),
      ),
    ).toBe('Path and stops changed.');
    expect(routeSummaryLine(route('modified', { attributes: true }))).toBe(
      'Attributes changed. Path and stops unchanged.',
    );
  });

  it('leaves trips and services to the Trips and Service Dates pages', () => {
    expect(
      routeSummaryLine(route('modified', { trips: true, services: true })),
    ).toBe('Nothing changed.');
    expect(routeSummaryLine(route('added'))).toBe('New route in this feed.');
  });
});

describe('route changes and overview categories', () => {
  it('labels added and removed routes by their status only', () => {
    expect(routeChanges('added', { ...NO_FLAGS, stops: true })).toEqual([
      'added',
    ]);
    expect(
      routeChanges('modified', { ...NO_FLAGS, network: true, path: true }),
    ).toEqual(['path', 'network']);
    expect(
      routeChanges('modified', { ...NO_FLAGS, trips: true, services: true }),
    ).toEqual([]);
  });

  it('draws path or stop changes bold, the rest thin', () => {
    expect(overviewCategory('modified', { ...NO_FLAGS, stops: true })).toBe(
      'major',
    );
    expect(overviewCategory('modified', { ...NO_FLAGS, network: true })).toBe(
      'minor',
    );
    expect(overviewCategory('modified', { ...NO_FLAGS, trips: true })).toBe(
      'unchanged',
    );
    expect(overviewCategory('removed', NO_FLAGS)).toBe('removed');
    expect(overviewCategory('unchanged', NO_FLAGS)).toBe('unchanged');
  });
});

describe('highlightPreset', () => {
  const h = (
    id: string,
    entities: EntityRow[] = [],
  ): Highlight<EntityRow[]> => ({
    id,
    score: 0.5,
    severity: 'warning',
    title: id,
    detail: '',
    entities,
  });

  it('maps highlights to a "What changed" chip, else to their routes', () => {
    expect(highlightPreset(h('rerouted'))).toEqual({
      ...DEFAULT_V2_FILTERS,
      changes: ['path'],
    });
    expect(
      highlightPreset(
        h('renamed', [{ id: '1', label: '', note: '', openId: 'r1' }]),
      ),
    ).toEqual({ ...DEFAULT_V2_FILTERS, routeIds: ['r1'] });
    expect(
      highlightPreset(h('unused_shapes', [{ id: 'S', label: '', note: '' }])),
    ).toBeNull();
  });
});
