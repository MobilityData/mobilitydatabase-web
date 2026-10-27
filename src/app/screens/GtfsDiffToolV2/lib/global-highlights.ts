/**
 * Notable highlights of a whole diff, ranked across entities: the summary
 * page shows the top few, /gtfs-diff-tool-v2/<dataset>/highlights all of
 * them with filters.
 *
 * Each entity scores its own highlights 0–1 on the same scale (lib/highlights,
 * stops-, routes-, calendar-overview- and trips-v2-highlights): ~0.9 for
 * losses (removed routes, days without service), ~0.85+ for accessibility,
 * 0.5–0.9 scaled by size, ≤0.4 for cosmetic changes. Several rules give a
 * flat score whatever the size ("1 stop removed" = "40 routes removed"), so
 * the global score adds a small, bounded bonus for how many things are
 * affected: never more than IMPACT_WEIGHT, so it orders highlights of a
 * band without moving one into another. Severity stays the rule's, so a
 * highlight reads the same here and on its entity page.
 *
 * Built by scripts/generate-gtfs-highlights.mjs into highlights.json.
 * Type-only imports besides the helpers: the Node build imports this file.
 */

import type { EntityRow, HighlightSeverity } from './highlights';
import type { HighlightEntities, TripsHighlight } from './trips-v2-highlights';
import type { ReportHighlight, ReportSummary } from './report';
import { normalizeText } from './stops-utils';

export const HIGHLIGHTS_FILE = 'highlights.json';

/** Bonus for the number of things a highlight affects (≤ this). */
export const IMPACT_WEIGHT = 0.04;

/** Entity rows kept per highlight; the entity page has the full list. */
export const MAX_ROWS = 50;

/** Highlights shown on the summary page. */
export const SUMMARY_TOP = 5;

/** Order of sections for equal scores, and in the filters. */
export const SECTION_ORDER = ['trips', 'routes', 'stops', 'calendar'];

/** What the rows of a list highlight are, to link each to its page. */
export type RowKind = 'stop' | 'route' | 'shape' | 'service' | 'date';

export type GlobalEntities =
  | { kind: 'list'; of: RowKind; rows: EntityRow[]; total: number }
  | HighlightEntities;

export interface GlobalHighlight {
  /** "<section>:<rule id>", unique in a diff. */
  key: string;
  /** Entity-diff category id: trips, routes, stops, calendar. */
  section: string;
  /** Rule id within the section. */
  id: string;
  /** 1 = most concerning. */
  rank: number;
  /** Rule score plus the impact bonus; what the ranking sorts by. */
  score: number;
  /** The rule's own score (0–1), as on the entity page. */
  rule_score: number;
  severity: HighlightSeverity;
  title: string;
  detail: string;
  /** Things affected (stops, routes, rows…); 0 when not countable. */
  affected: number;
  entities?: GlobalEntities;
}

export interface HighlightsDoc {
  schema: 1;
  dataset: string;
  generated_at: string;
  counts: {
    total: number;
    error: number;
    warning: number;
    sections: Record<string, number>;
  };
  items: GlobalHighlight[];
  /**
   * Highlights left out of `items` because another section's explains them
   * (COVERED_BY): an entity page still shows its own (rank 0).
   */
  covered?: GlobalHighlight[];
  /** The block report.json shows on the summary page (top SUMMARY_TOP). */
  report?: NonNullable<ReportSummary['highlights']>;
}

/** A section's highlights as its entity page computes them. */
export interface SectionHighlights {
  section: string;
  highlights: Array<{
    id: string;
    score: number;
    severity: HighlightSeverity;
    title: string;
    detail: string;
    entities?: unknown;
  }>;
  /** What list highlights' rows are, by rule id. */
  rowKind?: (ruleId: string) => RowKind;
}

/** 0–1, log-scaled: 1 affected ≈ 0.1, 10 ≈ 0.35, 1,000+ = 1. */
export function impactOf(affected: number): number {
  if (!(affected > 0)) return 0;
  return Math.min(1, Math.log10(1 + affected) / 3);
}

function isEntityRows(v: unknown): v is EntityRow[] {
  return Array.isArray(v);
}

