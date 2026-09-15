import {
  FRESH_COVERAGE_MINIMUM_DAYS,
  addUtcDays,
  buildFreshCoverageWindow,
  getFreshCoverageSteps,
  getFreshCoverageSummary,
  getLatestCoverageWindow,
  toUtcDay,
} from './fresh-coverage';
import { type components } from '../../../services/feeds/types';

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];
type ContinuousCoverageResponse =
  components['schemas']['GtfsFeedContinuousCoverageResponse'];

const NOW = new Date('2026-09-11T12:00:00Z');

function criterion(
  overrides: Partial<ReliabilityCriterion> = {},
): ReliabilityCriterion {
  return {
    criterion: 'fresh_coverage',
    status: 'pass',
    in_grace_period: false,
    on_probation: false,
    ...overrides,
  };
}

function coverageResponse(
  overrides: Partial<ContinuousCoverageResponse> = {},
): ContinuousCoverageResponse {
  return {
    feed_id: 'mdb-1',
    total: 0,
    offset: 0,
    limit: 20,
    items: [],
    ...overrides,
  };
}

describe('toUtcDay / addUtcDays', () => {
  it('reads the UTC calendar day, not the local one', () => {
    // 23:30 UTC is already the next day in some zones and the previous one in
    // others; the UTC day is the same wherever this runs.
    expect(toUtcDay(new Date('2026-09-11T23:30:00Z'))).toBe('2026-09-11');
  });

  it('crosses a month boundary in both directions', () => {
    expect(addUtcDays('2026-09-28', 7)).toBe('2026-10-05');
    expect(addUtcDays('2026-10-05', -7)).toBe('2026-09-28');
  });
});

describe('getLatestCoverageWindow', () => {
  it('prefers the latest state, which survives paging past that dataset', () => {
    const coverage = coverageResponse({
      latest_state: {
        newer: {
          dataset_id: 'd2',
          is_latest: true,
          coverage_window: { start: '2026-09-01', end: '2026-12-31' },
          files: [],
        },
      },
      items: [
        {
          dataset_id: 'd1',
          is_latest: true,
          coverage_window: { start: '2026-01-01', end: '2026-02-01' },
          files: [],
        },
      ],
    });
    expect(getLatestCoverageWindow(coverage)).toEqual({
      start: '2026-09-01',
      end: '2026-12-31',
    });
  });

  it('falls back to the is_latest item when there is no latest state', () => {
    const coverage = coverageResponse({
      items: [
        {
          dataset_id: 'd0',
          is_latest: false,
          coverage_window: { start: '2025-01-01', end: '2025-06-01' },
          files: [],
        },
        {
          dataset_id: 'd1',
          is_latest: true,
          coverage_window: { start: '2026-01-01', end: '2026-02-01' },
          files: [],
        },
      ],
    });
    expect(getLatestCoverageWindow(coverage)).toEqual({
      start: '2026-01-01',
      end: '2026-02-01',
    });
  });

  it("reads the dataset's own range when the coverage call produced nothing", () => {
    expect(
      getLatestCoverageWindow(undefined, {
        service_date_range_start: '2026-04-01T05:59:59+00Z',
        service_date_range_end: '2026-10-20T05:59:59+00Z',
      }),
    ).toEqual({ start: '2026-04-01', end: '2026-10-20' });
  });

  it('returns an end on its own when the source reports no start', () => {
    expect(
      getLatestCoverageWindow(undefined, {
        service_date_range_end: '2026-10-20T05:59:59+00Z',
      }),
    ).toEqual({ end: '2026-10-20' });
  });

  it('is undefined when nothing reports a service end at all', () => {
    expect(getLatestCoverageWindow(coverageResponse(), {})).toBeUndefined();
  });
});

