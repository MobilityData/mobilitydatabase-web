/**
 * Shared shape of an entity page's "Notable highlights": rule-based, from
 * the dataset's numbers only. Each entity (trips, stops, routes) has its own
 * rules; they score how concerning a change is (0–1) and the overview shows
 * the most concerning first.
 */

/** info: worth knowing, not a regression (service added). */
export type HighlightSeverity = 'error' | 'warning' | 'info';

export interface Highlight<E = unknown> {
  id: string;
  /** 0–1: how concerning; the top ones are shown first. */
  score: number;
  severity: HighlightSeverity;
  title: string;
  detail: string;
  /** What the highlight expands to. */
  entities?: E;
  /**
   * Entities in the full list, when `entities` holds only its first rows
   * (inlineHighlights); the full list is in the section's highlights file.
   */
  entities_total?: number;
}

/** Entity rows a highlight keeps inline; the full lists are in their own file. */
export const INLINE_ENTITY_ROWS = 50;

/** A section's highlights with their full entity lists, as plain JSON. */
export interface HighlightsFile<E = EntityRow> {
  schema: 1;
  /** stops, routes or calendar. */
  section: string;
  highlights: Array<Highlight<E[]>>;
}

/** File of a section's highlights with full entity lists: stops-highlights.json */
export function highlightsFileName(section: string): string {
  return `${section}-highlights.json`;
}

/**
 * The highlights with at most `max` entity rows each, and the full count in
 * `entities_total` where rows were left out.
 */
export function inlineHighlights<E>(
  list: Array<Highlight<E[]>>,
  max: number = INLINE_ENTITY_ROWS,
): Array<Highlight<E[]>> {
  return list.map((h) =>
    h.entities && h.entities.length > max
      ? {
          ...h,
          entities: h.entities.slice(0, max),
          entities_total: h.entities.length,
        }
      : h,
  );
}

/** An entity listed under a highlight (a stop, a route, a shape…). */
export interface EntityRow {
  id: string;
  /** Short name shown next to the id (stop name, route long name). */
  label: string;
  /** What happened to it, e.g. "moved 120 m", "−5 stops". */
  note: string;
  /** Id used to open the entity when it differs from the shown one (route_id vs short name). */
  openId?: string;
}

export function severityOf(score: number): HighlightSeverity {
  return score >= 0.8 ? 'error' : 'warning';
}

export function makeHighlight<E>(
  id: string,
  score: number,
  title: string,
  detail: string,
  entities?: E,
): Highlight<E> {
  const s = Math.max(0, Math.min(1, score));
  return {
    id,
    score: s,
    severity: severityOf(s),
    title,
    detail,
    ...(entities ? { entities } : {}),
  };
}

export function rankHighlights<H extends { score: number }>(list: H[]): H[] {
  return [...list].sort((a, b) => b.score - a.score);
}

export function count(v: number): string {
  return v.toLocaleString('en-US');
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}
