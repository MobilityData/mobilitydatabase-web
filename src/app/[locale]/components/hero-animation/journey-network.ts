import { type LonLat, type MontrealJourneyData } from './montreal-journey';

// Redraws the real STM network the way a metro map does, while keeping its
// geography: each line becomes a few long straight runs joined by rounded
// bends, and every station sits exactly on its lines (a transfer station on
// all of them, at one shared point). Pure, so it can be unit-tested; the raw
// GTFS geometry stays in the JSON.
//
//   1. Snap: each station moves onto its GTFS shape; transfer stations take
//      the average of their projections.
//   2. Straighten: each line is simplified hard into long runs. Terminals and
//      transfer stations stay pinned, so lines still meet where they should.
//   3. Round: every corner becomes a circular arc. Where a line bends at a
//      transfer station, the corner is pushed outward by exactly as much as
//      the arc cuts inside it, so the arc still passes through the station.
//   4. Place: the remaining stations are projected onto the finished curves.

export interface NetworkOptions {
  /**
   * Douglas-Peucker tolerance, in metres. Bends that stray less than this
   * from a straight run are flattened into it; larger ones become corners.
   */
  runTolerance?: number;
  /** Radius of the rounded bends, in metres (shrunk to fit short runs). */
  bendRadius?: number;
}

export const DEFAULT_NETWORK_OPTIONS: Required<NetworkOptions> = {
  runTolerance: 320,
  bendRadius: 1100,
};

/** Straight segments per rounded bend; even, so the arc's midpoint is a vertex. */
const ARC_SEGMENTS = 16;
/** A corner may use at most this share of each adjoining run for its bend. */
const MAX_TANGENT_SHARE = 0.48;
/** Turns smaller than this (radians) are treated as straight. */
const MIN_TURN = 1e-4;
/** Passes to settle corners pushed out around transfer stations. */
const PIN_ITERATIONS = 8;

// Local metric plane around Montréal; accurate to well under a metre over the
// few kilometres a run spans.
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((45.5 * Math.PI) / 180);

type Metres = [number, number];

const toMetres = ([lon, lat]: LonLat): Metres => [
  lon * M_PER_DEG_LON,
  lat * M_PER_DEG_LAT,
];
const toLonLat = ([x, y]: Metres): LonLat => [
  x / M_PER_DEG_LON,
  y / M_PER_DEG_LAT,
];

const sub = (a: Metres, b: Metres): Metres => [a[0] - b[0], a[1] - b[1]];
const add = (a: Metres, b: Metres, scale = 1): Metres => [
  a[0] + b[0] * scale,
  a[1] + b[1] * scale,
];
const length = (v: Metres): number => Math.hypot(v[0], v[1]);
const unit = (v: Metres): Metres => {
  const len = length(v) || 1;
  return [v[0] / len, v[1] / len];
};
const samePoint = (a: Metres, b: Metres): boolean => length(sub(a, b)) < 1e-6;
const average = (points: Metres[]): Metres => [
  points.reduce((sum, p) => sum + p[0], 0) / points.length,
  points.reduce((sum, p) => sum + p[1], 0) / points.length,
];

interface Projected {
  /** Segment index plus the 0..1 position within it. */
  at: number;
  point: Metres;
}

/** Closest point on the polyline to `p`. */
function project(line: Metres[], [px, py]: Metres): Projected {
  let best = { at: 0, point: line[0], distance: Infinity };
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.min(
      Math.max(((px - ax) * dx + (py - ay) * dy) / len2, 0),
      1,
    );
    const point: Metres = [ax + t * dx, ay + t * dy];
    const distance = length(sub(point, [px, py]));
    if (distance < best.distance) best = { at: i + t, point, distance };
  }
  return { at: best.at, point: best.point };
}

/** The part of `line` between positions `from` and `to` (as from project). */
function slice(line: Metres[], from: number, to: number): Metres[] {
  const at = (pos: number): Metres => {
    const i = Math.min(Math.floor(pos), line.length - 2);
    const t = pos - i;
    return add(line[i], sub(line[i + 1], line[i]), t);
  };
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  const out: Metres[] = [at(lo)];
  for (let i = Math.floor(lo) + 1; i <= Math.ceil(hi) - 1; i++) {
    out.push(line[i]);
  }
  out.push(at(hi));
  const clean = out.filter((p, i) => i === 0 || !samePoint(p, out[i - 1]));
  return from <= to ? clean : clean.reverse();
}

