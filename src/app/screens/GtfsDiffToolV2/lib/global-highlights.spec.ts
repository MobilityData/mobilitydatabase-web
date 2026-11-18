import {
  EMPTY_FILTERS,
  IMPACT_WEIGHT,
  MAX_ROWS,
  filterHighlights,
  highlightsDoc,
  highlightsIndex,
  impactOf,
  joinHighlightEntities,
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

/** The fixture's own rule scores, by key. */
const RULE_SCORES: Record<string, number> = {
  'stops:served_removed': 0.9,
  'stops:renamed': 0.35,
  'routes:routes_removed': 0.9,
  'trips:routes_dropped': 0.95,
};

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
      const lift = x.score - (RULE_SCORES[x.key] ?? NaN);
      expect(lift).toBeGreaterThanOrEqual(0);
      expect(lift).toBeLessThanOrEqual(IMPACT_WEIGHT + 1e-9);
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

describe('highlights index', () => {
  // Section files as the build writes them: full entity lists.
  const sources = [
    {
      section: 'stops',
      highlights: [h('served_removed', 0.9, rows(70)), h('renamed', 0.35)],
      rowKind: () => 'stop' as const,
    },
    {
      section: 'services',
      highlights: [h('fewer_days', 0.7, rows(3, 'svc'))],
      rowKind: () => 'service' as const,
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
  ];
  const doc = highlightsDoc(
    'demo',
    rankGlobalHighlights(sources),
    '2026-10-26T00:00:00.000Z',
  );
  const files = {
    stops: 'highlights/stops.json',
    services: 'highlights/services.json',
    trips: 'highlights/trips.json',
  };
  const index = highlightsIndex(doc, files);

  it('keeps the ranking but no entity lists', () => {
    expect(index.files).toEqual(files);
    expect(index.items.map((x) => x.key)).toEqual(doc.items.map((x) => x.key));
    expect(index.items.every((x) => x.entities == null)).toBe(true);
    expect(index.items.find((x) => x.id === 'fewer_days')?.row_kind).toBe(
      'service',
    );
    expect(index.items.find((x) => x.id === 'served_removed')?.affected).toBe(
      70,
    );
  });

  it('gets the entities back from the section files', () => {
    const joined = joinHighlightEntities(
      index,
      Object.fromEntries(sources.map((src) => [src.section, src])),
    );
    expect(joined.items).toEqual(doc.items);
  });

  it('leaves a highlight without entities when its file is missing', () => {
    const joined = joinHighlightEntities(index, {});
    expect(joined.items.every((x) => x.entities == null)).toBe(true);
    expect(joined.items.map((x) => x.affected)).toEqual(
      doc.items.map((x) => x.affected),
    );
  });

  it('gives report.json the same top from the index', () => {
    expect(reportTopHighlights(index)).toEqual(reportTopHighlights(doc));
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
      section: 'services',
      highlights: [h('coverage_shorter', 0.6)],
    },
  ]);
  const doc = highlightsDoc('demo', items, '2026-10-26T00:00:00.000Z');

  it('counts by severity and section', () => {
    expect(doc.counts).toEqual({
      total: 3,
      error: 1,
      warning: 2,
      info: 0,
      sections: { stops: 2, services: 1 },
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
      filterHighlights(items, { ...EMPTY_FILTERS, sections: ['services'] }),
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
