/**
 * "Notable highlights" of the Trips v2 overview: rule-based, from the
 * dataset's numbers only (no text generation). Each rule looks for one kind
 * of rider-facing regression, scores how concerning it is (0–1), and the
 * overview shows the top few.
 */

import type { GtfsDate, RawTable } from './entity-diff-types';
import type { RawAction, RawPredicate } from './raw-diff-query';
import { formatGtfsDate } from './calendar-utils';

/** Trips per route_id in each feed (all service days). */
export interface RouteTripBalance {
  route: string;
  base: number;
  new: number;
}

/** Rows whose value moved away from / towards a rider-friendly value. */
export interface Transition {
  lost: number;
  gained: number;
}

export interface HighlightSignals {
  routeTrips: RouteTripBalance[];
  /** trips.txt wheelchair_accessible 1 → not 1 (null: column absent). */
  wheelchair: Transition | null;
  /** trips.txt bikes_allowed 1 → not 1. */
  bikes: Transition | null;
  /** stop_times.txt pickup_type regular (0 / empty) → 1 (no pickup). */
  pickup: Transition | null;
  /** stop_times.txt drop_off_type regular → 1 (no drop-off). */
  dropOff: Transition | null;
}

export interface HighlightInput {
  trips?: RawTable;
  stopTimes?: RawTable;
  /** Modified stop_times rows per changed column. */
  stopTimeColumns?: Array<{ column: string; rows: number }>;
  signals?: HighlightSignals;
  coverage?: {
    base: { min: GtfsDate | null; max: GtfsDate | null };
    new: { min: GtfsDate | null; max: GtfsDate | null };
  } | null;
  routeName?: (routeId: string) => string;
}

/** What a highlight's expanded row lists. */
export type HighlightEntities =
  | { kind: 'routes'; routes: RouteTripBalance[] }
  | {
      kind: 'rows';
      file: 'trips.txt' | 'stop_times.txt';
      /** Rows of the raw table behind the highlight. */
      filters: {
        actions: RawAction[];
        changedColumn?: string;
        predicate?: RawPredicate;
      };
      count: number;
    }
  | {
      kind: 'dates';
      base: { min: GtfsDate | null; max: GtfsDate | null };
      new: { min: GtfsDate | null; max: GtfsDate | null };
    };

export interface TripsHighlight {
  id: string;
  /** 0–1: how concerning; the top ones are shown. */
  score: number;
  severity: 'error' | 'warning';
  title: string;
  detail: string;
  entities?: HighlightEntities;
}

/** Thresholds; exported so tests and the UI copy agree. */
export const RULES = {
  /** A route's trip cut worth calling out. */
  routeCutShare: 0.2,
  routeCutMinTrips: 5,
  routeCutMinBase: 10,
  /** Share of the original trips removed overall. */
  tripsRemovedShare: 0.05,
  /** Share of matched stop times whose arrival_time changed. */
  retimedShare: 0.1,
  /** Days between the feeds' published service. */
  gapDays: 2,
} as const;

function n(v: number): string {
  return v.toLocaleString('en-US');
}

