/**
 * Optional build timings. With GTFS_DIFF_TIMINGS=<file.jsonl> set, every
 * timed section appends one JSON line to that file:
 *
 *   { step, label, ms, rows?, bytes?, calls?, rss_mb? }
 *
 * `step` is the build step of the running script (entity, trips, …).
 * Unset (the default), every helper is a no-op that just runs its function.
 */

import { appendFileSync } from 'node:fs';
import { basename } from 'node:path';
import { performance } from 'node:perf_hooks';

const FILE = process.env.GTFS_DIFF_TIMINGS || null;

/** Script -> build step name. */
const STEPS = {
  'build-gtfs-diff-dataset.mjs': 'build',
  'generate-gtfs-entity-diff.mjs': 'entity',
  'generate-gtfs-trips-diff.mjs': 'trips',
  'generate-gtfs-trips-calendar.mjs': 'calendar',
  'generate-gtfs-pathways-diff.mjs': 'pathways',
  'generate-gtfs-highlights.mjs': 'highlights',
};
const script = basename(process.argv[1] ?? '');
let step = STEPS[script] ?? script;

export const timingsOn = FILE != null;

if (FILE) {
  // The whole process, from Node's start, and its peak RSS.
  process.on('exit', () =>
    mark('process total (node start to exit)', performance.now(), {
      rss_mb: Math.round(process.resourceUsage().maxRSS / 1024),
    }),
  );
}

/** Steps run in one process (the build's report step) set their name. */
export function setTimingStep(name) {
  step = name;
}

/** Appends one line: `label` took `ms`, with optional rows / bytes / calls. */
export function mark(label, ms, extra) {
  if (!FILE) return;
  appendFileSync(FILE, `${JSON.stringify({ step, label, ms: Math.round(ms * 10) / 10, ...extra })}\n`);
}

/** Time from Node's start to now (imports, TS loading), at the top of main(). */
export function markStartup() {
  mark('startup (node + imports)', performance.now());
}

/**
 * Runs `fn` (sync or async) and records its time; returns what it returns.
 * `extra` is an object or (result) => object ({ rows, bytes }).
 */
export function timed(label, fn, extra) {
  if (!FILE) return fn();
  const t0 = performance.now();
  const done = (v) => {
    mark(label, performance.now() - t0, typeof extra === 'function' ? extra(v) : extra);
    return v;
  };
  const r = fn();
  return r != null && typeof r.then === 'function' ? r.then(done) : done(r);
}

/**
 * Starts a timer; call the returned function to record it, with an optional
 * extra object or () => object (only evaluated when timings are on).
 */
export function timer(label) {
  if (!FILE) return () => {};
  const t0 = performance.now();
  return (extra) => mark(label, performance.now() - t0, typeof extra === 'function' ? extra() : extra);
}

// ── Loop totals ────────────────────────────────────────────────────

const tallies = new Map(); // label -> { ms, calls }

function addTally(label, ms) {
  const e = tallies.get(label) ?? { ms: 0, calls: 0 };
  e.ms += ms;
  e.calls++;
  tallies.set(label, e);
}

/** Like timed(), but summed per label across calls; written by flushTallies(). */
export function tally(label, fn) {
  if (!FILE) return fn();
  const t0 = performance.now();
  const done = (v) => {
    addTally(label, performance.now() - t0);
    return v;
  };
  const r = fn();
  return r != null && typeof r.then === 'function' ? r.then(done) : done(r);
}

/** performance.now() when timings are on (0 otherwise), to start a lap(). */
export function now() {
  return FILE ? performance.now() : 0;
}

/** Adds now - t0 to `label`'s loop total; returns now, for the next lap. */
export function lap(label, t0) {
  if (!FILE) return 0;
  const t = performance.now();
  addTally(label, t - t0);
  return t;
}

/** Writes the loop totals collected so far (one line per label, with calls). */
export function flushTallies() {
  for (const [label, e] of tallies) mark(label, e.ms, { calls: e.calls });
  tallies.clear();
}
