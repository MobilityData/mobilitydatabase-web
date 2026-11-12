/**
 * Trips highlights about the service riders get on a day, beyond the raw
 * row counts of lib/trips-v2-highlights: service added, shorter hours, less
 * frequent service and stops left without service.
 *
 * Built from trips-service.json (scripts/generate-gtfs-trips-calendar.mjs):
 * each route's trips, span and trips per hour on the typical days of the
 * service periods (lib/trips-periods), plus the day with the most service
 * added. Ranked with the others by scripts/generate-gtfs-highlights.mjs.
 *
 * Pure; type-only imports besides the helpers: the Node build imports it.
 */

import type { EntityRow } from './highlights';
import type { TripsHighlight } from './trips-v2-highlights';

export const TRIPS_SERVICE_FILE = 'trips-service.json';

/** One route's service on a compared day (all directions). */
export interface RouteService {
  route: string;
  /** Short name, else route_id. */
  label: string;
  trips: { base: number; new: number };
  added: number;
  removed: number;
  /** First and last departure, seconds after midnight. */
  span: { base: [number, number] | null; new: [number, number] | null };
  /** Trips starting each hour, 0…29. */
  profile: { base: number[]; new: number[] };
}

export interface ComparedDay {
  /** Index into TripsCalendarDoc.counts. */
  s: number;
  /** After "on": "weekdays", "Sat 15 Aug", "weekdays 3–31 Aug". */
  when: string;
  /** A typical day of the week, as opposed to the day with most added. */
  typical: boolean;
  routes: RouteService[];
  /** Stops served before and not after (stop_id renames excluded). */
  unserved: Array<{ id: string; label: string }>;
}

export interface TripsServiceDoc {
  schema: 1;
  days: ComparedDay[];
}

/** Thresholds; exported so tests and the UI copy agree. */
export const SERVICE_RULES = {
  /** More trips on a day (after minus before) worth calling out. */
  addedMin: 3,
  /** Start later + end earlier, seconds. */
  spanShrink: 30 * 60,
  /** A route needs this many trips before for its span to count. */
  spanMinTrips: 4,
  /** An hour needs this many trips before for its frequency to count. */
  hourMinTrips: 3,
  /** Trips an hour lost, at least this many and this share. */
  hourDrop: 2,
  hourDropShare: 0.25,
  /** Rows listed per highlight. */
  maxRows: 12,
} as const;

export type ServiceRow = {
  route: string;
  label: string;
  when: string;
};

/** What the service highlights expand to (lib/trips-v2-highlights). */
export type ServiceEntities =
  | {
      kind: 'hours';
      rows: Array<
        ServiceRow & {
          base: number[];
          new: number[];
          /** The hour the highlight is about. */
          hour?: number;
        }
      >;
    }
  | {
      kind: 'spans';
      rows: Array<
        ServiceRow & { base: [number, number]; new: [number, number] }
      >;
    }
  /** Listed as stops on the highlights page (lib/global-highlights). */
  | { kind: 'stops'; rows: EntityRow[] };

