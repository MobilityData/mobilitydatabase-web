import { changedShare } from './calendar-utils';

describe('changedShare', () => {
  it('divides the changes by the busier feed’s active services', () => {
    expect(changedShare(2, [4, 8])).toBe(0.25);
    expect(changedShare(3, [6, 2])).toBe(0.5);
  });

  it('never exceeds 1, and is 0 without services or changes', () => {
    // Services removed from a day that no longer runs any.
    expect(changedShare(5, [3, 0])).toBe(1);
    expect(changedShare(0, [0, 0])).toBe(0);
    expect(changedShare(0, [4, 4])).toBe(0);
  });
});
