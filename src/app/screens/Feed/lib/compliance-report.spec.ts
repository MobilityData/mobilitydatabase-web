import {
  COMPLIANCE_GRACE_DAYS,
  getComplianceErrorCount,
  getComplianceSummary,
} from './compliance-report';
import { type components } from '../../../services/feeds/types';

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];
type ValidationReport = components['schemas']['ValidationReport'];

const NOW = new Date('2026-09-09T12:00:00Z');

function criterion(
  overrides: Partial<ReliabilityCriterion> = {},
): ReliabilityCriterion {
  return {
    criterion: 'compliant',
    status: 'pass',
    in_grace_period: false,
    on_probation: false,
    ...overrides,
  };
}

const cleanReport: ValidationReport = {
  validated_at: '2026-09-08T04:00:00Z',
  total_error: 0,
  unique_error_count: 0,
};

const failingReport: ValidationReport = {
  validated_at: '2026-09-08T04:00:00Z',
  total_error: 7,
  unique_error_count: 2,
};

describe('getComplianceErrorCount', () => {
  it('reports every occurrence, not just the distinct notice codes', () => {
    expect(getComplianceErrorCount(failingReport)).toBe(7);
  });

  it('falls back to the distinct count when the total is absent', () => {
    expect(getComplianceErrorCount({ unique_error_count: 2 })).toBe(2);
  });

  it('is undefined without a report at all', () => {
    expect(getComplianceErrorCount(undefined)).toBeUndefined();
  });
});

describe('getComplianceSummary', () => {
  it('reports the validation date while the criterion passes', () => {
    expect(getComplianceSummary(criterion(), cleanReport, NOW)).toEqual({
      subtitleKey: 'sealCompliantNoErrorsSubtitle',
      key: 'sealCompliantPassing',
      values: { date: 'Sep 8, 2026' },
    });
  });

  it('drops the date when the report does not carry one', () => {
    expect(getComplianceSummary(criterion(), { total_error: 0 }, NOW).key).toBe(
      'sealCompliantPassingUndated',
    );
  });

  it('counts down the 30-day window while an error is inside its grace period', () => {
    expect(
      getComplianceSummary(
        criterion({
          status: 'fail',
          in_grace_period: true,
          grace_period_ends_at: '2026-10-03T00:00:00Z',
        }),
        failingReport,
        NOW,
      ),
    ).toEqual({
      subtitleKey: 'sealCompliantHasErrorsSubtitle',
      key: 'sealCompliantAtRisk',
      values: { count: 7, graceDays: COMPLIANCE_GRACE_DAYS },
      errorCount: 7,
      graceDaysLeft: 24,
    });
  });

  it('floors an elapsed grace deadline at zero rather than counting backwards', () => {
    expect(
      getComplianceSummary(
        criterion({
          status: 'fail',
          in_grace_period: true,
          grace_period_ends_at: '2026-08-01T00:00:00Z',
        }),
        failingReport,
        NOW,
      ).graceDaysLeft,
    ).toBe(0);
  });

  it('reads as a spent grace window once the failure is confirmed', () => {
    const summary = getComplianceSummary(
      criterion({ status: 'fail' }),
      failingReport,
      NOW,
    );

    expect(summary.key).toBe('sealCompliantFailing');
    expect(summary.graceDaysLeft).toBeUndefined();
  });

  it('names the error probation is being served for', () => {
    expect(
      getComplianceSummary(
        criterion({
          on_probation: true,
          last_failure_at: '2026-07-02T04:00:00Z',
        }),
        cleanReport,
        NOW,
      ),
    ).toEqual({
      subtitleKey: 'sealCompliantNoErrorsSubtitle',
      key: 'sealCompliantProbation',
      values: { date: 'Jul 2, 2026' },
    });
  });

  it('drops the date when no last failure was kept', () => {
    expect(
      getComplianceSummary(criterion({ on_probation: true }), cleanReport, NOW)
        .key,
    ).toBe('sealCompliantProbationUndated');
  });

  it('says the report is missing rather than claiming a clean validation', () => {
    expect(getComplianceSummary(criterion(), undefined, NOW).key).toBe(
      'sealCompliantNoReport',
    );
  });

  it('separates never-evaluated from a clean pass', () => {
    expect(
      getComplianceSummary(
        criterion({ status: 'never_evaluated' }),
        cleanReport,
        NOW,
      ).key,
    ).toBe('sealCompliantNoData');
  });

  it('withdraws the criterion when it does not apply', () => {
    expect(
      getComplianceSummary(
        criterion({ status: 'not_applicable' }),
        cleanReport,
        NOW,
      ).key,
    ).toBe('sealCompliantNotApplicable');
  });

  it.each([
    [
      'a clean report',
      criterion(),
      cleanReport,
      'sealCompliantNoErrorsSubtitle',
    ],
    [
      'probation, which is served while passing',
      criterion({ on_probation: true }),
      cleanReport,
      'sealCompliantNoErrorsSubtitle',
    ],
    [
      'a failing report',
      criterion({ status: 'fail' }),
      failingReport,
      'sealCompliantHasErrorsSubtitle',
    ],
    [
      'a missing report',
      criterion(),
      undefined,
      'sealCompliantNoReportSubtitle',
    ],
    [
      'a never-evaluated criterion',
      criterion({ status: 'never_evaluated' }),
      cleanReport,
      'sealCompliantNotEvaluatedSubtitle',
    ],
    [
      'a withdrawn criterion',
      criterion({ status: 'not_applicable' }),
      cleanReport,
      'sealCompliantNotApplicableSubtitle',
    ],
  ])('heads %s with its own subtitle', (_label, given, report, subtitleKey) => {
    expect(getComplianceSummary(given, report, NOW).subtitleKey).toBe(
      subtitleKey,
    );
  });
});
