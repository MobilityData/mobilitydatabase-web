// Pure model behind the accessibility surfaces. Kept free of three.js so it
// can be unit-tested and shared by the shader uniforms and CPU-side overlays.
//
// Travel time T(x,y,j) is the fastest of:
//   - walking straight from (x,y) to opportunity j, or
//   - walking to any station k, riding the line, and walking from the
//     alighting station to j (precomputed per (j, k) as an "egress" cost).

export type SurfaceMode = 'exponential' | 'cumulative';

export interface Station {
  x: number;
  y: number;
  line: number;
  /** Distance along the line from its first station. */
  chainage: number;
}

export interface Opportunity {
  x: number;
  y: number;
  /** O_j: number of opportunities (jobs, services, ...) at this location. */
  weight: number;
}

export interface ModelState {
  opportunities: Opportunity[];
  /** egress[j * stations.length + k]: min cost from boarding at k to reach j. */
  egress: Float32Array;
  beta: number;
  tau: number;
  walkSpeed: number;
}

/** User-adjustable inputs; see the controls panel. */
export interface ModelParams {
  /** When true, beta oscillates on its own and `beta` is ignored. */
  autoBeta: boolean;
  beta: number;
  /** When true, tau oscillates on its own and `tau` is ignored. */
  autoTau: boolean;
  tau: number;
  walkSpeed: number;
  transitSpeed: number;
  boardingPenalty: number;
  /**
   * When true, each line's boarding wait rises and falls as if service
   * frequency changed over the day (around `boardingPenalty`).
   */
  autoService: boolean;
  transitEnabled: boolean;
  /** Montréal panel: real travel times are in minutes, so beta is per min. */
  autoMontrealBeta: boolean;
  montrealBeta: number;
  /** Show transit lines, stations and opportunity markers on the surfaces. */
  showHelpers: boolean;
}

export const DEFAULT_PARAMS: ModelParams = {
  autoBeta: true,
  beta: 1.3,
  autoTau: true,
  tau: 2.8,
  walkSpeed: 1,
  transitSpeed: 4.5,
  boardingPenalty: 0.6,
  autoService: true,
  transitEnabled: true,
  autoMontrealBeta: true,
  montrealBeta: 0.08,
  showHelpers: true,
};

/** Stand-in for "unreachable" that stays finite inside the shader. */
const NO_TRANSIT_COST = 1e4;

export function autoBeta(t: number): number {
  return 1.3 + 0.3 * Math.sin(t * 0.09);
}

/** Relative swing of the boarding wait when `autoService` is on. */
const SERVICE_SWING = 0.6;

/**
 * Boarding wait on `line` at time `t`. The waiting part of a trip is about
 * half the headway, so busier service means a shorter wait. The two lines
 * run out of phase: one is well served while the other thins out.
 */
export function boardingWait(
  line: number,
  t: number,
  params: ModelParams,
): number {
  if (!params.autoService) return params.boardingPenalty;
  const swing = SERVICE_SWING * Math.sin(t * 0.1 + line * Math.PI);
  return params.boardingPenalty * (1 + swing);
}

export function autoTau(t: number): number {
  return 2.8 + 0.9 * Math.sin(t * 0.07 + 1.1);
}

export function autoMontrealBeta(t: number): number {
  return 0.08 + 0.035 * Math.sin(t * 0.08 + 0.4);
}

export function montrealBetaAt(t: number, params: ModelParams): number {
  return params.autoMontrealBeta ? autoMontrealBeta(t) : params.montrealBeta;
}

export const HALF_EXTENT = 5;
export const OPPORTUNITY_COUNT = 12;

const LOOP_RADIUS = 2.9;
const LOOP_STATION_COUNT = 8;
const LOOP_LENGTH = 2 * Math.PI * LOOP_RADIUS;

