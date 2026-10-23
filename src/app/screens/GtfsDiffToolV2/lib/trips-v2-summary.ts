/**
 * Plain-language summaries for the Trips v2 page
 * (/gtfs-diff-tool-v2/<dataset>/trips-v2).
 *
 * Everything here reads a `DayDiff` from computeDayDiff (trips-utils.ts) and
 * turns it into the counts, chips and sentences the page shows: what changed
 * on a service day, per route, and per trip. Trips that only changed IDs
 * (QUIET_CLASSES other than 'unchanged') never count as rider-facing changes;
 * they are reported once, in the technical drill-down.
 */

import type {
  CompactTrip,
  DayDiff,
  RouteDirDiff,
  TripClass,
  TripPair,
} from './trips-types';
import {
  PROFILE_HOURS,
  QUIET_CLASSES,
  depAt,
  formatTime,
  ruleChangeText,
} from './trips-utils';

// ── Periods of the day ─────────────────────────────────────────────

export interface DayPeriod {
  id: string;
  label: string;
  /** "07:00–09:00", "before 07:00"; null for the whole day. */
  hint: string | null;
  /** Hour range [from, to), null for the whole day. */
  range: [number, number] | null;
}

export const DAY_PERIODS: DayPeriod[] = [
  { id: 'all', label: 'All day', hint: null, range: null },
  { id: 'early', label: 'Early', hint: 'before 07:00', range: [0, 7] },
  { id: 'am', label: 'AM peak', hint: '07:00–09:00', range: [7, 9] },
  { id: 'midday', label: 'Midday', hint: '09:00–15:00', range: [9, 15] },
  { id: 'pm', label: 'PM peak', hint: '15:00–18:00', range: [15, 18] },
  { id: 'evening', label: 'Evening', hint: '18:00–22:00', range: [18, 22] },
  {
    id: 'late',
    label: 'Late night',
    hint: 'after 22:00',
    range: [22, PROFILE_HOURS],
  },
];

/** The period whose range is exactly `range`, if any. */
export function periodFor(range: [number, number] | null): DayPeriod | null {
  return (
    DAY_PERIODS.find(
      (p) =>
        p.range === range ||
        (p.range != null &&
          range != null &&
          p.range[0] === range[0] &&
          p.range[1] === range[1]),
    ) ?? null
  );
}

// ── Trip-level predicates ──────────────────────────────────────────

/** Same trip for a rider, only trip_id / service_id / raw fields changed. */
export function isIdOnly(p: TripPair): boolean {
  return !p.minor && p.cls !== 'unchanged' && QUIET_CLASSES.has(p.cls);
}

/**
 * Paired only because the trip_id is unchanged: too different for the
 * stop-pattern and departure-time passes to call it the same trip.
 */
export function isWeakMatch(p: TripPair): boolean {
  return p.method === 'same_id';
}

/** A change a rider would notice (minor time changes excluded). */
export function isRiderChange(p: TripPair): boolean {
  return !p.minor && !QUIET_CLASSES.has(p.cls);
}

function isClass(p: TripPair, cls: TripClass): boolean {
  return !p.minor && p.cls === cls;
}

/** A route + direction with at least one rider-facing trip change. */
export function routeHasRiderChanges(r: RouteDirDiff): boolean {
  return (
    r.patterns_changed > 0 ||
    r.trips.base !== r.trips.new ||
    r.pairs.some(isRiderChange)
  );
}

// ── Formatting ─────────────────────────────────────────────────────

/** Unsigned duration: "4 min", "45 s", "1 min 30 s". */
export function duration(sec: number): string {
  const abs = Math.round(Math.abs(sec));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  if (m === 0) return `${s} s`;
  return s === 0 ? `${m} min` : `${m} min ${s} s`;
}

/** Signed duration: "+4 min", "−2 min". */
export function signed(sec: number): string {
  if (sec === 0) return '0 min';
  return `${sec > 0 ? '+' : '−'}${duration(sec)}`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Most frequent value; ties go to the first seen. */
function mode(values: number[]): number | null {
  const counts = new Map<number, number>();
  let best: number | null = null;
  let n = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > n) {
      best = v;
      n = c;
    }
  }
  return best;
}

