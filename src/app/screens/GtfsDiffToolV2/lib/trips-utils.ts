/**
 * Pure helpers for the day-anchored Trips view.
 *
 * Trips under different service_ids aren't comparable on their own, so
 * everything starts from a service day: the trips each feed runs on that
 * date are matched semantically (route, direction, stop pattern, departure
 * time) and never by trip_id. Within a route + direction:
 *
 *   1. Trips sharing a stop pattern are paired by departure time with an
 *      optimal assignment, so one shifted trip doesn't cascade into a chain
 *      of mismatches the way greedy nearest-neighbour matching does.
 *   2. Leftovers are paired across patterns (time at the first shared stop).
 *   3. Anything still unpaired is added or removed.
 *
 * Each pair gets exactly one primary class plus secondary flags. Stop times
 * are aligned by an LCS on stop_ids, not by stop_sequence values, so one
 * inserted stop doesn't mark every downstream stop as changed.
 */

import type { FieldChange, GtfsDate } from './entity-diff-types';
import type {
  CompactTrip,
  DayDiff,
  MatchMethod,
  PatternInfo,
  RawStopChange,
  RouteDirDiff,
  RouteVerdict,
  RuleChange,
  SegmentChange,
  StopAlignment,
  TripClass,
  TripPair,
  TripsDiffDoc,
} from './trips-types';
import type { AnchorKey } from './trips-anchor';

// ── Constants ──────────────────────────────────────────────────────

/** Time changes at or below this are scheduler noise: dimmed, not counted. */
export const DEFAULT_MINOR_THRESHOLD_S = 60;

/** Trips further apart than this are never paired. */
export const MATCH_TOLERANCE_S = 15 * 60;

/** Profile hours, 0…29 (GTFS times run past midnight). */
export const PROFILE_HOURS = 30;

export const TRIP_CLASSES: TripClass[] = [
  'added',
  'removed',
  'pattern',
  'running_time',
  'shifted',
  'rules',
  'attributes',
  'restructured',
  'unchanged',
];

export const TRIP_CLASS_LABELS: Record<TripClass, string> = {
  added: 'Added',
  removed: 'Removed',
  pattern: 'Pattern changed',
  running_time: 'Running time changed',
  shifted: 'Shifted',
  rules: 'Pickup / drop-off changed',
  attributes: 'Attributes only',
  restructured: 'ID only',
  unchanged: 'Unchanged',
};

/**
 * Validated against the light surface; adjacent pairs that fall below the
 * CVD floor (added/removed) also differ in line style, never color alone.
 */
export const TRIP_CLASS_COLORS: Record<TripClass, string> = {
  added: '#2e7d32',
  removed: '#d32f2f',
  pattern: '#7b1fa2',
  running_time: '#ed6c02',
  shifted: '#1565c0',
  rules: '#424242',
  attributes: '#424242',
  restructured: '#9e9e9e',
  unchanged: '#9e9e9e',
};

export const VERDICTS: RouteVerdict[] = [
  'less_service',
  'more_service',
  'retimed',
  'pattern',
  'rules_attributes',
  'restructured',
];

export const VERDICT_LABELS: Record<RouteVerdict, string> = {
  less_service: 'Less service',
  more_service: 'More service',
  retimed: 'Retimed',
  pattern: 'Pattern changes',
  rules_attributes: 'Rules / attributes',
  restructured: 'Restructured only',
};

export const VERDICT_COLORS: Record<RouteVerdict, string> = {
  less_service: '#d32f2f',
  more_service: '#2e7d32',
  retimed: '#ed6c02',
  pattern: '#7b1fa2',
  rules_attributes: '#424242',
  restructured: '#757575',
};

/** Classes that leave a trip looking the same to a rider. */
export const QUIET_CLASSES: ReadonlySet<TripClass> = new Set([
  'unchanged',
  'restructured',
]);

const PERIODS: Array<[number, string]> = [
  [6 * 3600, 'early'],
  [9 * 3600, 'AM peak'],
  [15 * 3600, 'midday'],
  [19 * 3600, 'PM peak'],
  [Infinity, 'evening'],
];

// ── Time formatting ────────────────────────────────────────────────

/** "07:05"; times past midnight wrap (24:15 → 00:15, see `isNextDay`). */
export function formatTime(sec: number | null | undefined): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function isNextDay(sec: number | null | undefined): boolean {
  return sec != null && sec >= 24 * 3600;
}

/** "+3 min", "−45 s", "+1 min 30 s" */
export function formatDelta(sec: number): string {
  const sign = sec > 0 ? '+' : sec < 0 ? '−' : '±';
  const abs = Math.abs(sec);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  if (m === 0) return `${sign}${s} s`;
  return s === 0 ? `${sign}${m} min` : `${sign}${m} min ${s} s`;
}

export function formatMinutes(min: number | null): string {
  if (min == null) return '—';
  return `${Math.round(min * 10) / 10} min`;
}

// ── Service day ────────────────────────────────────────────────────

/**
 * Services each feed runs for a comparison: one date, or a base date and a
 * new date ("<base>~<new>", see lib/trips-anchor.ts).
 */
