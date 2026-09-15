import {
  type DateRange,
  anchorBandToBar,
  daysBetween,
  findGapSpans,
  placeAnnotationOnAxis,
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

describe('anchorBandToBar', () => {
  // A dataset covering the left half of the axis.
  const bar = { leftPercent: 10, widthPercent: 40 };

  it('grows a band inwards from the end of the bar it sits on', () => {
    // The overlap is the bar's last day, so growing rightwards would leave it
    // hanging off the end.
    expect(anchorBandToBar({ leftPercent: 50, widthPercent: 0 }, bar)).toBe(
      'end',
    );
  });

  it('grows a band at the start of the bar rightwards, into it', () => {
    expect(anchorBandToBar({ leftPercent: 10, widthPercent: 0 }, bar)).toBe(
      'start',
    );
  });

  it('grows a band inside the bar rightwards', () => {
    expect(anchorBandToBar({ leftPercent: 20, widthPercent: 10 }, bar)).toBe(
      'start',
    );
  });

  it('grows a band beyond the bar back towards it', () => {
    // A gap drawn past the end of the older dataset.
    expect(anchorBandToBar({ leftPercent: 60, widthPercent: 5 }, bar)).toBe(
      'end',
    );
  });
});

describe('placeAnnotationOnAxis', () => {
  /** The box the annotation is centred in, as [left, right] on the track. */
  const boxFor = (center: number): [number, number] => {
    const { paddingLeftPercent, paddingRightPercent } =
      placeAnnotationOnAxis(center);
    return [paddingLeftPercent, 100 - paddingRightPercent];
  };

  it('centres an annotation under a span in the middle of the track', () => {
    expect(placeAnnotationOnAxis(50)).toEqual({
      flexDirection: 'row',
      paddingLeftPercent: 0,
      paddingRightPercent: 0,
    });
    // Inset on the left by as much as the right has to spare, so the box it
    // is centred in has its own centre at 60%.
    expect(placeAnnotationOnAxis(60)).toEqual({
      flexDirection: 'row-reverse',
      paddingLeftPercent: 20,
      paddingRightPercent: 0,
    });
    expect(placeAnnotationOnAxis(40)).toEqual({
      flexDirection: 'row',
      paddingLeftPercent: 0,
      paddingRightPercent: 20,
    });
  });

  it('centres on a span near either end too, in a box that still fits', () => {
    // The box is centred on the span wherever the span falls, so the chip is
    // centred on it rather than hung off one of its ends.
    for (const center of [5, 10, 25, 33, 50, 67, 75, 90, 95]) {
      const [left, right] = boxFor(center);
      expect((left + right) / 2).toBeCloseTo(center, 5);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(100);
    }
  });

  it('falls back against the near edge, which is where the row starts', () => {
    // A chip too wide for its box is centred `safe`ly, which aligns it to the
    // start of the row instead of overflowing - so the row has to start at
    // the edge the chip should rest against.
    expect(placeAnnotationOnAxis(10).flexDirection).toBe('row');
    expect(placeAnnotationOnAxis(95).flexDirection).toBe('row-reverse');
  });

  it('never pads past the track, whatever it is handed', () => {
    expect(placeAnnotationOnAxis(0)).toEqual({
      flexDirection: 'row',
      paddingLeftPercent: 0,
      paddingRightPercent: 100,
    });
    expect(placeAnnotationOnAxis(140)).toEqual({
      flexDirection: 'row-reverse',
      paddingLeftPercent: 100,
      paddingRightPercent: 0,
    });
  });
});
