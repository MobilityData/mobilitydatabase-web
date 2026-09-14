import {
  getTimeLeftForTokenExpiration,
  displayFormattedDate,
  subMonthsUtc,
} from './date';

describe('displayFormattedDate', () => {
  test('returns empty string for null', () => {
    expect(displayFormattedDate(null as unknown as string)).toBe('');
  });

  test('returns empty string for undefined', () => {
    expect(displayFormattedDate(undefined as unknown as string)).toBe('');
  });

  test('returns empty string for empty string', () => {
    expect(displayFormattedDate('')).toBe('');
  });

  test('returns empty string for invalid date string', () => {
    expect(displayFormattedDate('not-a-date')).toBe('');
  });

  test('returns formatted string for valid ISO date', () => {
    const result = displayFormattedDate('2023-01-01T12:00:00Z');
    // Format manually to match expected UTC time
    expect(result).toBe(
      new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(new Date('2023-01-01T12:00:00Z')),
    );
  });

  test('returns formatted string for valid date-only string', () => {
    const result = displayFormattedDate('2023-01-01');
    expect(result).toBe(
      new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(new Date('2023-01-01')),
    );
  });

  test('returns formatted string for ISO with timezone offset', () => {
    const result = displayFormattedDate('2023-01-01T12:00:00-05:00');
    expect(result).toBe(
      new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(new Date('2023-01-01T12:00:00-05:00')),
    );
  });
});

describe('getTimeLeftForTokenExpiration', () => {
  const nowHours = 12;
  const now = `2023-01-01:${nowHours}:0:0`;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date(now));
  });

  it('returns the duration with all 0s for a now', () => {
    const expectedDuration = {
      years: 0,
      months: 0,
      // weeks: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    };
    const timeLeft = getTimeLeftForTokenExpiration(now);
    expect(timeLeft.duration).toEqual(expectedDuration);
    expect(timeLeft.future).toBe(false);
  });

  it('returns the correct duration for a future date', () => {
    const expectedDuration = {
      years: 0,
      months: 0,
      // weeks: 0,
      days: 0,
      hours: 1,
      minutes: 0,
      seconds: 0,
    };
    const timeLeft = getTimeLeftForTokenExpiration(
      `2023-01-01:${nowHours + 1}:0:0`,
    );
    expect(timeLeft.duration).toEqual(expectedDuration);
    expect(timeLeft.future).toBe(true);
  });

  it('returns the correct duration for a past date', () => {
    const expectedDuration = {
      years: 0,
      months: 0,
      // weeks: 0,
      days: 0,
      hours: 1,
      minutes: 0,
      seconds: 0,
    };
    const timeLeft = getTimeLeftForTokenExpiration(
      `2023-01-01:${nowHours - 1}:0:0`,
    );
    expect(timeLeft.duration).toEqual(expectedDuration);
    expect(timeLeft.future).toBe(false);
  });
});

describe('subMonthsUtc', () => {
  it('subtracts whole months in UTC, preserving the time of day', () => {
    expect(
      subMonthsUtc(new Date('2026-09-11T13:45:30.250Z'), 6).toISOString(),
    ).toBe('2026-03-11T13:45:30.250Z');
  });

  it('clamps to the last day of the target month instead of rolling forward', () => {
    // Feb 31 does not exist: plain Date.UTC arithmetic would land on Mar 3.
    expect(
      subMonthsUtc(new Date('2026-08-31T00:00:00Z'), 6).toISOString(),
    ).toBe('2026-02-28T00:00:00.000Z');
    // Leap year, so the same subtraction stops a day later.
    expect(
      subMonthsUtc(new Date('2024-08-31T00:00:00Z'), 6).toISOString(),
    ).toBe('2024-02-29T00:00:00.000Z');
    expect(
      subMonthsUtc(new Date('2026-05-31T00:00:00Z'), 1).toISOString(),
    ).toBe('2026-04-30T00:00:00.000Z');
  });

  it('crosses the year boundary', () => {
    expect(
      subMonthsUtc(new Date('2026-01-31T00:00:00Z'), 2).toISOString(),
    ).toBe('2025-11-30T00:00:00.000Z');
  });
});