export function servicesForDate(
  doc: TripsDiffDoc,
  date: AnchorKey,
): { base: string[]; new: string[] } {
  // Same parsing as anchorSetIndices() in trips-anchor.ts, inlined so this
  // file has no runtime imports (the Node generators load it directly).
  const [bd, nd] = date.includes('~') ? date.split('~') : [date, date];
  const b = doc.dates[bd]?.[0] ?? -1;
  const n = doc.dates[nd]?.[1] ?? -1;
  return {
    base: b >= 0 ? doc.service_sets.base[b] : [],
    new: n >= 0 ? doc.service_sets.new[n] : [],
  };
}

export function dateBounds(doc: TripsDiffDoc): {
  min: GtfsDate | null;
  max: GtfsDate | null;
} {
  const dates = Object.keys(doc.dates).sort();
  return { min: dates[0] ?? null, max: dates.at(-1) ?? null };
}

/** "20260915" ⇄ "2026-09-15" for <input type="date">. */
export function toIsoDate(d: GtfsDate): string {
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

export function fromIsoDate(s: string): GtfsDate {
  return s.replace(/-/g, '');
}

// ── Trip helpers ───────────────────────────────────────────────────

export function patternKey(t: CompactTrip): string {
  return t.stops.join('|');
}

/** Departure at stop index i (falls back to arrival). */
export function depAt(t: CompactTrip, i: number): number | null {
  return t.dep[i] ?? t.arr[i] ?? null;
}

/** Arrival at stop index i (falls back to departure). */
export function arrAt(t: CompactTrip, i: number): number | null {
  return t.arr[i] ?? t.dep[i] ?? null;
}

export function startTime(t: CompactTrip): number | null {
  for (let i = 0; i < t.stops.length; i++) {
    const v = depAt(t, i);
    if (v != null) return v;
  }
  return null;
}

/** Departures a trip stands for: one, or every instance of its frequencies. */
export function expandedDepartures(t: CompactTrip): number[] {
  if (t.freq && t.freq.length > 0) {
    const out: number[] = [];
    for (const [start, end, headway] of t.freq) {
      if (headway <= 0) continue;
      for (let s = start; s < end; s += headway) out.push(s);
    }
    return out;
  }
  const s = startTime(t);
  return s == null ? [] : [s];
}

// ── Stop alignment (LCS) ───────────────────────────────────────────

/** LCS alignment of two stop sequences, with indices into each. */
export function alignStops(a: string[], b: string[]): StopAlignment[] {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: StopAlignment[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: 'keep', stop_id: a[i], bi: i, ni: j });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ op: 'remove', stop_id: a[i], bi: i, ni: null });
      i++;
    } else {
      ops.push({ op: 'add', stop_id: b[j], bi: null, ni: j });
      j++;
    }
  }
  for (; i < n; i++) ops.push({ op: 'remove', stop_id: a[i], bi: i, ni: null });
  for (; j < m; j++) ops.push({ op: 'add', stop_id: b[j], bi: null, ni: j });
  return ops;
}

/** Shortest common supersequence of all patterns, most used first. */
export function mergeStopOrder(patterns: string[][]): string[] {
  let order: string[] = [];
  for (const p of patterns) {
    order = alignStops(order, p).map((o) => o.stop_id);
  }
  return order;
}

// ── Assignment ─────────────────────────────────────────────────────

/**
 * Optimal order-preserving assignment between two time-sorted lists.
 * `cost` returns null for pairs that must not match; leaving an item
 * unmatched costs `unmatched`, so any allowed pair cheaper than twice that is
 * preferred over two unmatched trips. For absolute time differences on a
 * line an optimal matching never crosses, so this DP is exact.
 */
export function assign<A, B>(
  a: A[],
  b: B[],
  cost: (x: A, y: B) => number | null,
  unmatched: number,
): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return [];
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const move = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) {
    dp[i][0] = i * unmatched;
    move[i][0] = 1;
  }
  for (let j = 1; j <= m; j++) {
    dp[0][j] = j * unmatched;
    move[0][j] = 2;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = dp[i - 1][j] + unmatched;
      let mv = 1;
      if (dp[i][j - 1] + unmatched < best) {
        best = dp[i][j - 1] + unmatched;
        mv = 2;
      }
      const c = cost(a[i - 1], b[j - 1]);
      if (c != null && dp[i - 1][j - 1] + c < best) {
        best = dp[i - 1][j - 1] + c;
        mv = 3;
      }
      dp[i][j] = best;
      move[i][j] = mv;
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const mv = move[i][j];
    if (mv === 3) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (mv === 1) i--;
    else j--;
  }
  return pairs.reverse();
}

// ── Classification ─────────────────────────────────────────────────

const PICKUP_TEXT: Record<string, string> = {
  '0': 'regular',
  '1': 'none',
  '2': 'phone agency',
  '3': 'coordinate with driver',
};

/** Plain-language sentence for a pickup / drop-off change. */
export function ruleChangeText(r: RuleChange, stopName: string): string {
  const verb = r.kind === 'pickup' ? 'picks up' : 'drops off';
  if (r.new === '1') return `No longer ${verb} at ${stopName}`;
  if (r.base === '1')
    return r.new === '0'
      ? `Now ${verb} at ${stopName}`
      : `Now ${verb} at ${stopName} (${PICKUP_TEXT[r.new] ?? r.new})`;
  return `${r.kind === 'pickup' ? 'Pickup' : 'Drop-off'} at ${stopName}: ${PICKUP_TEXT[r.base] ?? r.base} → ${PICKUP_TEXT[r.new] ?? r.new}`;
}