function pct(share: number): string {
  const p = share * 100;
  return `${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1)}%`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${n(count)} ${count === 1 ? one : many}`;
}

function list(items: string[], max = 3): string {
  if (items.length <= max) return items.join(', ');
  return `${items.slice(0, max).join(', ')} and ${n(items.length - max)} more`;
}

function daysBetween(a: GtfsDate, b: GtfsDate): number {
  const d = (s: string): number =>
    Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
  return Math.round((d(b) - d(a)) / 86400000);
}

function severity(score: number): TripsHighlight['severity'] {
  return score >= 0.8 ? 'error' : 'warning';
}

function make(
  id: string,
  score: number,
  title: string,
  detail: string,
): TripsHighlight {
  const s = Math.max(0, Math.min(1, score));
  return { id, score: s, severity: severity(s), title, detail };
}

/** Every rule that fires, most concerning first. */
export function allHighlights(input: HighlightInput): TripsHighlight[] {
  const out: TripsHighlight[] = [];
  const name = input.routeName ?? ((r: string) => r);
  const sig = input.signals;

  // Routes that lose every trip.
  const dropped = (sig?.routeTrips ?? []).filter(
    (r) => r.base > 0 && r.new === 0,
  );
  if (dropped.length > 0) {
    const lost = dropped.reduce((s, r) => s + r.base, 0);
    out.push(
      make(
        'routes_dropped',
        0.95,
        `${plural(dropped.length, 'route')} lose${dropped.length === 1 ? 's' : ''} all ${dropped.length === 1 ? 'its' : 'their'} trips`,
        `${list(dropped.map((r) => name(r.route)))}: ${plural(lost, 'trip')} in the original feed, none in the new one.`,
      ),
    );
  }

  // The route with the deepest trip cut (still running).
  const cuts = (sig?.routeTrips ?? [])
    .filter(
      (r) =>
        r.new > 0 &&
        r.base >= RULES.routeCutMinBase &&
        r.base - r.new >= RULES.routeCutMinTrips &&
        (r.base - r.new) / r.base >= RULES.routeCutShare,
    )
    .map((r) => ({ ...r, share: (r.base - r.new) / r.base }))
    .sort((a, b) => b.share - a.share || b.base - b.new - (a.base - a.new));
  if (cuts.length > 0) {
    const top = cuts[0];
    const others = cuts.length - 1;
    out.push(
      make(
        'route_cut',
        0.5 + 0.45 * top.share,
        `Route ${name(top.route)} loses ${pct(top.share)} of its trips`,
        `${n(top.base)} → ${n(top.new)} trips across all service days.${
          others > 0
            ? ` ${plural(others, 'other route')} also lose ${pct(RULES.routeCutShare)} or more.`
            : ''
        }`,
      ),
    );
  }

  // Accessibility regressions.
  if (sig?.wheelchair && sig.wheelchair.lost > 0) {
    const { lost, gained } = sig.wheelchair;
    out.push(
      make(
        'wheelchair_lost',
        0.85 + 0.1 * Math.min(1, lost / 100),
        `${plural(lost, 'trip')} no longer wheelchair accessible`,
        `wheelchair_accessible was 1 in the original feed and is not in the new one${
          gained > 0 ? ` (${n(gained)} trips became accessible)` : ''
        }.`,
      ),
    );
  }
  const boardLost = (sig?.pickup?.lost ?? 0) + (sig?.dropOff?.lost ?? 0);
  if (boardLost > 0) {
    out.push(
      make(
        'boarding_restricted',
        0.6 + 0.3 * Math.min(1, boardLost / 1000),
        `${plural(boardLost, 'stop time')} stop allowing boarding or alighting`,
        `${n(sig?.pickup?.lost ?? 0)} pickups and ${n(sig?.dropOff?.lost ?? 0)} drop-offs changed from regular to 1 (not available).`,
      ),
    );
  }
  if (sig?.bikes && sig.bikes.lost > 0) {
    out.push(
      make(
        'bikes_lost',
        0.55 + 0.1 * Math.min(1, sig.bikes.lost / 100),
        `${plural(sig.bikes.lost, 'trip')} no longer allow bikes`,
        'bikes_allowed was 1 in the original feed and is not in the new one.',
      ),
    );
  }

  // Published service: a gap between the feeds, or a shorter horizon.
  const cov = input.coverage;
  if (cov?.base.max && cov.new.min && cov.new.min > cov.base.max) {
    const gap = daysBetween(cov.base.max, cov.new.min) - 1;
    if (gap >= RULES.gapDays) {
      out.push(
        make(
          'service_gap',
          // Often just two snapshots taken months apart, rather than missing
          // service for riders: worth knowing, ranked below real regressions.
          0.5,
          `${plural(gap, 'day')} between the two feeds' service`,
          `The original feed ends ${formatGtfsDate(cov.base.max)}; the new one starts ${formatGtfsDate(cov.new.min)}. No date runs in both, so trips are compared by typical day.`,
        ),
      );
    }
  } else if (
    cov?.base.max &&
    cov.new.max &&
    cov.new.max < cov.base.max &&
    cov.new.min &&
    cov.new.min <= cov.base.max
  ) {
    const shorter = daysBetween(cov.new.max, cov.base.max);
    if (shorter >= RULES.gapDays) {
      out.push(
        make(
          'shorter_horizon',
          0.5,
          `The new feed ends ${plural(shorter, 'day')} earlier`,
          `Service is published until ${formatGtfsDate(cov.new.max)}, instead of ${formatGtfsDate(cov.base.max)}.`,
        ),
      );
    }
  }

  // Trips removed across the feed.
  const t = input.trips;
  if (t) {
    const before =
      t.counts.deleted +
      t.counts.modified +
      t.counts.id_only +
      t.counts.unchanged;
    const after =
      t.counts.added +
      t.counts.modified +
      t.counts.id_only +
      t.counts.unchanged;
    const share = before > 0 ? t.counts.deleted / before : 0;
    if (share >= RULES.tripsRemovedShare) {
      // Removals replaced by more new trips are less worrying than a net cut.
      const net = after < before ? 1 : 0.6;
      out.push(
        make(
          'trips_removed',
          (0.4 + 0.5 * Math.min(1, share * 2)) * net,
          `${plural(t.counts.deleted, 'trip')} removed (${pct(share)} of the original)`,
          after < before
            ? `The new feed has ${n(before - after)} fewer trips overall (${n(before)} → ${n(after)}).`
            : `${n(t.counts.added)} trips were added, so the total still grows (${n(before)} → ${n(after)}).`,
        ),
      );
    }
  }

  // Timetables retimed across the board.
  const st = input.stopTimes;
  const arrival = input.stopTimeColumns?.find(
    (c) => c.column === 'arrival_time',
  );
  if (st && arrival) {
    const matched =
      st.counts.modified + st.counts.id_only + st.counts.unchanged;
    const share = matched > 0 ? arrival.rows / matched : 0;
    if (share >= RULES.retimedShare) {
      out.push(
        make(
          'retimed',
          0.3 + 0.4 * Math.min(1, share),
          `${plural(arrival.rows, 'stop time')} retimed`,
          `arrival_time changed in ${pct(share)} of the stop times present in both feeds.`,
        ),
      );
    }
  }

  // The entities each highlight expands to.
  const modified: RawAction[] = ['modified'];
  const entities: Record<string, HighlightEntities | undefined> = {
    routes_dropped: { kind: 'routes', routes: dropped },
    route_cut: { kind: 'routes', routes: cuts },
    wheelchair_lost: {
      kind: 'rows',
      file: 'trips.txt',
      filters: { actions: modified, predicate: 'wheelchair_lost' },
      count: sig?.wheelchair?.lost ?? 0,
    },
    bikes_lost: {
      kind: 'rows',
      file: 'trips.txt',
      filters: { actions: modified, predicate: 'bikes_lost' },
      count: sig?.bikes?.lost ?? 0,
    },
    boarding_restricted: {
      kind: 'rows',
      file: 'stop_times.txt',
      filters: { actions: modified, predicate: 'boarding_lost' },
      count: boardLost,
    },
    trips_removed: {
      kind: 'rows',
      file: 'trips.txt',
      filters: { actions: ['deleted'] },
      count: input.trips?.counts.deleted ?? 0,
    },
    retimed: {
      kind: 'rows',
      file: 'stop_times.txt',
      filters: { actions: modified, changedColumn: 'arrival_time' },
      count: arrival?.rows ?? 0,
    },
    service_gap: cov
      ? { kind: 'dates', base: cov.base, new: cov.new }
      : undefined,
    shorter_horizon: cov
      ? { kind: 'dates', base: cov.base, new: cov.new }
      : undefined,
  };
  return out
    .map((h) => (entities[h.id] ? { ...h, entities: entities[h.id] } : h))
    .sort((a, b) => b.score - a.score);
}

/** The most concerning `max` highlights. */
export function topHighlights(
  input: HighlightInput,
  max = 3,
): TripsHighlight[] {
  return allHighlights(input).slice(0, max);
}