/** The signed value with the largest magnitude. */
function extreme(values: number[]): number | null {
  let best: number | null = null;
  for (const v of values)
    if (best == null || Math.abs(v) > Math.abs(best)) best = v;
  return best;
}

// ── Chips ──────────────────────────────────────────────────────────

export type ChipTone = 'neutral' | 'added' | 'removed' | 'changed' | 'quiet';

export interface SummaryChip {
  label: string;
  tone: ChipTone;
}

// ── Service day ────────────────────────────────────────────────────

export interface DaySummary {
  /** Distinct route_ids running in either feed, and those with changes. */
  routes: { total: number; changed: number };
  added: number;
  removed: number;
  /** Distinct route_ids with shifted or running-time changes. */
  retimedRoutes: number;
  /** New stop patterns, plus removed ones that nothing replaced. */
  patternChanges: number;
  idOnly: number;
  /** Route + direction rows without rider-facing changes. */
  quietRouteDirs: number;
}

/** Patterns only in the new feed, plus base patterns nothing replaced. */
export function patternChangeCount(r: RouteDirDiff): number {
  const replaced = new Set(
    r.patterns.filter((p) => p.base === 0 && p.ref).map((p) => p.ref),
  );
  return r.patterns.filter(
    (p) => p.base === 0 || (p.new === 0 && !replaced.has(p.key)),
  ).length;
}

export function daySummary(day: DayDiff): DaySummary {
  const all = new Set<string>();
  const changed = new Set<string>();
  const retimed = new Set<string>();
  let added = 0;
  let removed = 0;
  let patternChanges = 0;
  let idOnly = 0;
  let quietRouteDirs = 0;
  for (const r of day.routes) {
    all.add(r.route);
    if (routeHasRiderChanges(r)) changed.add(r.route);
    else quietRouteDirs++;
    patternChanges += patternChangeCount(r);
    for (const p of r.pairs) {
      if (isClass(p, 'added')) added++;
      else if (isClass(p, 'removed')) removed++;
      else if (isClass(p, 'shifted') || isClass(p, 'running_time'))
        retimed.add(r.route);
      if (isIdOnly(p)) idOnly++;
    }
  }
  return {
    routes: { total: all.size, changed: changed.size },
    added,
    removed,
    retimedRoutes: retimed.size,
    patternChanges,
    idOnly,
    quietRouteDirs,
  };
}

export function dayChips(s: DaySummary): SummaryChip[] {
  const out: SummaryChip[] = [
    {
      label: `${s.routes.changed} of ${plural(s.routes.total, 'route')} changed`,
      tone: 'neutral',
    },
  ];
  if (s.added > 0)
    out.push({ label: `${plural(s.added, 'trip')} added`, tone: 'added' });
  if (s.removed > 0)
    out.push({
      label: `${plural(s.removed, 'trip')} removed`,
      tone: 'removed',
    });
  if (s.retimedRoutes > 0)
    out.push({
      label: `${plural(s.retimedRoutes, 'route')} retimed`,
      tone: 'changed',
    });
  if (s.patternChanges > 0)
    out.push({
      label: `${plural(s.patternChanges, 'stop pattern change')}`,
      tone: 'changed',
    });
  if (s.idOnly > 0)
    out.push({
      label: `${plural(s.idOnly, 'trip')} restructured, trip_id only`,
      tone: 'quiet',
    });
  return out;
}

// ── One route + direction ──────────────────────────────────────────

export interface RouteRowSummary {
  changedTrips: number;
  totalTrips: number;
  /** Largest end-to-end running-time change over retimed trips, seconds. */
  runningMax: number | null;
  mainChange: string;
}

function runningDeltas(r: RouteDirDiff): number[] {
  return r.pairs
    .filter((p) => isClass(p, 'running_time') && p.running_delta != null)
    .map((p) => p.running_delta as number);
}

export function routeRowSummary(
  r: RouteDirDiff,
  stopNames: Record<string, string>,
): RouteRowSummary {
  return {
    changedTrips: r.pairs.filter(isRiderChange).length,
    totalTrips: r.pairs.length,
    runningMax: extreme(runningDeltas(r)),
    mainChange: mainChange(r, stopNames),
  };
}