function sameNumber(a: number | null, b: number | null): boolean {
  return a === b || (a != null && b != null && Math.abs(a - b) < 1e-6);
}

/**
 * trips.txt attributes that are identifiers, not service: schedulers
 * renumber vehicle blocks on every export (MBTA: C01-18 → C01-6), so a
 * changed block_id alone makes a trip "ID only", not an attribute change.
 */
export const ID_ATTRS: ReadonlySet<string> = new Set(['block_id']);

/** Attribute changes split into real ones and identifier-only ones. */
function attrChanges(
  b: CompactTrip,
  n: CompactTrip,
): { attrs: FieldChange[]; ids: FieldChange[] } {
  const out: FieldChange[] = [];
  const ids: FieldChange[] = [];
  if (b.headsign !== n.headsign)
    out.push({
      field: 'trip_headsign',
      base_value: b.headsign,
      new_value: n.headsign,
    });
  const keys = [...new Set([...Object.keys(b.attrs), ...Object.keys(n.attrs)])];
  for (const k of keys.sort()) {
    const bv = b.attrs[k] ?? '';
    const nv = n.attrs[k] ?? '';
    if (bv === nv) continue;
    (ID_ATTRS.has(k) ? ids : out).push({
      field: k,
      base_value: bv,
      new_value: nv,
    });
  }
  const freq = (t: CompactTrip): string => JSON.stringify(t.freq ?? []);
  if (freq(b) !== freq(n))
    out.push({
      field: 'frequencies',
      base_value: (b.freq ?? []).map(formatFrequency).join('; '),
      new_value: (n.freq ?? []).map(formatFrequency).join('; '),
    });
  return { attrs: out, ids };
}

export function formatFrequency(f: [number, number, number, string]): string {
  return `${formatTime(f[0])}–${formatTime(f[1])} every ${Math.round(f[2] / 60)} min`;
}

interface PairInput {
  route: string;
  dir: string;
  base: CompactTrip | null;
  new: CompactTrip | null;
  method: MatchMethod | null;
}

export function classifyPair(
  input: PairInput,
  minorThreshold: number,
): TripPair {
  const { base: b, new: n } = input;
  const base_time = b ? startTime(b) : null;
  const new_time = n ? startTime(n) : null;
  const pair: TripPair = {
    key: `${b?.id ?? ''}→${n?.id ?? ''}`,
    route: input.route,
    dir: input.dir,
    cls: 'unchanged',
    minor: false,
    base: b,
    new: n,
    time: new_time ?? base_time ?? 0,
    base_time,
    new_time,
    method: input.method,
    flags: [],
    align: [],
    shift: null,
    max_delta: 0,
    segments: [],
    rules: [],
    attr_changes: [],
    id_attr_changes: [],
    raw_changes: [],
    running_delta: null,
    id_changed: false,
    service_changed: false,
  };
  if (!b || !n) {
    pair.cls = b ? 'removed' : 'added';
    pair.align = alignStops(b?.stops ?? [], n?.stops ?? []);
    return pair;
  }

  const align = alignStops(b.stops, n.stops);
  pair.align = align;
  const kept = align.filter((o) => o.op === 'keep');
  const patternChanged = kept.length !== align.length;

  // Time deltas over kept stops (arrival and departure).
  const deltas: number[] = [];
  for (const o of kept) {
    const bi = o.bi as number;
    const ni = o.ni as number;
    for (const [x, y] of [
      [b.dep[bi], n.dep[ni]],
      [b.arr[bi], n.arr[ni]],
    ]) {
      if (x != null && y != null) deltas.push(y - x);
    }
  }
  const uniform = deltas.length > 0 && deltas.every((d) => d === deltas[0]);
  pair.shift = uniform ? deltas[0] : null;
  pair.max_delta = deltas.reduce((m, d) => Math.max(m, Math.abs(d)), 0);
  const shifted = uniform && deltas[0] !== 0;
  const runningChanged = deltas.length > 0 && !uniform;

  // Segment running times between consecutive kept stops.
  for (let k = 1; k < kept.length; k++) {
    const p = kept[k - 1];
    const c = kept[k];
    const bs = arrAt(b, c.bi as number);
    const bf = depAt(b, p.bi as number);
    const ns = arrAt(n, c.ni as number);
    const nf = depAt(n, p.ni as number);
    if (bs == null || bf == null || ns == null || nf == null) continue;
    if (bs - bf !== ns - nf)
      pair.segments.push({
        from: p.stop_id,
        to: c.stop_id,
        base: bs - bf,
        new: ns - nf,
      });
  }
  if (kept.length > 1) {
    const f = kept[0];
    const l = kept[kept.length - 1];
    const b0 = depAt(b, f.bi as number);
    const b1 = arrAt(b, l.bi as number);
    const n0 = depAt(n, f.ni as number);
    const n1 = arrAt(n, l.ni as number);
    if (b0 != null && b1 != null && n0 != null && n1 != null)
      pair.running_delta = n1 - n0 - (b1 - b0);
  }

  // Pickup / drop-off rules and raw stop_times fields on kept stops.
  for (const o of kept) {
    const bi = o.bi as number;
    const ni = o.ni as number;
    if (b.pickup[bi] !== n.pickup[ni])
      pair.rules.push({
        stop_id: o.stop_id,
        kind: 'pickup',
        base: b.pickup[bi],
        new: n.pickup[ni],
      });
    if (b.dropoff[bi] !== n.dropoff[ni])
      pair.rules.push({
        stop_id: o.stop_id,
        kind: 'dropoff',
        base: b.dropoff[bi],
        new: n.dropoff[ni],
      });
    const raw = (
      field: RawStopChange['field'],
      x: string | undefined,
      y: string | undefined,
    ): void => {
      if ((x ?? '') !== (y ?? ''))
        pair.raw_changes.push({
          stop_id: o.stop_id,
          field,
          base: x ?? '',
          new: y ?? '',
        });
    };
    const tp = (c: string | undefined): string =>
      c == null || c === '_' ? '' : c;
    raw('timepoint', tp(b.timepoint?.[bi]), tp(n.timepoint?.[ni]));
    raw('stop_headsign', b.stop_headsign?.[bi], n.stop_headsign?.[ni]);
    const bd = b.dist?.[bi] ?? null;
    const nd = n.dist?.[ni] ?? null;
    if (!sameNumber(bd, nd))
      pair.raw_changes.push({
        stop_id: o.stop_id,
        field: 'shape_dist_traveled',
        base: bd == null ? '' : String(bd),
        new: nd == null ? '' : String(nd),
      });
  }

  const attrs = attrChanges(b, n);
  pair.attr_changes = attrs.attrs;
  pair.id_attr_changes = attrs.ids;
  pair.id_changed = b.id !== n.id;
  pair.service_changed = b.service !== n.service;

  // Primary class by rider impact; a time change within the minor threshold
  // yields to any other change and is otherwise kept but dimmed.
  const timeMinor = pair.max_delta <= minorThreshold;
  const applicable: TripClass[] = [];
  if (patternChanged) applicable.push('pattern');
  if (runningChanged) applicable.push('running_time');
  if (shifted) applicable.push('shifted');
  if (pair.rules.length > 0) applicable.push('rules');
  if (pair.attr_changes.length > 0) applicable.push('attributes');
  if (
    pair.id_changed ||
    pair.service_changed ||
    pair.id_attr_changes.length > 0 ||
    pair.raw_changes.length > 0
  )
    applicable.push('restructured');

  const isTime = (c: TripClass): boolean =>
    c === 'running_time' || c === 'shifted';
  const primary =
    applicable.find((c) => !(isTime(c) && timeMinor)) ?? applicable[0];
  if (primary == null) {
    pair.cls = 'unchanged';
  } else {
    pair.cls = primary;
    pair.minor = isTime(primary) && timeMinor;
    pair.flags = applicable.filter((c) => c !== primary);
  }
  return pair;
}

