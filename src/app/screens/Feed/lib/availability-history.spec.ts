import {
  AVAILABILITY_GRACE_DAYS,
  buildAvailabilityCalendar,
  getAvailabilitySummary,
} from './availability-history';
import { type components } from '../../../services/feeds/types';

type AvailabilityCheck = components['schemas']['GtfsFeedAvailabilityCheck'];
type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];

// A Wednesday, so the leading/trailing padding of the week columns is
// non-trivial in both directions.
const NOW = new Date('2026-09-09T12:00:00Z');

function check(
  date: string,
  success = true,
  time = '04:00:00',
): AvailabilityCheck {
  return {
    checked_at: `${date}T${time}Z`,
    success,
    request_method: 'HEAD',
  };
}

function criterion(
  overrides: Partial<ReliabilityCriterion> = {},
): ReliabilityCriterion {
  return {
    criterion: 'available',
    status: 'pass',
    in_grace_period: false,
    on_probation: false,
    ...overrides,
  };
}

describe('buildAvailabilityCalendar', () => {
  it('covers the whole window, one entry per day, oldest first', () => {
    const calendar = buildAvailabilityCalendar([], { now: NOW, months: 1 });

    expect(calendar.days[0].date).toBe('2026-08-10');
    expect(calendar.days[calendar.days.length - 1].date).toBe('2026-09-09');
    expect(calendar.days).toHaveLength(31);
  });

  it('marks checked days by outcome and leaves the rest unchecked', () => {
    const calendar = buildAvailabilityCalendar(
      [check('2026-09-07'), check('2026-09-08', false)],
      { now: NOW, months: 1 },
    );

    expect(calendar.successCount).toBe(1);
    expect(calendar.failureCount).toBe(1);
    expect(calendar.uncheckedCount).toBe(29);
    expect(calendar.days.find((d) => d.date === '2026-09-07')?.status).toBe(
      'success',
    );
    expect(calendar.days.find((d) => d.date === '2026-09-08')?.status).toBe(
      'failure',
    );
    expect(calendar.days.find((d) => d.date === '2026-09-09')?.status).toBe(
      'unchecked',
    );
  });

  it('counts a day as failed when any of its checks failed', () => {
    const calendar = buildAvailabilityCalendar(
      [
        check('2026-09-08', true, '04:00:00'),
        check('2026-09-08', false, '16:00:00'),
      ],
      { now: NOW, months: 1 },
    );

    const day = calendar.days.find((d) => d.date === '2026-09-08');
    expect(day?.status).toBe('failure');
    expect(day?.checkCount).toBe(2);
    expect(calendar.failureCount).toBe(1);
  });

  it('ignores checks from before the window and unparseable timestamps', () => {
    const calendar = buildAvailabilityCalendar(
      [
        check('2026-01-01', false),
        { checked_at: 'nonsense', success: false, request_method: 'HEAD' },
      ],
      { now: NOW, months: 1 },
    );

    expect(calendar.failureCount).toBe(0);
    expect(calendar.uncheckedCount).toBe(31);
  });

  it('reports uptime over checked days only, so gaps are not downtime', () => {
    const calendar = buildAvailabilityCalendar(
      [check('2026-09-06'), check('2026-09-07'), check('2026-09-08', false)],
      { now: NOW, months: 1 },
    );

    expect(calendar.uptimePercent).toBeCloseTo((2 / 3) * 100);
  });

  it('has no uptime figure when nothing was ever checked', () => {
    expect(
      buildAvailabilityCalendar([], { now: NOW, months: 1 }).uptimePercent,
    ).toBeUndefined();
  });

  it('reports the most recent failure in the window', () => {
    const calendar = buildAvailabilityCalendar(
      [check('2026-08-20', false), check('2026-09-02', false)],
      { now: NOW, months: 1 },
    );

    expect(calendar.lastFailureDate).toBe('2026-09-02');
  });

  it('lays days out as Sunday-first week columns, padded at both ends', () => {
    const calendar = buildAvailabilityCalendar([], { now: NOW, months: 1 });

    // Aug 10 2026 is a Monday, so Sunday of that column is blank.
    expect(calendar.weeks[0][0]).toBeNull();
    expect(calendar.weeks[0][1]?.date).toBe('2026-08-10');
    expect(calendar.weeks.every((week) => week.length === 7)).toBe(true);
    // Sep 9 is a Wednesday, so the final column is blank from Thursday on.
    const lastWeek = calendar.weeks[calendar.weeks.length - 1];
    expect(lastWeek[3]?.date).toBe('2026-09-09');
    expect(lastWeek[4]).toBeNull();
  });

  it('labels each month over the column its first day starts', () => {
    const calendar = buildAvailabilityCalendar([], { now: NOW, months: 1 });

    expect(calendar.monthLabels).toEqual([
      { columnIndex: 0, date: '2026-08-10' },
      { columnIndex: 3, date: '2026-09-01' },
    ]);
  });

  it('drops a sliver of a month rather than crowding the next label', () => {
    // A 6-month window ending Jun 30 opens on Wednesday Dec 31, so December
    // holds three cells of the first column and January takes it over.
    const calendar = buildAvailabilityCalendar([], {
      now: new Date('2026-06-30T12:00:00Z'),
    });

    expect(calendar.days[0].date).toBe('2025-12-31');
    expect(calendar.monthLabels[0]).toEqual({
      columnIndex: 0,
      date: '2026-01-01',
    });
  });
});