function buildStations(): Station[] {
  const loop: Station[] = Array.from({ length: LOOP_STATION_COUNT }, (_, i) => {
    const angle = (i / LOOP_STATION_COUNT) * Math.PI * 2 + 0.2;
    return {
      x: Math.cos(angle) * LOOP_RADIUS,
      y: Math.sin(angle) * LOOP_RADIUS,
      line: 0,
      chainage: (i / LOOP_STATION_COUNT) * LOOP_LENGTH,
    };
  });
  const crosstownStart = { x: -4.2, y: -3.4 };
  const crosstownEnd = { x: 4.0, y: 3.6 };
  const crosstownCount = 5;
  const crosstownLength = Math.hypot(
    crosstownEnd.x - crosstownStart.x,
    crosstownEnd.y - crosstownStart.y,
  );
  const crosstown: Station[] = Array.from(
    { length: crosstownCount },
    (_, i) => {
      const f = i / (crosstownCount - 1);
      return {
        x: crosstownStart.x + (crosstownEnd.x - crosstownStart.x) * f,
        y: crosstownStart.y + (crosstownEnd.y - crosstownStart.y) * f,
        line: 1,
        chainage: crosstownLength * f,
      };
    },
  );
  return [...loop, ...crosstown];
}

export const STATIONS: Station[] = buildStations();

/** Polylines (closed for the loop) used to draw the transit lines. */
export const TRANSIT_LINES: Array<{ points: Array<[number, number]> }> = [
  {
    points: Array.from({ length: 97 }, (_, i) => {
      const angle = (i / 96) * Math.PI * 2;
      return [Math.cos(angle) * LOOP_RADIUS, Math.sin(angle) * LOOP_RADIUS];
    }),
  },
  {
    points: Array.from({ length: 49 }, (_, i) => {
      const first = STATIONS[LOOP_STATION_COUNT];
      const last = STATIONS[STATIONS.length - 1];
      const f = i / 48;
      return [
        first.x + (last.x - first.x) * f,
        first.y + (last.y - first.y) * f,
      ];
    }),
  },
];

function rideTime(
  a: Station,
  b: Station,
  params: ModelParams,
  wait: number,
): number {
  if (a.line !== b.line) return Infinity;
  let distance = Math.abs(a.chainage - b.chainage);
  if (a.line === 0) distance = Math.min(distance, LOOP_LENGTH - distance);
  return distance / params.transitSpeed + wait;
}