/** Human-readable account of how a pair was matched. */
export function matchProvenance(p: TripPair): string {
  if (!p.base)
    return `No base trip on this route, direction and day departs within ${MATCH_TOLERANCE_S / 60} min of this one, so it counts as added.`;
  if (!p.new)
    return `No new trip on this route, direction and day departs within ${MATCH_TOLERANCE_S / 60} min of this one, so it counts as removed.`;
  if (p.method === 'same_id')
    return `Weak match: paired only because the trip_id (${p.new.id}) is unchanged. The stops or departure times differ too much to be sure it is the same trip; without the shared id it would count as one removed and one added trip.`;
  const how =
    p.method === 'same_pattern'
      ? 'Matched by stop pattern and departure time'
      : 'Matched by departure time across different stop patterns';
  const parts = [how];
  if (p.base_time != null && p.new_time != null)
    parts.push(
      p.base_time === p.new_time
        ? 'same first departure'
        : `first departure ${formatDelta(p.new_time - p.base_time)}`,
    );
  parts.push(
    p.id_changed
      ? `trip_id changed (${p.base.id} → ${p.new.id})`
      : 'trip_id unchanged',
  );
  if (p.service_changed)
    parts.push(`service_id ${p.base.service} → ${p.new.service}`);
  return `${parts.join('; ')}.`;
}

// ── Matching one route + direction ─────────────────────────────────

interface Timed {
  trip: CompactTrip;
  t: number;
}

function sortTimed(trips: CompactTrip[]): Timed[] {
  return trips
    .map((trip) => ({ trip, t: startTime(trip) ?? 0 }))
    .sort((x, y) => x.t - y.t || x.trip.id.localeCompare(y.trip.id));
}

function groupByPattern(trips: CompactTrip[]): Map<string, CompactTrip[]> {
  const out = new Map<string, CompactTrip[]>();
  for (const t of trips) {
    const k = patternKey(t);
    const list = out.get(k);
    if (list) list.push(t);
    else out.set(k, [t]);
  }
  return out;
}

/** Same trip_id breaks ties between otherwise equal candidates. */
const SAME_ID_BONUS = 0.5;

/**
 * How much later than a trip's start its first shared stop with another
 * pattern can be; candidates starting further apart are not compared.
 */
const MAX_LEAD_S = 3 * 3600;

