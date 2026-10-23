/**
 * Shared shape of an entity page's "Notable highlights": rule-based, from
 * the dataset's numbers only. Each entity (trips, stops, routes) has its own
 * rules; they score how concerning a change is (0–1) and the overview shows
 * the most concerning first.
 */

export type HighlightSeverity = 'error' | 'warning';

export interface Highlight<E = unknown> {
  id: string;
  /** 0–1: how concerning; the top ones are shown first. */
  score: number;
  severity: HighlightSeverity;
  title: string;
  detail: string;
  /** What the highlight expands to. */
  entities?: E;
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