function firstStopName(
  t: CompactTrip | null,
  stopNames: Record<string, string>,
): string {
  const id = t?.stops[0];
  return id == null ? 'the first stop' : (stopNames[id] ?? id);
}

/** "First trip removed. AM peak running time 4 min longer. 2 late trips added." */
export function mainChange(
  r: RouteDirDiff,
  stopNames: Record<string, string>,
): string {
  const name = (id: string): string => stopNames[id] ?? id;
  const parts: string[] = [];
  const baseTimes = r.pairs
    .filter((p) => p.base_time != null && p.base)
    .map((p) => p.base_time as number);
  const firstBase = baseTimes.length ? Math.min(...baseTimes) : null;
  const lastBase = baseTimes.length ? Math.max(...baseTimes) : null;
  const matched = r.pairs.filter((p) => p.base && p.new);

  // A removed and an added trip at the same time is one trip that moved to
  // a stop pattern it couldn't be matched on.
  const removedAll = r.pairs.filter((p) => isClass(p, 'removed'));
  const addedAll = r.pairs.filter((p) => isClass(p, 'added'));
  const addedTimes = new Set(addedAll.map((p) => p.new_time));
  const replaced = removedAll.filter((p) => addedTimes.has(p.base_time));
  const replacedTimes = new Set(replaced.map((p) => p.base_time));
  const removed = removedAll.filter((p) => !replacedTimes.has(p.base_time));
  const added = addedAll.filter((p) => !replacedTimes.has(p.new_time));

  if (removed.length === 1) {
    const t = removed[0].base_time;
    parts.push(
      t === firstBase && baseTimes.length > 1
        ? 'First trip removed'
        : t === lastBase && baseTimes.length > 1
          ? 'Last trip removed'
          : `Trip at ${formatTime(t)} removed`,
    );
  } else if (removed.length > 1) {
    parts.push(`${removed.length} trips removed`);
  }
  if (replaced.length === 1)
    parts.push(
      `Trip at ${formatTime(replaced[0].base_time)} replaced by one on a different stop pattern`,
    );
  else if (replaced.length > 1)
    parts.push(
      `${replaced.length} trips replaced by trips on a different stop pattern`,
    );

  // Stops added to or dropped from matched trips, by name: a stop dropped
  // and added under the same name only changed its stop_id.
  const addedStops = new Map<string, number>();
  const droppedStops = new Map<string, number>();
  for (const p of matched) {
    if (p.minor || !(p.cls === 'pattern' || p.flags.includes('pattern')))
      continue;
    // Once per trip: a loop route can visit the same stop twice.
    const seen = new Set<string>();
    for (const o of p.align) {
      const m =
        o.op === 'add' ? addedStops : o.op === 'remove' ? droppedStops : null;
      const n = name(o.stop_id);
      if (m == null || seen.has(`${o.op}:${n}`)) continue;
      seen.add(`${o.op}:${n}`);
      m.set(n, (m.get(n) ?? 0) + 1);
    }
  }
  const renamed = [...addedStops.keys()].filter((n) => droppedStops.has(n));
  for (const n of renamed) {
    addedStops.delete(n);
    droppedStops.delete(n);
  }
  const stopText = (
    stops: Map<string, number>,
    lead: (names: string) => string,
  ): void => {
    if (stops.size === 0) return;
    const n = Math.max(...stops.values());
    parts.push(
      `${lead(listText([...stops.keys()], 2))} ${n === matched.length ? 'on every trip' : `on ${plural(n, 'trip')}`}`,
    );
  };
  stopText(addedStops, (s) =>
    addedStops.size === 1 ? `New stop ${s}` : `New stops ${s}`,
  );
  stopText(droppedStops, (s) => `No longer stops at ${s}`);
  if (renamed.length > 0)
    parts.push(
      `${renamed.length === 1 ? 'Same stop' : 'Same stops'} under new stop_ids: ${listText(renamed, 2)}`,
    );

  if (r.running) {
    parts.push(
      `${capitalize(r.running.period)} running time ${duration(r.running.delta)} ${r.running.delta > 0 ? 'longer' : 'shorter'}`,
    );
  }

  const shifted = r.pairs.filter((p) => isClass(p, 'shifted'));
  if (shifted.length > 0) {
    const shift = mode(shifted.map((p) => p.shift ?? 0)) ?? 0;
    const allSame = shifted.every((p) => p.shift === shift);
    const dir = shift > 0 ? 'later' : 'earlier';
    parts.push(
      allSame && shifted.length === matched.length
        ? `Every trip runs ${duration(shift)} ${dir}`
        : `${plural(shifted.length, 'trip')} shifted, mostly ${duration(shift)} ${dir}`,
    );
  }

  if (added.length > 0) {
    const times = added.map((p) => p.new_time ?? p.time);
    const late = lastBase != null && times.every((t) => t > lastBase);
    const early = firstBase != null && times.every((t) => t < firstBase);
    if (added.length === 1)
      parts.push(
        late
          ? `Late trip added at ${formatTime(times[0])}`
          : early
            ? `Early trip added at ${formatTime(times[0])}`
            : `Trip at ${formatTime(times[0])} added`,
      );
    else
      parts.push(
        `${added.length} ${late ? 'late ' : early ? 'early ' : ''}trips added`,
      );
  }

  const rules = r.pairs.filter((p) => isClass(p, 'rules')).length;
  if (rules > 0)
    parts.push(`Pickup or drop-off rules changed on ${plural(rules, 'trip')}`);
  const attrs = r.pairs.filter((p) => isClass(p, 'attributes')).length;
  if (attrs > 0)
    parts.push(`Trip attributes changed on ${plural(attrs, 'trip')}`);

  if (parts.length === 0) {
    if (r.minor_count > 0) return 'Minor time changes only.';
    return r.pairs.some(isIdOnly)
      ? 'Only trip_id values changed.'
      : 'No change.';
  }
  return parts.map((p) => `${p}.`).join(' ');
}

