import { compactServiceSets, expandServiceSets } from './trips-index-codec';

const doc = {
  dates: { '20261012': [0, 1] },
  service_sets: {
    base: [['WKD', 'SAT'], ['WKD']],
    new: [['WKD'], ['SUN', 'WKD'], []],
  },
};

describe('trips index service sets', () => {
  it('stores each service_id once and the sets as indices', () => {
    const compact = compactServiceSets(doc);
    expect(compact.service_ids).toEqual(['SAT', 'SUN', 'WKD']);
    expect(compact.service_sets).toEqual({
      base: [[2, 0], [2]],
      new: [[2], [1, 2], []],
    });
    expect(compact.dates).toBe(doc.dates);
  });

  it('expands back to the original sets, in their order', () => {
    const round = expandServiceSets(compactServiceSets(doc));
    expect(round).toEqual(doc);
    expect('service_ids' in round).toBe(false);
  });

  it('returns an index written before the encoding unchanged', () => {
    expect(expandServiceSets(doc)).toBe(doc);
  });
});