describe('getAvailabilitySummary', () => {
  const calendar = buildAvailabilityCalendar(
    [check('2026-09-07'), check('2026-09-08', false)],
    { now: NOW, months: 1 },
  );

  it('counts the recovered failures while the criterion passes', () => {
    expect(getAvailabilitySummary(criterion(), calendar, NOW)).toEqual({
      key: 'sealAvailabilityRecovered',
      values: {
        count: 1,
        graceDays: AVAILABILITY_GRACE_DAYS,
        date: 'Sep 8, 2026',
      },
    });
  });

  it('says so plainly when nothing failed', () => {
    const clean = buildAvailabilityCalendar([check('2026-09-07')], {
      now: NOW,
      months: 1,
    });

    expect(getAvailabilitySummary(criterion(), clean, NOW).key).toBe(
      'sealAvailabilityNoFailures',
    );
  });

  it('counts down the grace period while the feed is at risk', () => {
    const summary = getAvailabilitySummary(
      criterion({
        status: 'fail',
        in_grace_period: true,
        grace_period_ends_at: '2026-09-20T00:00:00Z',
        first_failure_at: '2026-09-06T04:00:00Z',
      }),
      calendar,
      NOW,
    );

    // The day count drives the deadline notice, not the sentence.
    expect(summary).toEqual({
      key: 'sealAvailabilityAtRisk',
      values: { date: 'Sep 6, 2026' },
      graceDaysLeft: 11,
    });
  });

  it('reads as a spent grace window once the failure is confirmed', () => {
    expect(
      getAvailabilitySummary(
        criterion({ status: 'fail', first_failure_at: '2026-08-01T04:00:00Z' }),
        calendar,
        NOW,
      ).key,
    ).toBe('sealAvailabilityFailing');
  });

  it('names the error probation is being served for', () => {
    expect(
      getAvailabilitySummary(
        criterion({
          on_probation: true,
          last_failure_at: '2026-07-02T04:00:00Z',
        }),
        calendar,
        NOW,
      ),
    ).toEqual({
      key: 'sealAvailabilityProbation',
      values: { date: 'Jul 2, 2026' },
    });
  });

  it('drops the date when no last failure was kept', () => {
    expect(
      getAvailabilitySummary(criterion({ on_probation: true }), calendar, NOW)
        .key,
    ).toBe('sealAvailabilityProbationUndated');
  });

  it('reads as no data when the criterion passes but nothing was checked', () => {
    const empty = buildAvailabilityCalendar([], { now: NOW, months: 1 });

    expect(getAvailabilitySummary(criterion(), empty, NOW).key).toBe(
      'sealAvailabilityNoData',
    );
  });

  it('reads as no data when the criterion was never evaluated', () => {
    expect(
      getAvailabilitySummary(
        criterion({ status: 'never_evaluated' }),
        calendar,
        NOW,
      ).key,
    ).toBe('sealAvailabilityNoData');
  });

  it('withdraws the criterion when it does not apply', () => {
    expect(
      getAvailabilitySummary(
        criterion({ status: 'not_applicable' }),
        calendar,
        NOW,
      ).key,
    ).toBe('sealAvailabilityNotApplicable');
  });

  it('floors an elapsed grace deadline at zero rather than counting backwards', () => {
    expect(
      getAvailabilitySummary(
        criterion({
          status: 'fail',
          in_grace_period: true,
          grace_period_ends_at: '2026-08-01T00:00:00Z',
        }),
        calendar,
        NOW,
      ).graceDaysLeft,
    ).toBe(0);
  });

  it('leaves the deadline out of every state but the grace period', () => {
    expect(
      getAvailabilitySummary(criterion(), calendar, NOW).graceDaysLeft,
    ).toBeUndefined();
    expect(
      getAvailabilitySummary(criterion({ status: 'fail' }), calendar, NOW)
        .graceDaysLeft,
    ).toBeUndefined();
  });
});