export function routeChips(r: RouteDirDiff): SummaryChip[] {
  const count = (cls: TripClass): number =>
    r.pairs.filter((p) => isClass(p, cls)).length;
  const out: SummaryChip[] = [
    {
      label:
        r.trips.base === r.trips.new
          ? `Trips per day: ${r.trips.new}`
          : `Trips per day: ${r.trips.base} → ${r.trips.new}`,
      tone: 'neutral',
    },
  ];
  const removed = count('removed');
  if (removed > 0)
    out.push({ label: `${plural(removed, 'trip')} removed`, tone: 'removed' });
  const added = count('added');
  if (added > 0)
    out.push({ label: `${plural(added, 'trip')} added`, tone: 'added' });
  const shifted = r.pairs.filter((p) => isClass(p, 'shifted'));
  if (shifted.length > 0) {
    const shift = mode(shifted.map((p) => p.shift ?? 0)) ?? 0;
    out.push({
      label: `${plural(shifted.length, 'trip')} shifted, ${signed(shift)}`,
      tone: 'changed',
    });
  }
  const running = runningDeltas(r);
  if (running.length > 0) {
    const max = extreme(running) ?? 0;
    const longer = running.every((d) => d > 0);
    const shorter = running.every((d) => d < 0);
    const what = longer ? 'longer' : shorter ? 'shorter' : 'changed';
    out.push({
      label: `${plural(running.length, 'trip')} with ${what} running time, ${signed(max)}`,
      tone: 'changed',
    });
  }
  const pattern = count('pattern');
  if (pattern > 0)
    out.push({
      label: `${plural(pattern, 'trip')} with a changed stop pattern`,
      tone: 'changed',
    });
  const rules = count('rules');
  if (rules > 0)
    out.push({
      label: `${plural(rules, 'trip')} with pickup / drop-off changes`,
      tone: 'changed',
    });
  const attrs = count('attributes');
  if (attrs > 0)
    out.push({
      label: `${plural(attrs, 'trip')} with attribute changes`,
      tone: 'changed',
    });
  if (r.minor_count > 0)
    out.push({
      label: `${plural(r.minor_count, 'minor time change')}`,
      tone: 'quiet',
    });
  const idOnly = r.pairs.filter(isIdOnly).length;
  if (idOnly > 0)
    out.push({
      label: `${plural(idOnly, 'trip')} restructured, trip_id only`,
      tone: 'quiet',
    });
  const weak = r.pairs.filter(isWeakMatch).length;
  if (weak > 0)
    out.push({
      label: `${plural(weak, 'trip')} matched only by trip_id`,
      tone: 'quiet',
    });
  return out;
}