/** Things a highlight affects, and its entities trimmed to MAX_ROWS. */
function entitiesOf(
  entities: unknown,
  of: RowKind,
): { affected: number; entities?: GlobalEntities } {
  if (entities == null) return { affected: 0 };
  if (isEntityRows(entities))
    return {
      affected: entities.length,
      entities: {
        kind: 'list',
        of,
        rows: entities.slice(0, MAX_ROWS),
        total: entities.length,
      },
    };
  const e = entities as TripsHighlight['entities'];
  if (e?.kind === 'routes')
    return {
      affected: e.routes.length,
      entities: { kind: 'routes', routes: e.routes.slice(0, MAX_ROWS) },
    };
  if (e?.kind === 'rows') return { affected: e.count, entities: e };
  if (e?.kind === 'dates') return { affected: 0, entities: e };
  return { affected: 0 };
}

function sectionRank(section: string): number {
  const i = SECTION_ORDER.indexOf(section);
  return i < 0 ? SECTION_ORDER.length : i;
}

/**
 * Highlights another section's highlight already explains: a route removed
 * from routes.txt also "loses all its trips". The covered one is left out
 * of the global ranking (its entity page still shows it) when every entity
 * it lists is also in the covering one.
 */
export const COVERED_BY: Array<{ key: string; by: string }> = [
  { key: 'trips:routes_dropped', by: 'routes:routes_removed' },
];

/** Ids of the entities a highlight lists (route_id, stop_id…). */
function entityIds(entities: unknown): Set<string> {
  const out = new Set<string>();
  if (isEntityRows(entities))
    for (const r of entities) out.add(r.openId ?? r.id);
  else {
    const e = entities as TripsHighlight['entities'];
    if (e?.kind === 'routes') for (const r of e.routes) out.add(r.route);
  }
  return out;
}

function withoutCovered(sources: SectionHighlights[]): SectionHighlights[] {
  const ids = new Map<string, Set<string>>();
  for (const src of sources)
    for (const h of src.highlights)
      ids.set(`${src.section}:${h.id}`, entityIds(h.entities));
  const covered = new Set(
    COVERED_BY.filter(({ key, by }) => {
      const mine = ids.get(key);
      const theirs = ids.get(by);
      return (
        mine != null &&
        theirs != null &&
        mine.size > 0 &&
        [...mine].every((id) => theirs.has(id))
      );
    }).map((c) => c.key),
  );
  return sources.map((src) => ({
    ...src,
    highlights: src.highlights.filter(
      (h) => !covered.has(`${src.section}:${h.id}`),
    ),
  }));
}

/** Every section's highlights in one ranking, most concerning first. */
export function rankGlobalHighlights(
  sources: SectionHighlights[],
  opts: { dropCovered?: boolean } = {},
): GlobalHighlight[] {
  const all: Array<Omit<GlobalHighlight, 'rank'>> = [];
  for (const src of opts.dropCovered === false
    ? sources
    : withoutCovered(sources)) {
    for (const h of src.highlights) {
      const { affected, entities } = entitiesOf(
        h.entities,
        src.rowKind?.(h.id) ?? 'route',
      );
      all.push({
        key: `${src.section}:${h.id}`,
        section: src.section,
        id: h.id,
        score:
          Math.round((h.score + IMPACT_WEIGHT * impactOf(affected)) * 1e4) /
          1e4,
        rule_score: h.score,
        severity: h.severity,
        title: h.title,
        detail: h.detail,
        affected,
        ...(entities ? { entities } : {}),
      });
    }
  }
  all.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.severity === 'error') - Number(a.severity === 'error') ||
      sectionRank(a.section) - sectionRank(b.section) ||
      a.key.localeCompare(b.key),
  );
  return all.map((h, i) => ({ ...h, rank: i + 1 }));
}

/** Highlights `rankGlobalHighlights` drops as covered, with rank 0. */
export function coveredHighlights(
  sources: SectionHighlights[],
  ranked: GlobalHighlight[],
): GlobalHighlight[] {
  const kept = new Set(ranked.map((h) => h.key));
  return rankGlobalHighlights(sources, { dropCovered: false })
    .filter((h) => !kept.has(h.key))
    .map((h) => ({ ...h, rank: 0 }));
}

