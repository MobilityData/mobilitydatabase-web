import { fitPopup } from './popup-placement';

const base = {
  width: 800,
  height: 500,
  cardWidth: 232,
  cardHeight: 180,
  offset: 14,
};

describe('fitPopup', () => {
  it('opens above with no shift when there is room', () => {
    expect(fitPopup({ ...base, x: 400, y: 300 })).toEqual({
      placement: 'above',
      shift: 0,
    });
  });

  it('flips below when the anchor is near the top', () => {
    expect(fitPopup({ ...base, x: 400, y: 40 }).placement).toBe('below');
  });

  it('stays above when neither side fits but above has more room', () => {
    expect(fitPopup({ ...base, height: 300, x: 400, y: 160 }).placement).toBe(
      'above',
    );
  });

  it('slides right near the left edge and left near the right edge', () => {
    // Card spans 20-252 at x=136; needs to start at the 8px margin.
    expect(fitPopup({ ...base, x: 20, y: 300 }).shift).toBe(100);
    expect(fitPopup({ ...base, x: 790, y: 300 }).shift).toBe(-100);
    expect(fitPopup({ ...base, x: 100, y: 300 }).shift).toBe(24);
  });
});
