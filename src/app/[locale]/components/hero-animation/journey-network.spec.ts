import { readFileSync } from 'fs';
import { resolve } from 'path';
import { simplify, straightenNetwork } from './journey-network';
import { type LonLat, type MontrealJourneyData } from './montreal-journey';

// Same local metric plane as journey-network, so fixtures read in metres.
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((45.5 * Math.PI) / 180);
const ORIGIN: LonLat = [-73.6, 45.5];

/** Metres east / north of ORIGIN, as lon/lat. */
const m = (x: number, y: number): LonLat => [
  ORIGIN[0] + x / M_PER_DEG_LON,
  ORIGIN[1] + y / M_PER_DEG_LAT,
];
const toM = ([lon, lat]: LonLat): [number, number] => [
  (lon - ORIGIN[0]) * M_PER_DEG_LON,
  (lat - ORIGIN[1]) * M_PER_DEG_LAT,
];

/** Distance in metres from `point` to the polyline. */
function distanceToLine(line: LonLat[], point: LonLat): number {
  const [px, py] = toM(point);
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = toM(line[i]);
    const [bx, by] = toM(line[i + 1]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.min(
      Math.max(((px - ax) * dx + (py - ay) * dy) / len2, 0),
      1,
    );
    best = Math.min(best, Math.hypot(ax + t * dx - px, ay + t * dy - py));
  }
  return best;
}

const distanceM = (a: LonLat, b: LonLat): number => {
  const [ax, ay] = toM(a);
  const [bx, by] = toM(b);
  return Math.hypot(ax - bx, ay - by);
};

