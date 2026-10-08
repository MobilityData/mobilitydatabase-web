import { createFrameCap, MAX_SCENE_FPS } from './frame-cap';

/** Runs `seconds` of a display's frames through a cap, returning fps drawn. */
function drawnFps(refreshHz: number, seconds = 10, maxFps?: number): number {
  const shouldDraw = createFrameCap(maxFps);
  const step = 1000 / refreshHz;
  let drawn = 0;
  for (let i = 0; i < refreshHz * seconds; i++) {
    if (shouldDraw(i * step)) drawn++;
  }
  return drawn / seconds;
}

describe('createFrameCap', () => {
  it('leaves displays at or below the cap untouched', () => {
    expect(drawnFps(60)).toBe(60);
    expect(drawnFps(30)).toBe(30);
  });

  it('holds high-refresh displays at the cap', () => {
    // The interesting cases: neither 120 nor 144 divides evenly by 90.
    expect(drawnFps(120)).toBeCloseTo(MAX_SCENE_FPS, 0);
    expect(drawnFps(144)).toBeCloseTo(MAX_SCENE_FPS, 0);
    expect(drawnFps(240)).toBeCloseTo(MAX_SCENE_FPS, 0);
  });

  it('does not quantise down to a whole divisor of the refresh rate', () => {
    // Advancing the schedule by one interval per drawn frame is what keeps
    // this at 90; resetting it to the frame's own timestamp would land on 60,
    // the next whole divisor of 120.
    expect(drawnFps(120)).toBeGreaterThan(75);
  });

  it('honours a custom cap', () => {
    expect(drawnFps(120, 10, 30)).toBeCloseTo(30, 0);
    expect(drawnFps(144, 10, 60)).toBeCloseTo(60, 0);
  });

  it('resumes after a stall without a catch-up burst', () => {
    const shouldDraw = createFrameCap();
    const step = 1000 / 120;
    for (let i = 0; i < 20; i++) shouldDraw(i * step);

    // Five seconds of missed frames, then the display resumes.
    let drawn = 0;
    for (let i = 0; i < 10; i++) {
      if (shouldDraw(5000 + i * step)) drawn++;
    }
    // At 120Hz the cap draws three frames in four; a burst would draw ten.
    expect(drawn).toBeLessThan(10);
    expect(drawn).toBeGreaterThan(5);
  });

  it('never draws twice for the same timestamp', () => {
    const shouldDraw = createFrameCap();
    expect(shouldDraw(1000)).toBe(true);
    expect(shouldDraw(1000)).toBe(false);
  });
});
