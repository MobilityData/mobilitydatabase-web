import demo from '../../GtfsDiffTool/data/v2/mbta-pathways-demo/pathways-diff.json';
import type { PathwaysDiff, StationPathwaysDiff } from './pathways-types';
import {
  analyzeStation,
  explainCell,
  formatDuration,
  pathwaySeconds,
} from './pathways-utils';
import { layoutSchematic } from './pathways-layout';

const diff = demo as unknown as PathwaysDiff;

function station(id: string): StationPathwaysDiff {
  const s = diff.stations.find((x) => x.station_id === id);
  if (s == null) throw new Error(`missing ${id}`);
  return s;
}

describe('pathwaySeconds', () => {
  it('prefers traversal_time, then estimates by mode', () => {
    expect(
      pathwaySeconds({ pathway_mode: '5', traversal_time: '36' }, false),
    ).toEqual({ seconds: 36, estimated: false });
    expect(
      pathwaySeconds({ pathway_mode: '1', length: '12' }, false).seconds,
    ).toBeCloseTo(10);
    expect(
      pathwaySeconds({ pathway_mode: '2', stair_count: '-30' }, false).seconds,
    ).toBeCloseTo(18);
    expect(pathwaySeconds({ pathway_mode: '6' }, false)).toEqual({
      seconds: 5,
      estimated: true,
    });
  });

  it('uses wheelchair_* values for step-free routing', () => {
    const row = {
      pathway_mode: '1',
      traversal_time: '30',
      wheelchair_traversal_time: '50',
    };
    expect(pathwaySeconds(row, true).seconds).toBe(50);
    expect(pathwaySeconds(row, false).seconds).toBe(30);
  });
});

describe('formatDuration', () => {
  it('formats seconds and minutes', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(110)).toBe('1 min 50 s');
    expect(formatDuration(120)).toBe('2 min');
  });
});

describe('analyzeStation on the MBTA demo', () => {
  it('Broadway: main entrance loses step-free access, Traveler St gains it', () => {
    const a = analyzeStation(station('place-brdwy'));
    const sf = a.matrices.step_free;
    expect(sf.entrances).toEqual(['door-brdwy-main', 'door-brdwy-traveler']);
    expect(sf.platforms).toEqual(['70082', '70081']); // Alewife, Ashmont/Braintree
    const change = (e: string): string[] =>
      sf.cells.filter((c) => c.entrance === e).map((c) => c.change);
    expect(change('door-brdwy-main')).toEqual(['lost', 'lost']);
    expect(change('door-brdwy-traveler')).toEqual(['gained', 'gained']);

    const lost = sf.cells[0];
    expect(explainCell(lost, 'step_free', a.labels).text).toMatch(
      /Elevator 868 was removed/,
    );
    const gained = sf.cells[2];
    expect(explainCell(gained, 'step_free', a.labels).text).toMatch(
      /via new .*Elevator 901/,
    );

    // The longer corridor to the Traveler St stairs slows the fastest route.
    const fastest = a.matrices.fastest.cells.filter(
      (c) => c.entrance === 'door-brdwy-traveler',
    );
    expect(fastest.map((c) => c.change)).toEqual(['slower', 'slower']);
    expect(fastest[0].deltaS).toBeCloseTo((48.768 - 15.5448) / 1.2, 1);

    expect(a.summary.badges.map((b) => b.label)).toEqual([
      'Step-free access lost',
      'Step-free access gained',
      'New elevator',
      'Elevator removed',
      'Slower walk',
      'Signage changed',
      'Level renamed',
    ]);
    expect(a.summary.links).toMatchObject({
      added: 3,
      deleted: 1,
      modified: 2,
      restructured: 2,
    });
  });

  it('labels generic nodes by the facility attached to them', () => {
    const { labels } = analyzeStation(station('place-brdwy'));
    expect(labels.get('node-867-lobby')?.title).toBe('Elevator 867');
    expect(labels.get('node-brdwy-farepaid')?.title).toBe(
      'Fare gates · paid side',
    );
    expect(labels.get('node-brdwy-fareunpaid')?.title).toBe(
      'Fare gates · unpaid side',
    );
    expect(labels.get('70081')?.title).toBe('Ashmont/Braintree');
    expect(labels.get('door-brdwy-traveler')).toMatchObject({
      kind: 'entrance',
      title: 'Traveler St',
    });
  });

  it('Savin Hill: id-only changes are not rider-visible', () => {
    const a = analyzeStation(station('place-shmnl'));
    expect(a.summary.riderVisible).toBe(false);
    expect(a.summary.badges.map((b) => b.label)).toEqual([
      'No rider-visible change',
    ]);
    expect(
      a.matrices.fastest.cells.every((c) => c.change === 'unchanged'),
    ).toBe(true);
  });

  it('Union Square: signage only, routes unchanged', () => {
    const a = analyzeStation(station('place-unsqu'));
    expect(a.summary.badges.map((b) => b.label)).toEqual(['Signage changed']);
  });

  it('Davis: slower elevator shows up as slower step-free routes', () => {
    const a = analyzeStation(station('place-davis'));
    const slower = a.matrices.step_free.cells.filter(
      (c) => c.change === 'slower',
    );
    expect(slower.length).toBeGreaterThan(0);
    expect(slower.every((c) => Math.round(c.deltaS ?? 0) === 15)).toBe(true);
  });
});

describe('layoutSchematic', () => {
  it('stacks levels by level_index and keeps nodes from overlapping', () => {
    const a = analyzeStation(station('place-brdwy'));
    const layout = layoutSchematic(a.station, a.labels);
    expect(layout.bands.map((b) => b.levelId)).toEqual([
      'level_in_street',
      'level_-1_lobby',
      'level_-2_platform',
    ]);
    for (const band of layout.bands) {
      const xs = layout.nodes
        .filter((n) => n.band === band.index)
        .map((n) => n.x)
        .sort((x, y) => x - y);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(layout.nodeWidth);
      }
    }
    expect(layout.nodes).toHaveLength(a.station.nodes.length);
  });
});