// Deterministic pseudo-random layout so every viewer sees the same city.
function seededRandom(seed: number): () => number {
  let s = seed;
  return (): number => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface OpportunitySeed {
  x: number;
  y: number;
  weight: number;
  phase: number;
}

const SEED_GRID_COLS = 4;
const SEED_GRID_ROWS = 3;

const OPPORTUNITY_SEEDS: OpportunitySeed[] = ((): OpportunitySeed[] => {
  const rand = seededRandom(20260929);
  // Jittered 4x3 grid: spread across the whole square so each opportunity
  // reads as its own hill instead of merging into one central mound.
  return Array.from({ length: OPPORTUNITY_COUNT }, (_, i) => {
    const col = i % SEED_GRID_COLS;
    const row = Math.floor(i / SEED_GRID_COLS);
    const cellW = 8 / SEED_GRID_COLS;
    const cellH = 7.5 / SEED_GRID_ROWS;
    return {
      x: -4 + cellW * (col + 0.2 + rand() * 0.6),
      y: -3.75 + cellH * (row + 0.2 + rand() * 0.6),
      weight: 0.6 + rand() * 0.9,
      phase: rand() * Math.PI * 2,
    };
  });
})();

/**
 * Model state at time `t` (seconds). All motion is slow and periodic, and
 * only touches terms of the equation that really change over a day:
 * opportunity counts O_j, transit service (boarding waits, hence T) and
 * beta/tau. Opportunities stay put, so hills rise and fall in place.
 */
export function getModelState(
  t: number,
  params: ModelParams = DEFAULT_PARAMS,
): ModelState {
  const opportunities = OPPORTUNITY_SEEDS.map((seed) => ({
    x: seed.x,
    y: seed.y,
    weight: seed.weight * (1 + 0.35 * Math.sin(t * 0.21 + seed.phase)),
  }));
  const waits = TRANSIT_LINES.map((_, line) => boardingWait(line, t, params));

  const stationCount = STATIONS.length;
  const egress = new Float32Array(OPPORTUNITY_COUNT * stationCount);
  if (!params.transitEnabled) egress.fill(NO_TRANSIT_COST);
  opportunities.forEach((opp, j) => {
    if (!params.transitEnabled) return;
    const walkFrom = STATIONS.map(
      (s) => Math.hypot(s.x - opp.x, s.y - opp.y) / params.walkSpeed,
    );
    STATIONS.forEach((board, k) => {
      let best = Infinity;
      STATIONS.forEach((alight, m) => {
        if (m === k) return;
        best = Math.min(
          best,
          rideTime(board, alight, params, waits[board.line]) + walkFrom[m],
        );
      });
      egress[j * stationCount + k] = best;
    });
  });

  return {
    opportunities,
    egress,
    beta: params.autoBeta ? autoBeta(t) : params.beta,
    tau: params.autoTau ? autoTau(t) : params.tau,
    walkSpeed: params.walkSpeed,
  };
}

/**
 * Shape of the travel-time field. `core` rounds walking distance near zero
 * (sqrt(d^2 + c^2) - c) and `smoothing` blends the walk/transit options with a
 * smooth minimum, so peaks become rounded hills instead of cone tips. Both
 * are 0 for the exact model. Mirrored in the vertex shader.
 */
export interface TravelShape {
  core: number;
  smoothing: number;
}

export const EXACT_TRAVEL: TravelShape = { core: 0, smoothing: 0 };

export const TRAVEL_SHAPE: Record<SurfaceMode, TravelShape> = {
  exponential: { core: 0.5, smoothing: 0.9 },
  cumulative: EXACT_TRAVEL,
};

/** Polynomial smooth minimum; equals Math.min when k is 0. */
export function smoothMin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Hot path (called thousands of times per frame for pins and height range):
// plain sqrt instead of Math.hypot, and no per-call allocation.
function walkDistance(dx: number, dy: number, core: number): number {
  const d2 = dx * dx + dy * dy;
  return core > 0 ? Math.sqrt(d2 + core * core) - core : Math.sqrt(d2);
}

/** Walking time from (x, y) to each station; shared by every opportunity. */
const stationWalkScratch = new Float64Array(STATIONS.length);

function fillStationWalks(
  x: number,
  y: number,
  state: ModelState,
  shape: TravelShape,
): Float64Array {
  for (let k = 0; k < STATIONS.length; k++) {
    const s = STATIONS[k];
    stationWalkScratch[k] =
      walkDistance(x - s.x, y - s.y, shape.core) / state.walkSpeed;
  }
  return stationWalkScratch;
}

function travelTimeWithWalks(
  x: number,
  y: number,
  j: number,
  state: ModelState,
  shape: TravelShape,
  stationWalks: Float64Array,
): number {
  const opp = state.opportunities[j];
  let best = walkDistance(x - opp.x, y - opp.y, shape.core) / state.walkSpeed;
  const stationCount = STATIONS.length;
  for (let k = 0; k < stationCount; k++) {
    const viaTransit = stationWalks[k] + state.egress[j * stationCount + k];
    best = smoothMin(best, viaTransit, shape.smoothing);
  }
  return best;
}

export function travelTime(
  x: number,
  y: number,
  j: number,
  state: ModelState,
  shape: TravelShape = EXACT_TRAVEL,
): number {
  const walks = fillStationWalks(x, y, state, shape);
  return travelTimeWithWalks(x, y, j, state, shape, walks);
}

/** Softened indicator 1{T <= tau}; mirrors the shader's smoothstep. */
export const INDICATOR_SOFTNESS = 0.12;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * A(x,y)     = sum_j O_j e^(-beta T(x,y,j))       (exponential)
 * A(x,y,tau) = sum_j O_j 1{T(x,y,j) <= tau}        (cumulative)
 */
export function accessibility(
  x: number,
  y: number,
  mode: SurfaceMode,
  state: ModelState,
): number {
  const shape = TRAVEL_SHAPE[mode];
  const walks = fillStationWalks(x, y, state, shape);
  let total = 0;
  for (let j = 0; j < state.opportunities.length; j++) {
    const t = travelTimeWithWalks(x, y, j, state, shape, walks);
    const impedance =
      mode === 'exponential'
        ? Math.exp(-state.beta * t)
        : 1 -
          smoothstep(
            state.tau - INDICATOR_SOFTNESS,
            state.tau + INDICATOR_SOFTNESS,
            t,
          );
    total += state.opportunities[j].weight * impedance;
  }
  return total;
}

/**
 * World-space height per unit of accessibility. Calibrated by sampling the
 * model over time: peaks reach ~8.5 (exponential) and ~14.5 (cumulative), so
 * both surfaces top out around MAX_HEIGHT.
 */
export const MAX_HEIGHT = 2.6;
export const HEIGHT_SCALE: Record<SurfaceMode, number> = {
  exponential: MAX_HEIGHT / 8.5,
  cumulative: MAX_HEIGHT / 14.5,
};

export interface Peak {
  x: number;
  y: number;
  /** Accessibility at the peak (model units, before any height mapping). */
  value: number;
}

const PEAK_START_STEP = 0.2;
const PEAK_MIN_STEP = 0.02;
const PEAK_DIRECTIONS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7071, 0.7071],
  [-0.7071, 0.7071],
  [0.7071, -0.7071],
  [-0.7071, -0.7071],
];

