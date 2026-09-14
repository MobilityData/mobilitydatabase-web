import {
  type DateRange,
  daysBetween,
  findGapSpans,
  placeDateOnAxis,
  placeRangeOnAxis,
} from './timeline';

const axis: DateRange = { start: '2026-01-01', end: '2026-01-11' };

describe('daysBetween', () => {
  it('counts whole days between two dates', () => {
    expect(daysBetween('2026-01-01', '2026-01-11')).toBe(10);
  });

  it('returns a negative count when the range runs backwards', () => {
    expect(daysBetween('2026-01-11', '2026-01-01')).toBe(-10);
  });

  it('is unaffected by daylight saving transitions', () => {
    // North American DST starts on 2026-03-08.
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });
});

describe('placeDateOnAxis', () => {
  it('places the axis bounds at 0 and 100 percent', () => {
    expect(placeDateOnAxis('2026-01-01', axis)).toBe(0);
    expect(placeDateOnAxis('2026-01-11', axis)).toBe(100);
  });

  it('places an interior date proportionally', () => {
    expect(placeDateOnAxis('2026-01-06', axis)).toBe(50);
  });

  it('clamps dates outside the axis', () => {
    expect(placeDateOnAxis('2025-12-01', axis)).toBe(0);
    expect(placeDateOnAxis('2026-02-01', axis)).toBe(100);
  });

  it('returns 0 for a degenerate axis instead of dividing by zero', () => {
    expect(
      placeDateOnAxis('2026-01-01', { start: '2026-01-01', end: '2026-01-01' }),
    ).toBe(0);
  });
});

describe('findGapSpans', () => {
  it('treats back-to-back datasets as continuous', () => {
    // v1 ends Aug 31, v2 starts Sept 1 — the one-day step is not a gap.
    expect(
      findGapSpans([
        { start: '2026-01-01', end: '2026-08-31' },
        { start: '2026-09-01', end: '2026-12-31' },
      ]),
    ).toEqual([]);
  });

  it('reports a span bridging the two datasets when service is missing', () => {
    expect(
      findGapSpans([
        { start: '2026-01-01', end: '2026-04-14' },
        { start: '2026-05-15', end: '2026-07-19' },
      ]),
    ).toEqual([{ start: '2026-04-14', end: '2026-05-15' }]);
  });

  it('finds every gap across several datasets', () => {
    expect(
      findGapSpans([
        { start: '2026-01-01', end: '2026-02-01' },
        { start: '2026-03-01', end: '2026-04-01' },
        { start: '2026-05-01', end: '2026-06-01' },
      ]),
    ).toEqual([
      { start: '2026-02-01', end: '2026-03-01' },
      { start: '2026-04-01', end: '2026-05-01' },
    ]);
  });

  it('returns nothing for a single dataset or none at all', () => {
    expect(findGapSpans([{ start: '2026-01-01', end: '2026-08-14' }])).toEqual(
      [],
    );
    expect(findGapSpans([])).toEqual([]);
  });
});

describe('placeRangeOnAxis', () => {
  it('returns the left offset and width of a range', () => {
    expect(placeRangeOnAxis({ start: '2026-01-03', end: '2026-01-08' }, axis)) //
      .toEqual({ leftPercent: 20, widthPercent: 50 });
  });

  it('collapses a range that ends before the axis begins', () => {
    expect(
      placeRangeOnAxis({ start: '2025-11-01', end: '2025-12-01' }, axis),
    ).toEqual({ leftPercent: 0, widthPercent: 0 });
  });

  it('collapses an inverted range rather than returning a negative width', () => {
    expect(
      placeRangeOnAxis({ start: '2026-01-08', end: '2026-01-03' }, axis),
    ).toEqual({ leftPercent: 70, widthPercent: 0 });
  });

  it('rounds percentages to two decimals for stable markup', () => {
    const { leftPercent } = placeRangeOnAxis(
      { start: '2026-01-02', end: '2026-01-05' },
      { start: '2026-01-01', end: '2026-01-04' },
    );
    expect(leftPercent).toBe(33.33);
  });
});