/** Douglas-Peucker; the first and last points are always kept. */
export function simplify(line: Metres[], tolerance: number): Metres[] {
  if (line.length < 3) return line;
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, line.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    const [ax, ay] = line[first];
    const [bx, by] = line[last];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let maxD = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = line[i];
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (index !== -1 && maxD > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return line.filter((_, i) => keep[i] === 1);
}

/** How a corner is rounded: tangent points, arc centre and how far it cuts in. */
interface Corner {
  turn: number;
  /** Unit vector from the corner toward the inside of the bend. */
  inward: Metres;
  /** Distance from the corner to the arc's midpoint. */
  cut: number;
  start: Metres;
  end: Metres;
  centre: Metres;
  radius: number;
  /** +1 for a left turn, -1 for a right turn. */
  side: number;
}

function corner(
  before: Metres,
  at: Metres,
  after: Metres,
  radius: number,
): Corner | null {
  const inDir = unit(sub(at, before));
  const outDir = unit(sub(after, at));
  const dot = Math.min(
    Math.max(inDir[0] * outDir[0] + inDir[1] * outDir[1], -1),
    1,
  );
  const turn = Math.acos(dot);
  if (turn < MIN_TURN || turn > Math.PI - MIN_TURN) return null;
  const half = turn / 2;
  // Shrink the bend on short runs, so neighbouring bends never overlap.
  const room =
    Math.min(length(sub(at, before)), length(sub(after, at))) *
    MAX_TANGENT_SHARE;
  const tangent = Math.min(radius * Math.tan(half), room);
  const r = tangent / Math.tan(half);
  const side = inDir[0] * outDir[1] - inDir[1] * outDir[0] > 0 ? 1 : -1;
  const normal: Metres = [-inDir[1] * side, inDir[0] * side];
  const start = add(at, inDir, -tangent);
  return {
    turn,
    inward: unit(sub(outDir, inDir)),
    cut: r / Math.cos(half) - r,
    start,
    end: add(at, outDir, tangent),
    centre: add(start, normal, r),
    radius: r,
    side,
  };
}

/** The polyline with every corner replaced by a circular arc. */
function roundCorners(points: Metres[], radius: number): Metres[] {
  if (points.length < 3) return points;
  const out: Metres[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const c = corner(points[i - 1], points[i], points[i + 1], radius);
    if (!c) {
      out.push(points[i]);
      continue;
    }
    const from = Math.atan2(c.start[1] - c.centre[1], c.start[0] - c.centre[0]);
    for (let k = 0; k <= ARC_SEGMENTS; k++) {
      const angle = from + (c.side * c.turn * k) / ARC_SEGMENTS;
      out.push([
        c.centre[0] + c.radius * Math.cos(angle),
        c.centre[1] + c.radius * Math.sin(angle),
      ]);
    }
  }
  out.push(points[points.length - 1]);
  return out.filter((p, i) => i === 0 || !samePoint(p, out[i - 1]));
}

export function straightenNetwork(
  data: MontrealJourneyData,
  options: NetworkOptions = {},
): MontrealJourneyData {
  const { runTolerance, bendRadius } = {
    ...DEFAULT_NETWORK_OPTIONS,
    ...options,
  };
  const shapes = new Map(
    data.lines.map((line) => [line.id, line.path.map(toMetres)]),
  );
  const isTransfer = new Set(
    data.stations.filter((s) => s.lines.length > 1).map((s) => s.id),
  );

  // 1. Snap. `stops` lists each line's stations in order along its shape.
  const projections = new Map<string, Map<string, Projected>>();
  for (const station of data.stations) {
    const byLine = new Map<string, Projected>();
    for (const lineId of station.lines) {
      const shape = shapes.get(lineId);
      if (shape) byLine.set(lineId, project(shape, toMetres(station.point)));
    }
    if (byLine.size > 0) projections.set(station.id, byLine);
  }
  const anchors = new Map(
    [...projections].map(([id, byLine]) => [
      id,
      average([...byLine.values()].map((p) => p.point)),
    ]),
  );
  const stopsOf = (lineId: string): Array<{ id: string; at: number }> =>
    data.stations
      .flatMap((s) => {
        const at = projections.get(s.id)?.get(lineId)?.at;
        return at === undefined ? [] : [{ id: s.id, at }];
      })
      .sort((a, b) => a.at - b.at);

  // 2. Straighten: control points per line, with the pinned stations' ids.
  interface Control {
    points: Metres[];
    /** Station id for each pinned control point, else null. */
    pins: Array<string | null>;
  }
  const controls = new Map<string, Control>();
  for (const line of data.lines) {
    const shape = shapes.get(line.id) ?? [];
    const stops = stopsOf(line.id);
    if (stops.length < 2) continue;
    // The shape from terminal to terminal, through every station.
    const path: Metres[] = [];
    const pinAt = new Map<number, string>();
    stops.forEach((stop, k) => {
      if (k > 0) {
        const between = shape.filter(
          (_, i) => i > stops[k - 1].at && i < stop.at,
        );
        path.push(...between);
      }
      const last = k === 0 || k === stops.length - 1;
      if (last || isTransfer.has(stop.id)) pinAt.set(path.length, stop.id);
      path.push(anchors.get(stop.id) as Metres);
    });
    // Simplify between pins, so each pin stays a control point.
    const pinIndices = [...pinAt.keys()];
    const points: Metres[] = [path[0]];
    const pins: Array<string | null> = [pinAt.get(0) ?? null];
    for (let k = 1; k < pinIndices.length; k++) {
      const run = simplify(
        path.slice(pinIndices[k - 1], pinIndices[k] + 1),
        runTolerance,
      );
      run.slice(1).forEach((point, j) => {
        points.push(point);
        pins.push(
          j === run.length - 2 ? (pinAt.get(pinIndices[k]) ?? null) : null,
        );
      });
    }
    controls.set(line.id, { points, pins });
  }

  // 3. Round. A line bending at a transfer station gets its corner pushed
  // outward so the arc's midpoint lands on the station. Neighbouring corners
  // move the bend slightly, so settle it over a few passes.
  for (let pass = 0; pass < PIN_ITERATIONS; pass++) {
    for (const { points, pins } of controls.values()) {
      for (let i = 1; i < points.length - 1; i++) {
        const id = pins[i];
        if (id === null) continue;
        const anchor = anchors.get(id) as Metres;
        const c = corner(points[i - 1], points[i], points[i + 1], bendRadius);
        points[i] = c ? add(anchor, c.inward, -c.cut) : anchor;
      }
    }
  }
  const curves = new Map(
    [...controls].map(([id, { points }]) => [
      id,
      roundCorners(points, bendRadius),
    ]),
  );

  // 4. Place every station on its finished line(s).
  const stationPoints = new Map<string, Metres>();
  for (const station of data.stations) {
    const anchor = anchors.get(station.id);
    if (!anchor) continue;
    const onLines = station.lines.flatMap((id) => {
      const curve = curves.get(id);
      return curve ? [project(curve, anchor).point] : [];
    });
    stationPoints.set(station.id, onLines.length ? average(onLines) : anchor);
  }

  const lines = data.lines.map((line) => {
    const curve = curves.get(line.id);
    return curve ? { ...line, path: curve.map(toLonLat) } : line;
  });

  const stationPoint = (id: string, fallback: LonLat): LonLat => {
    const point = stationPoints.get(id);
    return point ? toLonLat(point) : fallback;
  };

  // Legs are the finished line between their two stations, in travel order.
  const metro = data.journey.metro.map((leg) => {
    const curve = curves.get(leg.line);
    const from = stationPoints.get(leg.from);
    const to = stationPoints.get(leg.to);
    if (!curve || !from || !to) return leg;
    return {
      ...leg,
      path: slice(curve, project(curve, from).at, project(curve, to).at).map(
        toLonLat,
      ),
    };
  });

  // The ride starts and ends exactly on its docks.
  const { bike } = data.journey;
  const bikePath = bike.path.slice();
  bikePath[0] = bike.from.point;
  bikePath[bikePath.length - 1] = bike.to.point;

  return {
    ...data,
    lines,
    stations: data.stations.map((s) => ({
      ...s,
      point: stationPoint(s.id, s.point),
    })),
    journey: {
      ...data.journey,
      bike: { ...bike, path: bikePath },
      metro,
      alert: {
        ...data.journey.alert,
        point: stationPoint(
          data.journey.alert.station,
          data.journey.alert.point,
        ),
      },
    },
  };
}