/** "1 stop pattern, unchanged." / "3 stop patterns: 1 new, 1 removed." */
export function patternsCaption(r: RouteDirDiff): string {
  const total = r.patterns.length;
  const added = r.patterns.filter((p) => p.base === 0).length;
  const removed = r.patterns.filter((p) => p.new === 0).length;
  const head = plural(total, 'stop pattern');
  if (added + removed === 0)
    return total === 1 ? `${head}, unchanged.` : `${head}, all unchanged.`;
  const parts = [
    added > 0 && `${added} new`,
    removed > 0 && `${removed} no longer used`,
  ].filter(Boolean);
  return `${head}: ${parts.join(', ')}.`;
}

// ── One trip ───────────────────────────────────────────────────────

/** Short badge for a trip column / title: "Removed", "+2 min", "+4 min run". */
export function tripBadge(p: TripPair): string | null {
  if (p.minor) return 'Minor';
  switch (p.cls) {
    case 'added':
      return 'Added';
    case 'removed':
      return 'Removed';
    case 'shifted':
      return signed(p.shift ?? 0);
    case 'running_time':
      return p.running_delta != null
        ? `${signed(p.running_delta)} run`
        : 'Running time';
    case 'pattern':
      return 'Stops changed';
    case 'rules':
      return 'Pickup / drop-off';
    case 'attributes':
      return 'Attributes';
    case 'unchanged':
      return null;
    default:
      return isIdOnly(p) ? 'ID only' : null;
  }
}

/** One or two sentences explaining what changed for a rider. */
export function tripExplanation(
  p: TripPair,
  stopNames: Record<string, string>,
): string {
  const name = (id: string): string => stopNames[id] ?? id;
  if (p.cls === 'added')
    return `New trip, leaving ${firstStopName(p.new, stopNames)} at ${formatTime(p.new_time)}. The before feed has no matching trip.`;
  if (p.cls === 'removed')
    return `This trip no longer runs. It left ${firstStopName(p.base, stopNames)} at ${formatTime(p.base_time)}.`;
  if (p.cls === 'unchanged') return 'No change to this trip.';
  if (isIdOnly(p))
    return p.id_changed
      ? `Same times, stops and attributes. Only the trip_id changed (${p.base?.id} → ${p.new?.id}).`
      : 'Same times, stops and attributes. Only service_id or raw stop_times fields changed.';

  const startDelta =
    p.base_time != null && p.new_time != null ? p.new_time - p.base_time : 0;
  const lead =
    startDelta === 0
      ? 'Same departure time.'
      : `Departs ${duration(startDelta)} ${startDelta > 0 ? 'later' : 'earlier'}.`;

  if (p.minor)
    return `Times move by ${duration(p.max_delta)} at most, within the minor threshold.`;

  switch (p.cls) {
    case 'shifted': {
      const s = p.shift ?? 0;
      return `Every stop is ${duration(s)} ${s > 0 ? 'later' : 'earlier'}. The running time is unchanged.`;
    }
    case 'running_time': {
      const total = p.running_delta ?? 0;
      const later = total > 0 ? 'later' : 'earlier';
      if (p.segments.length === 1) {
        const seg = p.segments[0];
        const d = seg.new - seg.base;
        const tail =
          total === d
            ? `so later stops are ${duration(total)} ${later}`
            : `and the trip ends ${duration(total)} ${later}`;
        return `${lead} The ride from ${name(seg.from)} to ${name(seg.to)} takes ${duration(d)} ${d > 0 ? 'longer' : 'less'}, ${tail}.`;
      }
      return `${lead} Running time changes on ${p.segments.length} stretches of the route; the trip ends ${duration(total)} ${later}.`;
    }
    case 'pattern': {
      const names = (op: 'add' | 'remove'): string[] => [
        ...new Set(
          p.align.filter((o) => o.op === op).map((o) => name(o.stop_id)),
        ),
      ];
      const dropped = new Set(names('remove'));
      // Same name on both sides: only the stop_id changed.
      const renamed = names('add').filter((n) => dropped.has(n));
      const added = names('add').filter((n) => !renamed.includes(n));
      const gone = [...dropped].filter((n) => !renamed.includes(n));
      const parts: string[] = [];
      if (added.length) parts.push(`Now also stops at ${listText(added)}.`);
      if (gone.length) parts.push(`No longer stops at ${listText(gone)}.`);
      if (renamed.length)
        parts.push(
          `${listText(renamed)} ${renamed.length === 1 ? 'is the same stop' : 'are the same stops'} under a new stop_id.`,
        );
      return parts.join(' ') || 'The stop sequence changed.';
    }
    case 'rules':
      return p.rules
        .map((r) => `${ruleChangeText(r, name(r.stop_id))}.`)
        .join(' ');
    case 'attributes':
      return `${p.attr_changes
        .map(
          (c) =>
            `${c.field} changed from “${c.base_value}” to “${c.new_value}”`,
        )
        .join('; ')}.`;
    default:
      return lead;
  }
}