export function matchRouteDirection(
  baseTrips: CompactTrip[],
  newTrips: CompactTrip[],
  /**
   * Last, pair leftovers that kept their trip_id (method 'same_id'). The
   * day views use it so a trip that kept its id but changed a lot reads as
   * one changed trip, as in the raw diff, not as removed + added. The
   * build-time trip_id mapping leaves it off: its later passes would match
   * such trips better.
   */
  opts: { sameIdFallback?: boolean } = {},
): Array<{
  base: CompactTrip | null;
  new: CompactTrip | null;
  method: MatchMethod | null;
}> {
  const out: Array<{
    base: CompactTrip | null;
    new: CompactTrip | null;
    method: MatchMethod | null;
  }> = [];
  const used = new Set<CompactTrip>();
  const bp = groupByPattern(baseTrips);
  const np = groupByPattern(newTrips);

  for (const [k, bl] of bp) {
    const nl = np.get(k);
    if (!nl) continue;
    const a = sortTimed(bl);
    const b = sortTimed(nl);
    const pairs = assign(
      a,
      b,
      (x, y) => {
        const d = Math.abs(x.t - y.t);
        if (d > MATCH_TOLERANCE_S) return null;
        return x.trip.id === y.trip.id ? d - SAME_ID_BONUS : d;
      },
      MATCH_TOLERANCE_S,
    );
    for (const [i, j] of pairs) {
      out.push({ base: a[i].trip, new: b[j].trip, method: 'same_pattern' });
      used.add(a[i].trip);
      used.add(b[j].trip);
    }
  }

  // Leftovers: pair across patterns by the time at the first shared stop.
  const restA = sortTimed(baseTrips.filter((t) => !used.has(t)));
  const restB = sortTimed(newTrips.filter((t) => !used.has(t)));
  // Numeric pattern ids, so the n × m cost calls below don't rebuild and
  // hash joined stop lists (large feeds have thousands of leftovers).
  const patternIds = new Map<string, number>();
  const pid = new Map<CompactTrip, number>();
  for (const { trip } of [...restA, ...restB]) {
    const key = patternKey(trip);
    let id = patternIds.get(key);
    if (id == null) patternIds.set(key, (id = patternIds.size));
    pid.set(trip, id);
  }
  const firstShared = new Map<number, [number, number] | null>();
  const pairs = assign(
    restA,
    restB,
    (x, y) => {
      // Trips starting hours apart are never the same trip; skip aligning.
      if (Math.abs(x.t - y.t) > MATCH_TOLERANCE_S + MAX_LEAD_S) return null;
      const k =
        (pid.get(x.trip) as number) * patternIds.size +
        (pid.get(y.trip) as number);
      if (!firstShared.has(k)) {
        const ops = alignStops(x.trip.stops, y.trip.stops).filter(
          (o) => o.op === 'keep',
        );
        // Require a real overlap, not a single shared terminal.
        const minLen = Math.min(x.trip.stops.length, y.trip.stops.length);
        firstShared.set(
          k,
          ops.length >= 2 && ops.length * 2 >= minLen
            ? [ops[0].bi as number, ops[0].ni as number]
            : null,
        );
      }
      const idx = firstShared.get(k);
      if (!idx) return null;
      const tx = depAt(x.trip, idx[0]);
      const ty = depAt(y.trip, idx[1]);
      if (tx == null || ty == null) return null;
      const d = Math.abs(tx - ty);
      if (d > MATCH_TOLERANCE_S) return null;
      return x.trip.id === y.trip.id ? d - SAME_ID_BONUS : d;
    },
    MATCH_TOLERANCE_S,
  );
  for (const [i, j] of pairs) {
    out.push({
      base: restA[i].trip,
      new: restB[j].trip,
      method: 'cross_pattern',
    });
    used.add(restA[i].trip);
    used.add(restB[j].trip);
  }
  if (opts.sameIdFallback) {
    const newById = new Map<string, CompactTrip>();
    for (const t of newTrips) if (!used.has(t)) newById.set(t.id, t);
    for (const t of baseTrips) {
      const n = used.has(t) ? undefined : newById.get(t.id);
      if (n == null) continue;
      out.push({ base: t, new: n, method: 'same_id' });
      used.add(t);
      used.add(n);
      newById.delete(t.id);
    }
  }
  for (const t of baseTrips)
    if (!used.has(t)) out.push({ base: t, new: null, method: null });
  for (const t of newTrips)
    if (!used.has(t)) out.push({ base: null, new: t, method: null });
  return out;
}

// ── Route + direction aggregation ──────────────────────────────────