describe('buildFreshCoverageWindow', () => {
  it('measures coverage from today, UTC', () => {
    const window = buildFreshCoverageWindow('2026-10-04', NOW);
    expect(window).toMatchObject({
      fetchDate: '2026-09-11',
      serviceEndDate: '2026-10-04',
      minimumDate: '2026-09-18',
      daysAhead: 23,
      meetsMinimum: true,
    });
  });

  it('is short by exactly one day at the minimum boundary', () => {
    expect(
      buildFreshCoverageWindow(
        addUtcDays('2026-09-11', FRESH_COVERAGE_MINIMUM_DAYS),
        NOW,
      ).meetsMinimum,
    ).toBe(true);
    expect(
      buildFreshCoverageWindow(
        addUtcDays('2026-09-11', FRESH_COVERAGE_MINIMUM_DAYS - 1),
        NOW,
      ).meetsMinimum,
    ).toBe(false);
  });

  it('reports elapsed coverage as a negative day count', () => {
    const window = buildFreshCoverageWindow('2026-09-01', NOW);
    expect(window.daysAhead).toBe(-10);
    expect(window.meetsMinimum).toBe(false);
  });

  it('opens the axis exactly on the service start, with no padding before it', () => {
    // The delivered stretch is bare track, so the empty region has to begin
    // where the "Dataset start" label says it does.
    const window = buildFreshCoverageWindow('2027-03-01', NOW, '2026-03-01');
    expect(window.serviceStartDate).toBe('2026-03-01');
    expect(window.axis.start).toBe('2026-03-01');
    expect(window.axis.end > '2027-03-01').toBe(true);
  });

  it('still pads the left edge when no service start is reported', () => {
    // Nothing anchors the left edge, so today is kept off it.
    expect(buildFreshCoverageWindow('2027-03-01', NOW).axis.start).toBe(
      addUtcDays('2026-09-11', -11),
    );
  });

  it('keeps the axis wide enough to hold every date it draws', () => {
    // Coverage that ran out sits before today, so the axis has to reach back
    // past it even without a reported start.
    const elapsed = buildFreshCoverageWindow('2026-09-01', NOW);
    expect(elapsed.axis.start < '2026-09-01').toBe(true);
    expect(elapsed.axis.end > elapsed.minimumDate).toBe(true);

    // Coverage reaching past the minimum pushes the far end out instead.
    const ahead = buildFreshCoverageWindow('2027-03-01', NOW);
    expect(ahead.axis.start < '2026-09-11').toBe(true);
    expect(ahead.axis.end > '2027-03-01').toBe(true);
  });

  it('ignores a start that falls after the end rather than inverting the axis', () => {
    const window = buildFreshCoverageWindow('2026-10-04', NOW, '2026-12-01');
    expect(window.serviceStartDate).toBeUndefined();
  });

  it("bars the dataset's own declared window, start to end", () => {
    const window = buildFreshCoverageWindow('2027-03-01', NOW, '2026-03-01');
    expect(window.bar).toEqual({ start: '2026-03-01', end: '2027-03-01' });
  });

  it('bars the whole window even once coverage has run out', () => {
    const window = buildFreshCoverageWindow('2026-09-01', NOW, '2026-03-01');
    expect(window.bar).toEqual({ start: '2026-03-01', end: '2026-09-01' });
  });

  it('collapses the bar to a point at the end when only an end is known', () => {
    expect(buildFreshCoverageWindow('2026-10-04', NOW).bar).toEqual({
      start: '2026-10-04',
      end: '2026-10-04',
    });
  });

  it('bands the stretch coverage falls short of the minimum by instead', () => {
    expect(
      buildFreshCoverageWindow('2026-09-14', NOW).missingCoverageBand,
    ).toEqual({ start: '2026-09-14', end: '2026-09-18' });
  });

  it('draws no missing-coverage band once the minimum is met', () => {
    expect(
      buildFreshCoverageWindow('2026-10-04', NOW).missingCoverageBand,
    ).toBeUndefined();
  });

  it('collapses the bar to a point at the end when coverage has elapsed too, with no start', () => {
    expect(buildFreshCoverageWindow('2026-09-01', NOW).bar).toEqual({
      start: '2026-09-01',
      end: '2026-09-01',
    });
  });
});

