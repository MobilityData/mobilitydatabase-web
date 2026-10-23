import { nextWindow, spanHeight, type RowWindowInput } from './row-window';

/** 100-row segments of 3,000 px in a 600 px viewport. */
function input(over: Partial<RowWindowInput>): RowWindowInput {
  return {
    current: { first: 0, last: 0 },
    heights: [],
    segmentCount: 50,
    segmentRows: 100,
    scrollTop: 0,
    viewportHeight: 600,
    aheadPx: 1200,
    evictMarginPx: 4000,
    maxRenderedRows: 1000,
    ...over,
  };
}

const measured = (n: number): number[] => new Array<number>(n).fill(3000);

describe('nextWindow', () => {
  it('starts with the first segment', () => {
    expect(nextWindow(input({}))).toEqual({ first: 0, last: 0 });
  });

  it('loads the next segment when scrolling near the end of what is loaded', () => {
    // Bottom of the view (2,400 + 600 + 1,200 ahead) passes the 3,000 px of segment 0.
    expect(
      nextWindow(input({ heights: measured(1), scrollTop: 2400 })),
    ).toEqual({ first: 0, last: 1 });
    // Far from the end: nothing to load.
    expect(nextWindow(input({ heights: measured(1), scrollTop: 0 }))).toEqual({
      first: 0,
      last: 0,
    });
  });

  it('keeps everything while under the row budget', () => {
    expect(
      nextWindow(
        input({
          current: { first: 0, last: 8 },
          heights: measured(9),
          scrollTop: 26000,
        }),
      ),
    ).toEqual({ first: 0, last: 9 });
  });

  it('drops segments far above the view once over budget, never nearby ones', () => {
    const w = nextWindow(
      input({
        current: { first: 0, last: 10 },
        heights: measured(11),
        // 31,500 + 600 + 1,200 ahead passes the 33,000 px measured: load 11.
        scrollTop: 31500,
      }),
    );
    expect(w.last).toBe(11);
    expect(w.first).toBeGreaterThan(0);
    // The dropped segments end at least 4,000 px above the view.
    expect(3000 * w.first).toBeLessThanOrEqual(31500 - 4000);
    expect((w.last - w.first + 1) * 100).toBeLessThanOrEqual(1000);
  });

  it('restores segments when scrolling back up to their spacer', () => {
    const w = nextWindow(
      input({
        current: { first: 5, last: 14 },
        heights: measured(15),
        scrollTop: 13000, // inside segment 4, which is a spacer now
      }),
    );
    expect(w.first).toBeLessThanOrEqual(4);
  });

  it('re-centres on a jump far away from the rendered segments', () => {
    const w = nextWindow(
      input({
        current: { first: 30, last: 39 },
        heights: measured(40),
        scrollTop: 0,
      }),
    );
    expect(w).toEqual({ first: 0, last: 0 });
  });

  it('never renders past the last segment', () => {
    expect(
      nextWindow(
        input({ heights: measured(2), segmentCount: 2, scrollTop: 5000 }),
      ),
    ).toEqual({ first: 0, last: 1 });
  });
});

describe('spanHeight', () => {
  it('sums measured segments in a range', () => {
    expect(spanHeight([10, 20, 30], 1, 3)).toBe(50);
    expect(spanHeight([10, 20, 30], 2, 10)).toBe(30);
    expect(spanHeight([10], 0, 0)).toBe(0);
  });
});