/** Largest change of direction between consecutive segments, in degrees. */
function sharpestTurn(line: LonLat[]): number {
  let worst = 0;
  for (let i = 1; i < line.length - 1; i++) {
    const [ax, ay] = toM(line[i - 1]);
    const [bx, by] = toM(line[i]);
    const [cx, cy] = toM(line[i + 1]);
    const a = Math.atan2(by - ay, bx - ax);
    const b = Math.atan2(cy - by, cx - bx);
    const turn = Math.abs(((b - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    worst = Math.max(worst, (turn * 180) / Math.PI);
  }
  return worst;
}

/** No segment-to-segment kink sharper than this: every corner is an arc. */
const MAX_KINK_DEG = 12;
/** Stations sit on their lines to well within a station disc (50 m). */
const ON_LINE_M = 0.1;

/**
 * Line A runs east with small wiggles, a real 700 m detour between T and A3
 * and a tail past its last station. Line B runs north through the shared
 * station T. Stations sit up to 40 m off their shapes, as in the real feed.
 */
function makeData(): MontrealJourneyData {
  return {
    lines: [
      {
        id: 'A',
        name: 'A',
        color: '#d95700',
        path: [
          m(0, 0),
          m(300, 8),
          m(600, -6),
          m(1000, 0),
          m(1300, 9),
          m(1500, 700),
          m(1700, 0),
          m(2000, 0),
          m(2300, 0),
        ],
      },
      {
        id: 'B',
        name: 'B',
        color: '#00b300',
        path: [m(1005, -1000), m(1005, 0), m(1005, 1000)],
      },
    ],
    stations: [
      { id: 'A1', name: 'A1', point: m(0, 20), lines: ['A'] },
      { id: 'T', name: 'T', point: m(1010, 30), lines: ['A', 'B'] },
      { id: 'A3', name: 'A3', point: m(2000, -40), lines: ['A'] },
      { id: 'B1', name: 'B1', point: m(980, -1000), lines: ['B'] },
      { id: 'B2', name: 'B2', point: m(1030, 1000), lines: ['B'] },
    ],
    docks: [],
    journey: {
      bike: {
        from: {
          name: 'start',
          point: m(-500, 0),
          capacity: 10,
          bikesAvailable: 7,
        },
        to: { name: 'end', point: m(0, 20), capacity: 10 },
        distanceM: 500,
        path: [m(-498, 2), m(-250, 0), m(-2, 18)],
      },
      metro: [
        // Travels against the line's own direction.
        { line: 'A', from: 'A3', to: 'T', path: [], stations: ['A3', 'T'] },
      ],
      alert: { line: 'A', station: 'T', point: m(1010, 30) },
    },
  };
}

describe('simplify', () => {
  it('keeps the ends and drops points within the tolerance', () => {
    const line: Array<[number, number]> = [
      [0, 0],
      [50, 3],
      [100, 0],
    ];
    expect(simplify(line, 5)).toEqual([
      [0, 0],
      [100, 0],
    ]);
    expect(simplify(line, 1)).toEqual(line);
  });
});

describe('straightenNetwork', () => {
  const data = makeData();
  const out = straightenNetwork(data);
  const line = (id: string): LonLat[] =>
    out.lines.find((l) => l.id === id)?.path ?? [];
  const station = (id: string): LonLat =>
    out.stations.find((s) => s.id === id)?.point ?? [0, 0];

  it('puts every station on each of its lines', () => {
    for (const s of out.stations) {
      for (const id of s.lines) {
        expect(distanceToLine(line(id), s.point)).toBeLessThan(ON_LINE_M);
      }
    }
  });

  it('gives a transfer station one point that both lines pass through', () => {
    const t = station('T');
    expect(distanceToLine(line('A'), t)).toBeLessThan(ON_LINE_M);
    expect(distanceToLine(line('B'), t)).toBeLessThan(ON_LINE_M);
  });

  it('flattens small wiggles into one straight run', () => {
    // Line A's first stretch, clear of the bend at T, is a single straight.
    const early = line('A').filter((p) => toM(p)[0] < 400);
    expect(early.length).toBeGreaterThan(0);
    for (const p of early) {
      expect(distanceToLine([station('A1'), station('T')], p)).toBeLessThan(1);
    }
  });

  it('keeps real bends, as rounded curves', () => {
    expect(Math.max(...line('A').map((p) => toM(p)[1]))).toBeGreaterThan(300);
    for (const l of out.lines) {
      expect(sharpestTurn(l.path)).toBeLessThan(MAX_KINK_DEG);
    }
  });

  it('trims each line to its terminal stations', () => {
    const a = line('A');
    expect(distanceM(a[0], station('A1'))).toBeLessThan(ON_LINE_M);
    expect(distanceM(a[a.length - 1], station('A3'))).toBeLessThan(ON_LINE_M);
    const b = line('B');
    expect(distanceM(b[0], station('B1'))).toBeLessThan(ON_LINE_M);
    expect(distanceM(b[b.length - 1], station('B2'))).toBeLessThan(ON_LINE_M);
  });

  it('slices legs from the new line, in travel order', () => {
    const [leg] = out.journey.metro;
    expect(distanceM(leg.path[0], station('A3'))).toBeLessThan(ON_LINE_M);
    expect(distanceM(leg.path[leg.path.length - 1], station('T'))).toBeLessThan(
      ON_LINE_M,
    );
  });

  it('pins the ride to its docks and the alert to its station', () => {
    const { bike, alert } = out.journey;
    expect(bike.path[0]).toEqual(bike.from.point);
    expect(bike.path[bike.path.length - 1]).toEqual(bike.to.point);
    expect(alert.point).toEqual(station('T'));
  });

  it('does not mutate its input', () => {
    expect(data).toEqual(makeData());
  });
});

describe('straightenNetwork on the shipped data', () => {
  const raw = JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'public/hero-animation/montreal-journey.json'),
      'utf8',
    ),
  ) as MontrealJourneyData;
  const out = straightenNetwork(raw);

  it('puts every STM station on its lines', () => {
    for (const s of out.stations) {
      for (const id of s.lines) {
        const path = out.lines.find((l) => l.id === id)?.path ?? [];
        expect(distanceToLine(path, s.point)).toBeLessThan(ON_LINE_M);
      }
    }
  });

  it('draws every line and leg without sharp corners', () => {
    for (const path of [
      ...out.lines.map((l) => l.path),
      ...out.journey.metro.map((l) => l.path),
    ]) {
      expect(sharpestTurn(path)).toBeLessThan(MAX_KINK_DEG);
    }
  });

  it('keeps stations near their real positions', () => {
    // The default tolerance and bend radius move none further than ~300 m.
    raw.stations.forEach((s, i) => {
      expect(distanceM(s.point, out.stations[i].point)).toBeLessThan(350);
    });
  });
});