/**
 * For each anchor (a fixed place such as a destination or a station), the
 * summit of the hill it sits on, found by hill-climbing from the anchor.
 * `null` when the climb leaves `maxDistance`: the anchor is on the flank of
 * some other peak rather than on a peak of its own.
 *
 * Pass last frame's result as `previous` to warm-start: summits move only a
 * hair per frame, so each climb then needs a few fine steps instead of a
 * full search.
 */
export function findPeaks(
  mode: SurfaceMode,
  state: ModelState,
  anchors: ReadonlyArray<{ x: number; y: number }>,
  maxDistance: number,
  previous?: ReadonlyArray<Peak | null>,
): Array<Peak | null> {
  return anchors.map((anchor, i) => {
    const warm = previous?.[i];
    let x = warm?.x ?? anchor.x;
    let y = warm?.y ?? anchor.y;
    let value = accessibility(x, y, mode, state);
    let step = warm ? PEAK_MIN_STEP : PEAK_START_STEP;
    while (step >= PEAK_MIN_STEP) {
      let moved = false;
      for (const [dx, dy] of PEAK_DIRECTIONS) {
        const nx = x + dx * step;
        const ny = y + dy * step;
        const next = accessibility(nx, ny, mode, state);
        if (next > value) {
          x = nx;
          y = ny;
          value = next;
          moved = true;
        }
      }
      if (Math.hypot(x - anchor.x, y - anchor.y) > maxDistance) return null;
      if (!moved) step *= 0.5;
    }
    // The search above lands on a coarse grid, which jitters from frame to
    // frame; a parabola through each axis' neighbors finds the true top.
    const h = PEAK_MIN_STEP;
    const vertex = (minus: number, plus: number): number => {
      const curvature = minus - 2 * value + plus;
      if (curvature >= 0) return 0;
      return Math.max(-1, Math.min(1, (minus - plus) / (2 * curvature))) * h;
    };
    x += vertex(
      accessibility(x - h, y, mode, state),
      accessibility(x + h, y, mode, state),
    );
    y += vertex(
      accessibility(x, y - h, mode, state),
      accessibility(x, y + h, mode, state),
    );
    return { x, y, value: accessibility(x, y, mode, state) };
  });
}