describe('getFreshCoverageSteps', () => {
  const stepsFor = (
    serviceEndDate: string,
  ): ReturnType<typeof getFreshCoverageSteps> =>
    getFreshCoverageSteps(buildFreshCoverageWindow(serviceEndDate, NOW));

  it('reads today, the required date and where coverage ends', () => {
    const { steps, connectors } = stepsFor('2026-10-26');
    expect(steps).toEqual([
      {
        id: 'today',
        labelKey: 'sealFreshRollingStepToday',
        date: '2026-09-11',
      },
      {
        id: 'required',
        labelKey: 'sealFreshRollingStepRequired',
        date: '2026-09-18',
      },
      {
        id: 'coverageEnd',
        labelKey: 'sealFreshRollingStepCoverageEnd',
        date: '2026-10-26',
      },
    ]);
    // The verdict sits on the spans, not on the date coverage happens to
    // stop at.
    expect(connectors).toEqual([
      {
        key: 'sealFreshRollingStepMinimum',
        values: { days: 7 },
        tone: 'success',
      },
      {
        key: 'sealFreshRollingStepMargin',
        values: { days: 38 },
        tone: 'success',
      },
    ]);
  });

  it('keeps the fixed order and marks the shortfall when coverage falls short', () => {
    const { steps, connectors } = stepsFor('2026-09-14');
    // The row is a reading of the rule, not a timeline, so the required date
    // stays in the middle even though coverage ends before it.
    expect(steps.map((step) => step.id)).toEqual([
      'today',
      'required',
      'coverageEnd',
    ]);
    expect(steps[2]).toEqual({
      id: 'coverageEnd',
      labelKey: 'sealFreshRollingStepCoverageEnd',
      date: '2026-09-14',
    });
    expect(connectors).toEqual([
      {
        key: 'sealFreshRollingStepMinimum',
        values: { days: 7 },
        tone: 'error',
      },
      {
        key: 'sealFreshRollingStepShort',
        values: { days: 4 },
        tone: 'error',
      },
    ]);
  });

  it('says there is no margin when coverage lands on the required date', () => {
    const { connectors } = stepsFor(addUtcDays('2026-09-11', 7));
    expect(connectors[0]).toMatchObject({ tone: 'success' });
    expect(connectors[1]).toEqual({
      key: 'sealFreshRollingStepNoMargin',
      values: {},
    });
  });

  it('drops today and reads coverage ends, short by, required by once failing', () => {
    const { steps, connectors } = getFreshCoverageSteps(
      buildFreshCoverageWindow('2026-06-01', NOW),
      'error',
    );
    expect(steps).toEqual([
      {
        id: 'coverageEnd',
        labelKey: 'sealFreshRollingStepCoverageEnd',
        date: '2026-06-01',
      },
      {
        id: 'required',
        labelKey: 'sealFreshRollingStepRequired',
        date: '2026-09-18',
        tooltipKey: 'sealFreshRollingStepRequiredTooltip',
      },
    ]);
    expect(connectors).toEqual([
      {
        key: 'sealFreshRollingStepShort',
        values: { days: 109 },
        tone: 'error',
      },
    ]);
  });

  it('uses the same compact layout, tinted warning, while still in the grace period', () => {
    const { connectors } = getFreshCoverageSteps(
      buildFreshCoverageWindow('2026-06-01', NOW),
      'warning',
    );
    expect(connectors).toEqual([
      {
        key: 'sealFreshRollingStepShort',
        values: { days: 109 },
        tone: 'warning',
      },
    ]);
  });
});