function emptyClassCounts(): Record<TripClass, number> {
  return Object.fromEntries(TRIP_CLASSES.map((c) => [c, 0])) as Record<
    TripClass,
    number
  >;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function hourlyProfile(trips: CompactTrip[]): number[] {
  const out = new Array<number>(PROFILE_HOURS).fill(0);
  for (const t of trips)
    for (const d of expandedDepartures(t))
      out[Math.min(PROFILE_HOURS - 1, Math.max(0, Math.floor(d / 3600)))]++;
  return out;
}

/** Median headway (minutes) among departures in the busiest hour. */
export function peakHeadway(trips: CompactTrip[]): number | null {
  const deps = trips.flatMap(expandedDepartures).sort((a, b) => a - b);
  if (deps.length < 2) return null;
  const counts = new Map<number, number>();
  for (const d of deps) {
    const h = Math.floor(d / 3600);
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  let peak = -1;
  let best = 0;
  for (const [h, c] of counts)
    if (c > best || (c === best && h < peak)) {
      peak = h;
      best = c;
    }
  const gaps: number[] = [];
  for (let i = 0; i + 1 < deps.length; i++)
    if (Math.floor(deps[i] / 3600) === peak) gaps.push(deps[i + 1] - deps[i]);
  const m = median(gaps);
  return m == null ? null : Math.round((m / 60) * 10) / 10;
}

function span(trips: CompactTrip[]): [number, number] | null {
  const deps = trips.flatMap(expandedDepartures);
  if (deps.length === 0) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const d of deps) {
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  return [lo, hi];
}

export function periodOf(sec: number): string {
  for (const [end, label] of PERIODS) if (sec < end) return label;
  return 'evening';
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = '';
  let n = 0;
  for (const [v, c] of counts)
    if (c > n) {
      best = v;
      n = c;
    }
  return best;
}

function overlap(a: string[], b: string[]): number {
  return alignStops(a, b).filter((o) => o.op === 'keep').length;
}

export function buildRouteDir(
  route: string,
  dir: string,
  baseTrips: CompactTrip[],
  newTrips: CompactTrip[],
  minorThreshold: number,
): RouteDirDiff {
  const pairs = matchRouteDirection(baseTrips, newTrips, {
    sameIdFallback: true,
  })
    .map((m) => classifyPair({ route, dir, ...m }, minorThreshold))
    .sort((a, b) => a.time - b.time || a.key.localeCompare(b.key));

  // Stop patterns, base vs new trip counts.
  const patterns = new Map<string, PatternInfo>();
  const pat = (t: CompactTrip): PatternInfo => {
    const k = patternKey(t);
    let p = patterns.get(k);
    if (!p) {
      p = { key: k, stops: t.stops, base: 0, new: 0, ref: null };
      patterns.set(k, p);
    }
    return p;
  };
  for (const t of baseTrips) pat(t).base++;
  for (const t of newTrips) pat(t).new++;
  const basePatterns = [...patterns.values()].filter((p) => p.base > 0);
  for (const p of patterns.values()) {
    if (p.base > 0) continue;
    const votes = new Map<string, number>();
    for (const x of pairs)
      if (x.base && x.new && patternKey(x.new) === p.key) {
        const k = patternKey(x.base);
        votes.set(k, (votes.get(k) ?? 0) + 1);
      }
    let ref: string | null = null;
    let best = 0;
    for (const [k, v] of votes)
      if (v > best) {
        ref = k;
        best = v;
      }
    if (ref == null) {
      for (const bp of basePatterns) {
        const o = overlap(bp.stops, p.stops);
        if (o > best) {
          ref = bp.key;
          best = o;
        }
      }
    }
    p.ref = ref;
  }
  const patternList = [...patterns.values()].sort(
    (a, b) =>
      b.base + b.new - (a.base + a.new) ||
      b.stops.length - a.stops.length ||
      a.key.localeCompare(b.key),
  );

  const classCounts = emptyClassCounts();
  let minorCount = 0;
  for (const p of pairs) {
    if (p.minor) minorCount++;
    else classCounts[p.cls]++;
  }

  // Running-time change by period (pattern changes excluded: not comparable).
  const byPeriod = new Map<string, number[]>();
  for (const p of pairs) {
    if (p.running_delta == null || p.cls === 'pattern') continue;
    const k = periodOf(p.base_time ?? p.time);
    const list = byPeriod.get(k);
    if (list) list.push(p.running_delta);
    else byPeriod.set(k, [p.running_delta]);
  }
  let running: RouteDirDiff['running'] = null;
  for (const [period, values] of byPeriod) {
    const m = median(values);
    if (m == null || Math.abs(m) <= minorThreshold) continue;
    if (running == null || Math.abs(m) > Math.abs(running.delta))
      running = { delta: m, period };
  }

  const trips = {
    base: baseTrips.reduce((s, t) => s + expandedDepartures(t).length, 0),
    new: newTrips.reduce((s, t) => s + expandedDepartures(t).length, 0),
  };
  const patternsChanged = patternList.filter(
    (p) => p.base === 0 || p.new === 0,
  ).length;

  const verdicts: RouteVerdict[] = [];
  if (trips.new < trips.base) verdicts.push('less_service');
  if (trips.new > trips.base) verdicts.push('more_service');
  if (classCounts.shifted + classCounts.running_time > 0)
    verdicts.push('retimed');
  if (patternsChanged > 0 || classCounts.pattern > 0) verdicts.push('pattern');
  if (classCounts.rules + classCounts.attributes > 0)
    verdicts.push('rules_attributes');
  if (
    verdicts.length === 0 &&
    classCounts.added + classCounts.removed === 0 &&
    classCounts.restructured > 0
  )
    verdicts.push('restructured');

  const impact =
    Math.abs(trips.new - trips.base) * 3 +
    (classCounts.added + classCounts.removed) * 2 +
    classCounts.pattern * 2 +
    patternsChanged * 5 +
    classCounts.running_time +
    classCounts.shifted +
    classCounts.rules +
    classCounts.attributes * 0.5 +
    classCounts.restructured * 0.1;

  const freqHours = new Array<boolean>(PROFILE_HOURS).fill(false);
  for (const t of [...baseTrips, ...newTrips])
    for (const [s, e] of t.freq ?? [])
      for (let h = Math.floor(s / 3600); h * 3600 < e; h++)
        if (h < PROFILE_HOURS) freqHours[h] = true;

  return {
    key: `${route}\u001f${dir}`,
    route,
    dir,
    headsign:
      mostCommon(newTrips.map((t) => t.headsign)) ||
      mostCommon(baseTrips.map((t) => t.headsign)),
    trips,
    span: { base: span(baseTrips), new: span(newTrips) },
    peak_headway: { base: peakHeadway(baseTrips), new: peakHeadway(newTrips) },
    running,
    patterns: patternList,
    patterns_changed: patternsChanged,
    profile: { base: hourlyProfile(baseTrips), new: hourlyProfile(newTrips) },
    freq_hours: freqHours,
    stop_order: mergeStopOrder(patternList.map((p) => p.stops)),
    pairs,
    class_counts: classCounts,
    minor_count: minorCount,
    verdicts,
    minor_only: verdicts.length === 0 && minorCount > 0,
    impact,
  };
}

// ── Whole day ──────────────────────────────────────────────────────

export function computeDayDiff(
  doc: TripsDiffDoc,
  date: GtfsDate,
  minorThreshold: number = DEFAULT_MINOR_THRESHOLD_S,
): DayDiff {
  const services = servicesForDate(doc, date);
  const bs = new Set(services.base);
  const ns = new Set(services.new);
  const groups = new Map<
    string,
    { route: string; dir: string; base: CompactTrip[]; new: CompactTrip[] }
  >();
  const add = (t: CompactTrip, side: 'base' | 'new'): void => {
    const k = `${t.route}\u001f${t.dir}`;
    let g = groups.get(k);
    if (!g) {
      g = { route: t.route, dir: t.dir, base: [], new: [] };
      groups.set(k, g);
    }
    g[side].push(t);
  };
  for (const t of doc.feeds.base.trips) if (bs.has(t.service)) add(t, 'base');
  for (const t of doc.feeds.new.trips) if (ns.has(t.service)) add(t, 'new');

  const routes = [...groups.values()].map((g) =>
    buildRouteDir(g.route, g.dir, g.base, g.new, minorThreshold),
  );
  const classCounts = emptyClassCounts();
  let minor = 0;
  const trips = { base: 0, new: 0 };
  for (const r of routes) {
    for (const c of TRIP_CLASSES) classCounts[c] += r.class_counts[c];
    minor += r.minor_count;
    trips.base += r.trips.base;
    trips.new += r.trips.new;
  }
  return {
    date,
    services,
    routes: sortRouteDirs(routes, doc),
    class_counts: classCounts,
    minor_count: minor,
    trips,
  };
}

/** Changed first by impact, then by route name and direction. */
export function sortRouteDirs(
  routes: RouteDirDiff[],
  doc: Pick<TripsDiffDoc, 'routes'>,
): RouteDirDiff[] {
  const name = (r: RouteDirDiff): string =>
    doc.routes[r.route]?.short_name || r.route;
  return [...routes].sort(
    (a, b) =>
      b.impact - a.impact ||
      name(a).localeCompare(name(b), undefined, { numeric: true }) ||
      a.dir.localeCompare(b.dir),
  );
}

export function isChanged(r: RouteDirDiff): boolean {
  return r.verdicts.length > 0;
}

// ── Rows and per-row times ─────────────────────────────────────────

export interface PairRowTimes {
  base: Array<number | null>;
  new: Array<number | null>;
  /** Row served by the trip at all (time may still be null). */
  baseServed: boolean[];
  newServed: boolean[];
}

function placeOnRows(
  t: CompactTrip | null,
  order: string[],
  out: Array<number | null>,
  served: boolean[],
): void {
  if (!t) return;
  for (const o of alignStops(order, t.stops)) {
    if (o.op !== 'keep') continue;
    out[o.bi as number] = depAt(t, o.ni as number);
    served[o.bi as number] = true;
  }
}

/** Base / new times of a pair on each row of the route's stop order. */
export function pairRowTimes(p: TripPair, order: string[]): PairRowTimes {
  const r: PairRowTimes = {
    base: new Array<number | null>(order.length).fill(null),
    new: new Array<number | null>(order.length).fill(null),
    baseServed: new Array<boolean>(order.length).fill(false),
    newServed: new Array<boolean>(order.length).fill(false),
  };
  placeOnRows(p.base, order, r.base, r.baseServed);
  placeOnRows(p.new, order, r.new, r.newServed);
  return r;
}

/**
 * Rows to print in a timetable: the timepoint stops when the feed marks
 * any (timepoint=1), otherwise every stop. First and last stops always.
 */
export function timepointRows(r: RouteDirDiff): number[] {
  const marked = new Set<string>();
  let anyMarked = false;
  for (const p of r.pairs)
    for (const t of [p.base, p.new]) {
      if (!t?.timepoint) continue;
      for (let i = 0; i < t.stops.length; i++)
        if (t.timepoint[i] === '1') {
          marked.add(t.stops[i]);
          anyMarked = true;
        }
    }
  const last = r.stop_order.length - 1;
  return r.stop_order
    .map((s, i) => i)
    .filter(
      (i) => !anyMarked || i === 0 || i === last || marked.has(r.stop_order[i]),
    );
}

// ── Timetable columns ──────────────────────────────────────────────

export type TimetableColumn =
  | { kind: 'trip'; pair: TripPair }
  | { kind: 'fold'; key: string; pairs: TripPair[] };

export const FOLD_MIN_RUN = 3;

/** Trip columns in time order, with runs of quiet trips folded. */
export function timetableColumns(
  pairs: TripPair[],
  expanded: ReadonlySet<string>,
): TimetableColumn[] {
  const out: TimetableColumn[] = [];
  let run: TripPair[] = [];
  const flush = (): void => {
    if (run.length === 0) return;
    const key = `fold:${run[0].key}`;
    if (run.length >= FOLD_MIN_RUN && !expanded.has(key))
      out.push({ kind: 'fold', key, pairs: run });
    else for (const p of run) out.push({ kind: 'trip', pair: p });
    run = [];
  };
  for (const p of pairs) {
    if (QUIET_CLASSES.has(p.cls)) run.push(p);
    else {
      flush();
      out.push({ kind: 'trip', pair: p });
    }
  }
  flush();
  return out;
}

export function inHourRange(
  p: TripPair,
  range: [number, number] | null,
): boolean {
  if (range == null) return true;
  return p.time >= range[0] * 3600 && p.time < range[1] * 3600;
}

// ── Stop departure board ───────────────────────────────────────────

export type BoardStatus =
  | 'unchanged'
  | 'minor'
  | 'retimed'
  | 'added'
  | 'removed'
  | 'now_stops'
  | 'no_longer_stops';

export interface BoardEntry {
  pair: TripPair;
  base: number | null;
  new: number | null;
  status: BoardStatus;
  /** Time used for ordering and the hour group. */
  time: number;
}

function timeAtStop(t: CompactTrip | null, stopId: string): number[] {
  if (!t) return [];
  const out: number[] = [];
  for (let i = 0; i < t.stops.length; i++)
    if (t.stops[i] === stopId) {
      const v = depAt(t, i);
      if (v != null) out.push(v);
    }
  return out;
}

/** Departures at one stop for the day, old vs new. */
export function stopBoard(
  day: DayDiff,
  stopId: string,
  minorThreshold: number,
): BoardEntry[] {
  const out: BoardEntry[] = [];
  for (const r of day.routes) {
    for (const p of r.pairs) {
      const bt = timeAtStop(p.base, stopId);
      const nt = timeAtStop(p.new, stopId);
      const n = Math.max(bt.length, nt.length);
      for (let i = 0; i < n; i++) {
        const b = bt[i] ?? null;
        const x = nt[i] ?? null;
        let status: BoardStatus;
        if (b == null) status = p.base == null ? 'added' : 'now_stops';
        else if (x == null)
          status = p.new == null ? 'removed' : 'no_longer_stops';
        else if (b === x) status = 'unchanged';
        else if (Math.abs(x - b) <= minorThreshold) status = 'minor';
        else status = 'retimed';
        out.push({ pair: p, base: b, new: x, status, time: x ?? b ?? 0 });
      }
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Stops visited by any trip of the day, most departures first. */
export function boardStops(day: DayDiff): string[] {
  const counts = new Map<string, number>();
  for (const r of day.routes)
    for (const p of r.pairs)
      for (const t of [p.base, p.new])
        for (const s of t?.stops ?? []) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.keys()];
}

// ── Labels ─────────────────────────────────────────────────────────

/** One-line description of a pair's change for tooltips. */
export function pairSummary(p: TripPair): string {
  switch (p.cls) {
    case 'added':
      return `Added trip, departs ${formatTime(p.new_time)}`;
    case 'removed':
      return `Removed trip, departed ${formatTime(p.base_time)}`;
    case 'shifted':
      return `Shifted ${formatDelta(p.shift ?? 0)}`;
    case 'running_time':
      return `Running time ${p.running_delta != null ? formatDelta(p.running_delta) : 'changed'} (${p.segments.length} segment${p.segments.length === 1 ? '' : 's'})`;
    case 'pattern': {
      const add = p.align.filter((o) => o.op === 'add').length;
      const rem = p.align.filter((o) => o.op === 'remove').length;
      return `Stop pattern changed (${[add && `+${add}`, rem && `−${rem}`].filter(Boolean).join(' / ')} stops)`;
    }
    case 'rules':
      return `${p.rules.length} pickup / drop-off change${p.rules.length === 1 ? '' : 's'}`;
    case 'attributes':
      return `${p.attr_changes.map((c) => c.field).join(', ')} changed`;
    case 'restructured':
      return 'Same trip, IDs or raw fields changed';
    default:
      return 'Unchanged';
  }
}

export function directionLabel(dir: string): string {
  return dir === '' ? 'No direction' : `Direction ${dir}`;
}

export function segmentsText(s: SegmentChange): string {
  return `${formatDelta(s.new - s.base)} (${Math.round(s.base / 60)} → ${Math.round(s.new / 60)} min)`;
}
