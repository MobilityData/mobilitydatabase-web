/**
 * Reads the latest dataset's validation report into the wording and numbers
 * the Compliant criterion renders.
 */

import { type components } from '../../../services/feeds/types';
import {
  getCriterionDisplayStatus,
  getDaysUntil,
} from '../../../constants/sealCriteria';
import { formatDateShort } from '../../../utils/date';

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];
type ValidationReport = components['schemas']['ValidationReport'];

/** Days producers get to fix a validation error before the seal is revoked. */
export const COMPLIANCE_GRACE_DAYS = 30;

/**
 * Headline for the state, mirroring the bold subtitle Official and Stable
 * get from the shared criterion copy. Keys in the `feeds` namespace.
 */
const SUBTITLE_KEYS = {
  noErrors: 'sealCompliantNoErrorsSubtitle',
  hasErrors: 'sealCompliantHasErrorsSubtitle',
  noReport: 'sealCompliantNoReportSubtitle',
  notEvaluated: 'sealCompliantNotEvaluatedSubtitle',
  notApplicable: 'sealCompliantNotApplicableSubtitle',
} as const;

export interface ComplianceSummary {
  /** Bold headline for the state. Key in the `feeds` namespace. */
  subtitleKey: string;
  /** The sentence below the subtitle. Key in the `feeds` namespace. */
  key: string;
  values: Record<string, string | number>;
  /**
   * Days left in the grace period, when one is running. Drives the deadline
   * notice; absent for every other state.
   */
  graceDaysLeft?: number;
  /** Errors in the latest report, when there are any to report. */
  errorCount?: number;
}

export function getComplianceErrorCount(
  report: ValidationReport | undefined,
): number | undefined {
  return report?.total_error ?? report?.unique_error_count;
}

export function getComplianceSummary(
  criterion: ReliabilityCriterion,
  report: ValidationReport | undefined,
  now: Date = new Date(),
): ComplianceSummary {
  const displayStatus = getCriterionDisplayStatus(criterion);
  const errorCount = getComplianceErrorCount(report) ?? 0;
  const graceDays = COMPLIANCE_GRACE_DAYS;

  if (displayStatus === 'notApplicable') {
    return {
      subtitleKey: SUBTITLE_KEYS.notApplicable,
      key: 'sealCompliantNotApplicable',
      values: {},
    };
  }
  // At risk and failing both mean the report has errors; what separates them
  // is how much of the grace period is left, which the sentence carries.
  if (displayStatus === 'atRisk') {
    return {
      subtitleKey: SUBTITLE_KEYS.hasErrors,
      key: 'sealCompliantAtRisk',
      values: { count: errorCount, graceDays },
      errorCount,
      graceDaysLeft:
        criterion.grace_period_ends_at != null
          ? getDaysUntil(criterion.grace_period_ends_at, now)
          : 0,
    };
  }
  if (displayStatus === 'fail') {
    return {
      subtitleKey: SUBTITLE_KEYS.hasErrors,
      key: 'sealCompliantFailing',
      values: { count: errorCount, graceDays },
    };
  }

  if (displayStatus === 'probation') {
    return {
      subtitleKey: SUBTITLE_KEYS.noErrors,
      ...(criterion.last_failure_at != null
        ? {
            key: 'sealCompliantProbation',
            values: { date: formatDateShort(criterion.last_failure_at) },
          }
        : { key: 'sealCompliantProbationUndated', values: {} }),
    };
  }
  if (report == undefined) {
    return {
      subtitleKey: SUBTITLE_KEYS.noReport,
      key: 'sealCompliantNoReport',
      values: {},
    };
  }
  if (displayStatus === 'notEvaluated') {
    return {
      subtitleKey: SUBTITLE_KEYS.notEvaluated,
      key: 'sealCompliantNoData',
      values: {},
    };
  }
  // The validated-on date is worth stating, but the report doesn't always
  // carry one, so the wording drops it rather than showing an empty date.
  if (report.validated_at == null) {
    return {
      subtitleKey: SUBTITLE_KEYS.noErrors,
      key: 'sealCompliantPassingUndated',
      values: {},
    };
  }
  return {
    subtitleKey: SUBTITLE_KEYS.noErrors,
    key: 'sealCompliantPassing',
    values: { date: formatDateShort(report.validated_at) },
  };
}