describe('getFreshCoverageSummary', () => {
  it('states how far ahead coverage runs, and its margin, while passing', () => {
    const summary = getFreshCoverageSummary(
      criterion(),
      { end: '2026-10-04' },
      NOW,
    );
    expect(summary.subtitleKey).toBe('sealFreshRollingCoveredSubtitle');
    expect(summary.key).toBe('sealFreshRollingPassing');
    expect(summary.values).toEqual({
      date: 'Oct 4, 2026',
      days: 23,
      beyond: 16,
      minimumDays: 7,
    });
    expect(summary.graceDaysLeft).toBeUndefined();
  });

  it('drops the margin when coverage lands exactly on the minimum', () => {
    // "0 days beyond the minimum" reads as a mistake.
    const summary = getFreshCoverageSummary(
      criterion(),
      { end: addUtcDays('2026-09-11', 7) },
      NOW,
    );
    expect(summary.key).toBe('sealFreshRollingPassingExact');
    expect(summary.values).toEqual({
      date: 'Sep 18, 2026',
      days: 7,
      minimumDays: 7,
    });
  });

  it('flags a passing verdict whose window has already fallen short', () => {
    // The API's verdict is debounced, so a dataset can read `pass` on the day
    // its coverage drops below the minimum.
    const summary = getFreshCoverageSummary(
      criterion(),
      { end: '2026-09-14' },
      NOW,
    );
    expect(summary.subtitleKey).toBe('sealFreshRollingShortSubtitle');
    expect(summary.key).toBe('sealFreshRollingPassingShort');
    expect(summary.window?.meetsMinimum).toBe(false);
  });

  it('counts down the grace period while at risk', () => {
    const summary = getFreshCoverageSummary(
      criterion({
        in_grace_period: true,
        grace_period_ends_at: '2026-09-20T04:00:00Z',
      }),
      { end: '2026-09-14' },
      NOW,
    );
    expect(summary.key).toBe('sealFreshRollingAtRisk');
    expect(summary.graceDaysLeft).toBe(9);
  });

  it('reports no days left when the grace deadline is missing', () => {
    const summary = getFreshCoverageSummary(
      criterion({ in_grace_period: true }),
      { end: '2026-09-14' },
      NOW,
    );
    expect(summary.graceDaysLeft).toBe(0);
  });

  it('asks for a longer window once the failure is confirmed', () => {
    const summary = getFreshCoverageSummary(
      criterion({ status: 'fail' }),
      { end: '2026-09-14' },
      NOW,
    );
    expect(summary.subtitleKey).toBe('sealFreshRollingShortSubtitle');
    expect(summary.key).toBe('sealFreshRollingFailing');
    expect(summary.graceDaysLeft).toBeUndefined();
  });

  it("carries the dataset's own window through to the summary", () => {
    const summary = getFreshCoverageSummary(
      criterion({ status: 'fail' }),
      { start: '2026-06-01', end: '2026-06-30' },
      NOW,
    );
    expect(summary.window?.bar).toEqual({
      start: '2026-06-01',
      end: '2026-06-30',
    });
  });

  it('dates the last failure while on probation, and drops it when absent', () => {
    expect(
      getFreshCoverageSummary(
        criterion({
          on_probation: true,
          last_failure_at: '2026-06-02T04:00:00Z',
        }),
        { end: '2026-10-04' },
        NOW,
      ),
    ).toMatchObject({
      key: 'sealFreshRollingProbation',
      values: { date: 'Oct 4, 2026', failureDate: 'Jun 2, 2026' },
    });

    expect(
      getFreshCoverageSummary(
        criterion({ on_probation: true }),
        { end: '2026-10-04' },
        NOW,
      ).key,
    ).toBe('sealFreshRollingProbationUndated');
  });

  it('treats not_applicable as the seasonal case', () => {
    expect(
      getFreshCoverageSummary(
        criterion({ status: 'not_applicable' }),
        { end: '2026-10-04' },
        NOW,
      ),
    ).toEqual({
      subtitleKey: 'sealFreshRollingNotApplicableSubtitle',
      key: 'sealFreshRollingNotApplicable',
      values: {},
    });
  });

  it('says nothing has been evaluated yet', () => {
    expect(
      getFreshCoverageSummary(
        criterion({ status: 'never_evaluated' }),
        { end: '2026-10-04' },
        NOW,
      ).key,
    ).toBe('sealFreshRollingNoData');
  });

  it('keeps the verdict and the countdown when the window is missing', () => {
    const summary = getFreshCoverageSummary(
      criterion({
        in_grace_period: true,
        grace_period_ends_at: '2026-09-20T04:00:00Z',
      }),
      undefined,
      NOW,
    );
    expect(summary.key).toBe('sealFreshRollingNoWindow');
    expect(summary.window).toBeUndefined();
    expect(summary.graceDaysLeft).toBe(9);
  });
});