/** One section's highlights for its own page: covered ones included. */
export function sectionHighlights(
  doc: Pick<HighlightsDoc, 'items' | 'covered'>,
  section: string,
): GlobalHighlight[] {
  return [...doc.items, ...(doc.covered ?? [])]
    .filter((h) => h.section === section)
    .sort((a, b) => b.score - a.score);
}

export function highlightsDoc(
  dataset: string,
  items: GlobalHighlight[],
  generatedAt: string = new Date().toISOString(),
): HighlightsDoc {
  const sections: Record<string, number> = {};
  for (const h of items) sections[h.section] = (sections[h.section] ?? 0) + 1;
  return {
    schema: 1,
    dataset,
    generated_at: generatedAt,
    counts: {
      total: items.length,
      error: items.filter((h) => h.severity === 'error').length,
      warning: items.filter((h) => h.severity === 'warning').length,
      sections,
    },
    items,
  };
}

/** report.json's highlights: the top few of the global ranking. */
export function reportTopHighlights(
  doc: HighlightsDoc,
  n: number = SUMMARY_TOP,
): NonNullable<ReportSummary['highlights']> {
  return {
    counts: {
      error: doc.counts.error,
      warning: doc.counts.warning,
      success: 0,
      info: 0,
    },
    total: doc.counts.total,
    top: doc.items.slice(0, n).map(
      (h): ReportHighlight => ({
        key: h.key,
        rank: h.rank,
        section: h.section,
        severity: h.severity,
        title: h.title,
        detail: h.detail,
      }),
    ),
  };
}

// ── Filters of the highlights page ─────────────────────────────────

export const SEVERITIES: HighlightSeverity[] = ['error', 'warning'];

export const SEVERITY_LABELS: Record<HighlightSeverity, string> = {
  error: 'Critical',
  warning: 'Warning',
};

export interface HighlightFilters {
  /** Sections to show; empty = all. */
  sections: string[];
  /** Severities to show; empty = all. */
  severities: HighlightSeverity[];
  query: string;
}

export const EMPTY_FILTERS: HighlightFilters = {
  sections: [],
  severities: [],
  query: '',
};

function matchesQuery(
  h: GlobalHighlight,
  q: string,
  sectionLabel: string,
): boolean {
  if (q === '') return true;
  const texts = [h.title, h.detail, sectionLabel];
  if (h.entities?.kind === 'list')
    for (const r of h.entities.rows) texts.push(r.id, r.label);
  if (h.entities?.kind === 'routes')
    for (const r of h.entities.routes) texts.push(r.route);
  return texts.some((t) => normalizeText(t).includes(q));
}

export function filterHighlights(
  items: GlobalHighlight[],
  f: HighlightFilters,
  sectionLabel: (section: string) => string = (s) => s,
): GlobalHighlight[] {
  const q = normalizeText(f.query.trim());
  return items.filter(
    (h) =>
      (f.sections.length === 0 || f.sections.includes(h.section)) &&
      (f.severities.length === 0 || f.severities.includes(h.severity)) &&
      matchesQuery(h, q, sectionLabel(h.section)),
  );
}

/** ?entity=stops,routes&severity=error&q=wheelchair */
export function parseHighlightFilters(
  params: URLSearchParams,
): HighlightFilters {
  const list = (k: string): string[] =>
    (params.get(k) ?? '').split(',').filter(Boolean);
  return {
    sections: list('entity'),
    severities: list('severity').filter((s): s is HighlightSeverity =>
      (SEVERITIES as string[]).includes(s),
    ),
    query: params.get('q') ?? '',
  };
}

export function writeHighlightFilters(
  params: URLSearchParams,
  f: HighlightFilters,
): void {
  const set = (k: string, v: string): void => {
    if (v) params.set(k, v);
    else params.delete(k);
  };
  set('entity', f.sections.join(','));
  set('severity', f.severities.join(','));
  set('q', f.query);
}
