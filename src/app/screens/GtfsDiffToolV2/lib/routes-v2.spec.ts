import type { PatternOp, RouteImpact } from './entity-diff-types';
import type { EntityRow, Highlight } from './highlights';
import {
  DEFAULT_V2_FILTERS,
  highlightPreset,
  overviewCategory,
  routeChanges,
  routeSummaryLine,
  serviceGroups,
  stopStripRows,
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
    expect(routeSummaryLine(route('modified', { trips: true }))).toBe(
      'Schedule changed. Path and stops unchanged.',
    );
    expect(
      routeSummaryLine(
        route('modified', { path: true, stops: true, services: true }),
      ),
    ).toBe('Path, stops and schedule changed.');
    expect(routeSummaryLine(route('modified', { attributes: true }))).toBe(
      'Attributes changed. Path, stops and schedule unchanged.',
    );
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
  });

  it('draws path or stop changes bold, the rest thin', () => {
    expect(overviewCategory('modified', { ...NO_FLAGS, stops: true })).toBe(
      'major',
    );
    expect(overviewCategory('modified', { ...NO_FLAGS, trips: true })).toBe(
      'minor',
    );
    expect(overviewCategory('removed', NO_FLAGS)).toBe('removed');
    expect(overviewCategory('unchanged', NO_FLAGS)).toBe('unchanged');
  });
});

describe('stopStripRows', () => {
  const ops = (s: string): PatternOp[] =>
    [...s].map((c, i) => ({
      op: c === '+' ? 'add' : c === '-' ? 'remove' : 'keep',
      stop_id: `S${i}`,
    }));
  const shape = (rows: ReturnType<typeof stopStripRows>): string =>
    rows
      .map((r) => (r.type === 'gap' ? `[${r.count}]` : r.op.stop_id))
      .join(' ');

  it('collapses long unchanged runs to their ends', () => {
    expect(shape(stopStripRows(ops('......+-...')))).toBe(
      'S0 [4] S5 S6 S7 S8 S9 S10',
    );
  });

  it('expands a gap on request', () => {
    const rows = stopStripRows(ops('.....'));
    expect(shape(rows)).toBe('S0 [3] S4');
    const gap = rows.find((r) => r.type === 'gap');
    expect(
      gap?.type === 'gap' &&
        shape(stopStripRows(ops('.....'), new Set([gap.from]))),
    ).toBe('S0 S1 S2 S3 S4');
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

describe('serviceGroups', () => {
  const services = { base: ['WK', 'SAT', 'OLD'], new: ['WK', 'SAT', 'NEW'] };

  it('groups by added / removed, then by calendar status', () => {
    expect(
      serviceGroups(services, { WK: 'modified', SAT: 'unchanged' }),
    ).toEqual([
      { key: 'added', label: 'Added', ids: ['NEW'] },
      { key: 'removed', label: 'Removed', ids: ['OLD'] },
      { key: 'modified', label: 'Modified', ids: ['WK'] },
      { key: 'unchanged', label: 'Unchanged', ids: ['SAT'] },
    ]);
  });

  it('keeps shared services together while the status is unknown', () => {
    expect(serviceGroups(services, null).map((g) => g.key)).toEqual([
      'added',
      'removed',
      'both',
    ]);
  });

  it('filters by search and drops empty groups', () => {
    expect(serviceGroups(services, null, 'ne')).toEqual([
      { key: 'added', label: 'Added', ids: ['NEW'] },
    ]);
  });
});