function n(v: number): string {
  return v.toLocaleString('en-US');
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${n(count)} ${count === 1 ? one : many}`;
}

/** "40 min", "1 h 30" */
export function durationText(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 90) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** "8 am", "1 pm", "midnight", "1 am" (hours past 24 wrap). */
export function hourText(h: number): string {
  const x = h % 24;
  if (x === 0) return 'midnight';
  if (x === 12) return 'noon';
  return x < 12 ? `${x} am` : `${x - 12} pm`;
}

function severity(score: number): TripsHighlight['severity'] {
  return score >= 0.8 ? 'error' : 'warning';
}

function make(
  id: string,
  score: number,
  severityOf: TripsHighlight['severity'],
  title: string,
  detail: string,
  entities: TripsHighlight['entities'],
): TripsHighlight {
  return {
    id,
    score: Math.max(0, Math.min(1, score)),
    severity: severityOf,
    title,
    detail,
    entities,
  };
}

/** "weekdays and Sundays" */
function whenList(whens: string[]): string {
  if (whens.length <= 1) return whens[0] ?? '';
  return `${whens.slice(0, -1).join(', ')} and ${whens[whens.length - 1]}`;
}

/**
 * The day with the most service added: trips running that day, after minus
 * before (unmatched trips of a reworked timetable would overstate it).
 */
function addedHighlight(days: ComparedDay[]): TripsHighlight | null {
  const gain = (r: RouteService): number => r.trips.new - r.trips.base;
  let best: { day: ComparedDay; net: number } | null = null;
  for (const day of days) {
    const net = day.routes.reduce((s, r) => s + gain(r), 0);
    if (net >= SERVICE_RULES.addedMin && (best == null || net > best.net))
      best = { day, net };
  }
  if (best == null) return null;
  const { day } = best;
  const routes = day.routes
    .filter((r) => gain(r) > 0)
    .sort((a, b) => gain(b) - gain(a) || a.label.localeCompare(b.label));
  return make(
    'service_added',
    0.3,
    'info',
    `${plural(best.net, 'more trip')} on ${day.when}`,
    `On ${plural(routes.length, 'route')}.`,
    {
      kind: 'hours',
      rows: routes.slice(0, SERVICE_RULES.maxRows).map((r) => ({
        route: r.route,
        label: r.label,
        when: day.when,
        base: r.profile.base,
        new: r.profile.new,
      })),
    },
  );
}

function spanHighlight(typical: ComparedDay[]): TripsHighlight | null {
  // Each route's largest shrink over the typical days.
  const worst = new Map<
    string,
    {
      r: RouteService;
      when: string;
      later: number;
      earlier: number;
    }
  >();
  for (const day of typical)
    for (const r of day.routes) {
      const b = r.span.base;
      const nw = r.span.new;
      if (b == null || nw == null || r.trips.base < SERVICE_RULES.spanMinTrips)
        continue;
      const later = Math.max(0, nw[0] - b[0]);
      const earlier = Math.max(0, b[1] - nw[1]);
      if (later + earlier < SERVICE_RULES.spanShrink) continue;
      const w = worst.get(r.route);
      if (w == null || later + earlier > w.later + w.earlier)
        worst.set(r.route, { r, when: day.when, later, earlier });
    }
  const rows = [...worst.values()].sort(
    (a, b) =>
      b.later + b.earlier - (a.later + a.earlier) ||
      a.r.label.localeCompare(b.r.label),
  );
  if (rows.length === 0) return null;
  const top = rows[0];
  const shrink = top.later + top.earlier;
  const what =
    top.earlier >= top.later
      ? `last trip ${durationText(top.earlier)} earlier`
      : `first trip ${durationText(top.later)} later`;
  return make(
    'span_shorter',
    0.5 + 0.25 * Math.min(1, shrink / (3 * 3600)),
    'warning',
    rows.length === 1
      ? `Route ${top.r.label}: ${what} on ${top.when}`
      : `${plural(rows.length, 'route')} run shorter hours`,
    rows.length === 1
      ? 'Service starts later or ends earlier.'
      : `Route ${top.r.label}: ${what} on ${top.when}.`,
    {
      kind: 'spans',
      rows: rows.slice(0, SERVICE_RULES.maxRows).map((w) => ({
        route: w.r.route,
        label: w.r.label,
        when: w.when,
        base: w.r.span.base as [number, number],
        new: w.r.span.new as [number, number],
      })),
    },
  );
}

function frequencyHighlight(typical: ComparedDay[]): TripsHighlight | null {
  const worst = new Map<
    string,
    { r: RouteService; when: string; hour: number; b: number; n: number }
  >();
  const share = (x: { b: number; n: number }): number => (x.b - x.n) / x.b;
  for (const day of typical)
    for (const r of day.routes) {
      if (r.trips.new === 0) continue;
      r.profile.base.forEach((b, hour) => {
        const nw = r.profile.new[hour] ?? 0;
        // Still running that hour: an hour without service is a span change.
        if (
          b < SERVICE_RULES.hourMinTrips ||
          nw === 0 ||
          b - nw < SERVICE_RULES.hourDrop ||
          (b - nw) / b < SERVICE_RULES.hourDropShare
        )
          return;
        const cand = { r, when: day.when, hour, b, n: nw };
        const w = worst.get(r.route);
        if (
          w == null ||
          share(cand) > share(w) ||
          (share(cand) === share(w) && cand.b - cand.n > w.b - w.n)
        )
          worst.set(r.route, cand);
      });
    }
  const rows = [...worst.values()].sort(
    (a, b) =>
      share(b) - share(a) ||
      b.b - b.n - (a.b - a.n) ||
      a.r.label.localeCompare(b.r.label),
  );
  if (rows.length === 0) return null;
  const top = rows[0];
  const what = `${top.b} → ${top.n} trips an hour at ${hourText(top.hour)} on ${top.when}`;
  return make(
    'less_frequent',
    0.5 + 0.25 * share(top),
    'warning',
    rows.length === 1
      ? `Route ${top.r.label}: ${what}`
      : `${plural(rows.length, 'route')} run less often`,
    rows.length === 1
      ? 'Fewer trips in an hour the route still runs.'
      : `Route ${top.r.label}: ${what}.`,
    {
      kind: 'hours',
      rows: rows.slice(0, SERVICE_RULES.maxRows).map((w) => ({
        route: w.r.route,
        label: w.r.label,
        when: w.when,
        base: w.r.profile.base,
        new: w.r.profile.new,
        hour: w.hour,
      })),
    },
  );
}

function unservedHighlight(
  typical: ComparedDay[],
  exclude: ReadonlySet<string>,
): TripsHighlight | null {
  const stops = new Map<string, { label: string; whens: string[] }>();
  for (const day of typical)
    for (const s of day.unserved) {
      if (exclude.has(s.id)) continue;
      let x = stops.get(s.id);
      if (x == null) stops.set(s.id, (x = { label: s.label, whens: [] }));
      x.whens.push(day.when);
    }
  if (stops.size === 0) return null;
  const everyDay = [...stops.values()].every(
    (s) => s.whens.length === typical.length,
  );
  const rows: EntityRow[] = [...stops.entries()]
    .sort(
      ([, a], [, b]) =>
        b.whens.length - a.whens.length || a.label.localeCompare(b.label),
    )
    .map(([id, s]) => ({
      id,
      label: s.label,
      note:
        s.whens.length === typical.length
          ? 'no trips'
          : `no trips on ${whenList(s.whens)}`,
    }));
  const score = 0.6 + 0.25 * Math.min(1, stops.size / 50);
  return {
    id: 'stops_unserved',
    score,
    severity: severity(score),
    title: everyDay
      ? `${plural(stops.size, 'stop')} no longer served`
      : `${plural(stops.size, 'stop')} lose service`,
    detail: 'Still in the feed, but no trip stops there.',
    entities: { kind: 'stops', rows },
  };
}

/**
 * The highlights of a trips-service.json, most concerning first. `exclude`:
 * stops another highlight already reports (removed from the feed).
 */
export function serviceHighlights(
  doc: TripsServiceDoc,
  opts: { exclude?: ReadonlySet<string> } = {},
): TripsHighlight[] {
  const typical = doc.days.filter((d) => d.typical);
  return [
    addedHighlight(doc.days),
    spanHighlight(typical),
    frequencyHighlight(typical),
    unservedHighlight(typical, opts.exclude ?? new Set()),
  ]
    .filter((h): h is TripsHighlight => h != null)
    .sort((a, b) => b.score - a.score);
}
