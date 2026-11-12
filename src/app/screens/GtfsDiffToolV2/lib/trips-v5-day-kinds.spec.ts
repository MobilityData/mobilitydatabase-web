import type { TripChangeCounts } from './trips-calendar';
import type { ServicePeriod } from './trips-periods';
import { dayKindLabel, dayKindOf, dayKindTitle } from './trips-v5-day-kinds';

function period(
  over: Partial<ServicePeriod>,
  counts: Partial<TripChangeCounts> = {},
): ServicePeriod {
  return {
    id: '0-weekday',
    s: 0,
    group: 'weekday',
    dates: ['20260907', '20260908'],
    title: 'Weekdays',
    when: '7–8 Sep',
    schedule: 'Typical schedule',
    typical: false,
    exception: false,
    runs: null,
    color: null,
    counts: {
      added: 0,
      removed: 0,
      modified: 0,
      id_only: 0,
      base: 10,
      new: 10,
      ...counts,
    },
    changed: 0,
    share: 0,
    ...over,
  };
}

describe('dayKindOf', () => {
  it('tells typical, substitute, block and one-off periods apart', () => {
    expect(dayKindOf(period({ typical: true }))).toBe('typical');
    expect(dayKindOf(period({ exception: true }))).toBe('substitute');
    expect(dayKindOf(period({}))).toBe('block');
    expect(dayKindOf(period({ dates: ['20260907'] }))).toBe('oneoff');
  });

  it('puts days without service in the new feed first', () => {
    expect(dayKindOf(period({ typical: true }, { new: 0 }))).toBe('none');
    expect(dayKindOf(period({ exception: true }, { new: 0 }))).toBe('none');
  });
});

describe('dayKindTitle', () => {
  it('labels each kind', () => {
    expect(dayKindTitle('substitute')).toBe('Runs another day’s schedule');
    expect(dayKindTitle('none')).toBe('No service');
    expect(dayKindTitle('oneoff')).toBe('Unique single date schedule');
  });
});

describe('dayKindLabel', () => {
  it('names typical periods by day type', () => {
    expect(dayKindLabel(period({ typical: true }))).toBe('Typical weekday');
    expect(dayKindLabel(period({ typical: true, group: 'sunday' }))).toBe(
      'Typical Sunday',
    );
    expect(dayKindLabel(period({}))).toBe('Unique schedule');
  });
});