/** "A, B and 3 more" */
function listText(items: string[], max = 3): string {
  if (items.length <= max) return items.join(', ');
  return `${items.slice(0, max).join(', ')} and ${items.length - max} more`;
}

export interface TripStopRow {
  stopId: string;
  before: number | null;
  after: number | null;
  /** "No change", "+4 min", "New stop", "No longer served". */
  change: string;
  changed: boolean;
}

/** Stop-by-stop times of a pair, before vs after, aligned by stop_id. */
export function tripStopRows(p: TripPair): TripStopRow[] {
  return p.align.map((o) => {
    const before = p.base && o.bi != null ? depAt(p.base, o.bi) : null;
    const after = p.new && o.ni != null ? depAt(p.new, o.ni) : null;
    if (o.op === 'add')
      return {
        stopId: o.stop_id,
        before,
        after,
        change: p.base ? 'New stop' : 'Added trip',
        changed: true,
      };
    if (o.op === 'remove')
      return {
        stopId: o.stop_id,
        before,
        after,
        change: p.new ? 'No longer served' : 'Removed trip',
        changed: true,
      };
    const d = before != null && after != null ? after - before : 0;
    return {
      stopId: o.stop_id,
      before,
      after,
      change: d === 0 ? 'No change' : signed(d),
      changed: d !== 0,
    };
  });
}

// ── Technical drill-down ───────────────────────────────────────────

export interface TechnicalSummary {
  idOnly: number;
  /** Rider-changed trips whose trip_id changed too. */
  changedWithNewIds: number;
  /** "base_id → new_id" for ID-only trips whose trip_id changed. */
  mapping: string[];
  fields: Array<{ field: string; changes: number }>;
  /** Trips using frequencies.txt in either feed. */
  frequencyTrips: number;
  /** Pairs held together only by an unchanged trip_id. */
  weakMatches: number;
}

export function technicalSummary(pairs: TripPair[]): TechnicalSummary {
  const fields: Record<string, number> = {
    pickup_type: 0,
    drop_off_type: 0,
    timepoint: 0,
    shape_dist_traveled: 0,
    stop_headsign: 0,
  };
  for (const p of pairs) {
    for (const r of p.rules)
      fields[r.kind === 'pickup' ? 'pickup_type' : 'drop_off_type']++;
    for (const c of p.raw_changes) fields[c.field]++;
  }
  const idOnly = pairs.filter(isIdOnly);
  return {
    idOnly: idOnly.length,
    changedWithNewIds: pairs.filter((p) => isRiderChange(p) && p.id_changed)
      .length,
    mapping: idOnly
      .filter((p) => p.id_changed)
      .map((p) => `${p.base?.id} → ${p.new?.id}`),
    fields: Object.entries(fields).map(([field, changes]) => ({
      field,
      changes,
    })),
    frequencyTrips: pairs.filter((p) => p.base?.freq || p.new?.freq).length,
    weakMatches: pairs.filter(isWeakMatch).length,
  };
}
