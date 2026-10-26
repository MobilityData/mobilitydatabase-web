import {
  EMPTY_FILTERS,
  IMPACT_WEIGHT,
  MAX_ROWS,
  filterHighlights,
  highlightsDoc,
  impactOf,
  parseHighlightFilters,
  rankGlobalHighlights,
  reportTopHighlights,
  writeHighlightFilters,
} from './global-highlights';
import type { HighlightSeverity } from './highlights';

const rows = (n: number, prefix = 's') =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    label: `Stop ${i}`,
    note: '',
  }));

function h(
  id: string,
  score: number,
  entities?: unknown,
  severity: HighlightSeverity = score >= 0.8 ? 'error' : 'warning',
) {
  return { id, score, severity, title: id, detail: `${id} detail`, entities };
}

describe('rankGlobalHighlights', () => {
  const items = rankGlobalHighlights([
    {
      section: 'stops',
      highlights: [
        h('served_removed', 0.9, rows(1)),
        h('renamed', 0.35, rows(300)),
      ],
      rowKind: () => 'stop',
    },
    {
      section: 'routes',
      highlights: [h('routes_removed', 0.9, rows(40, 'r'))],
      rowKind: () => 'route',
    },
    {
      section: 'trips',
      highlights: [
        h('routes_dropped', 0.95, {
          kind: 'routes',
          routes: [{ route: 'R1', base: 10, new: 0 }],
        }),
      ],
    },
  ]);

  it('ranks across sections by score, more affected first within a band', () => {
    expect(items.map((x) => x.key)).toEqual([
      'trips:routes_dropped',
      'routes:routes_removed',
      'stops:served_removed',
      'stops:renamed',
    ]);
    expect(items.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
  });

  it('never lifts a highlight by more than the impact weight', () => {
    for (const x of items) {
      expect(x.score - x.rule_score).toBeGreaterThanOrEqual(0);
      expect(x.score - x.rule_score).toBeLessThanOrEqual(IMPACT_WEIGHT + 1e-9);
    }
    // 300 renamed stops stay below one removed served stop.
    const renamed = items.find((x) => x.id === 'renamed');
    expect(renamed?.score).toBeLessThan(0.4);
  });

  it('keeps the count but trims long entity lists', () => {
    const big = rankGlobalHighlights([
      { section: 'stops', highlights: [h('renamed', 0.35, rows(120))] },
    ])[0];
    expect(big.affected).toBe(120);
    expect(big.entities).toMatchObject({ kind: 'list', total: 120 });
    expect(big.entities?.kind === 'list' ? big.entities.rows.length : -1).toBe(
      MAX_ROWS,
    );
  });

  it('scales impact logarithmically', () => {
    expect(impactOf(0)).toBe(0);
    expect(impactOf(9)).toBeCloseTo(1 / 3);
    expect(impactOf(5000)).toBe(1);
  });
});

describe('report and filters', () => {
  const items = rankGlobalHighlights([
    {
      section: 'stops',
      highlights: [
        h('wheelchair_lost', 0.9, rows(3)),
        h('moved_far', 0.6, [{ id: 'X1', label: 'Gare du Nord', note: '' }]),
      ],
      rowKind: () => 'stop',
    },
    {
      section: 'calendar',
      highlights: [h('coverage_shorter', 0.6)],
    },
  ]);
  const doc = highlightsDoc('demo', items, '2026-10-26T00:00:00.000Z');

  it('counts by severity and section', () => {
    expect(doc.counts).toEqual({
      total: 3,
      error: 1,
      warning: 2,
      sections: { stops: 2, calendar: 1 },
    });
  });

  it('puts the top highlights in the report', () => {
    const r = reportTopHighlights(doc, 2);
    expect(r.total).toBe(3);
    expect(r.top.map((x) => [x.rank, x.key])).toEqual([
      [1, 'stops:wheelchair_lost'],
      [2, 'stops:moved_far'],
    ]);
  });

  it('filters by section, severity and text in entity names', () => {
    expect(
      filterHighlights(items, { ...EMPTY_FILTERS, sections: ['calendar'] }),
    ).toHaveLength(1);
    expect(
      filterHighlights(items, { ...EMPTY_FILTERS, severities: ['error'] }),
    ).toHaveLength(1);
    expect(
      filterHighlights(items, { ...EMPTY_FILTERS, query: 'gare' }).map(
        (x) => x.id,
      ),
    ).toEqual(['moved_far']);
  });

  it('round-trips filters through the query string', () => {
    const p = new URLSearchParams();
    const f = {
      sections: ['stops', 'trips'],
      severities: ['error' as const],
      query: 'gare',
    };
    writeHighlightFilters(p, f);
    expect(p.toString()).toBe('entity=stops%2Ctrips&severity=error&q=gare');
    expect(parseHighlightFilters(p)).toEqual(f);
    expect(
      parseHighlightFilters(new URLSearchParams('severity=bogus')).severities,
    ).toEqual([]);
  });
});

describe('highlights another section already explains', () => {
  const dropped = (routes: string[]) =>
    h('routes_dropped', 0.95, {
      kind: 'routes',
      routes: routes.map((route) => ({ route, base: 5, new: 0 })),
    });
  const removed = h('routes_removed', 0.9, [
    { id: 'M5B', label: '', note: '' },
    { id: '42', label: '', note: '', openId: 'R42' },
  ]);

  it('drops routes losing their trips when those routes were removed', () => {
    const items = rankGlobalHighlights([
      { section: 'trips', highlights: [dropped(['M5B', 'R42'])] },
      { section: 'routes', highlights: [removed] },
    ]);
    expect(items.map((x) => x.key)).toEqual(['routes:routes_removed']);
  });

  it('keeps them when some routes still exist', () => {
    const items = rankGlobalHighlights([
      { section: 'trips', highlights: [dropped(['M5B', 'X9'])] },
      { section: 'routes', highlights: [removed] },
    ]);
    expect(items.map((x) => x.key)).toEqual([
      'trips:routes_dropped',
      'routes:routes_removed',
    ]);
  });
});
