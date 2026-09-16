import * as React from 'react';
import { Alert, Box, Typography } from '@mui/material';
import { getTranslations } from 'next-intl/server';
import { highlight } from './criterionHighlight';
import CriterionGraceCountdown from './CriterionGraceCountdown';
import ValidationErrorsPanel from './ValidationErrorsPanel';
import { getComplianceSummary } from '../lib/compliance-report';
import {
  type ValidatorRuleInfo,
  buildValidationErrorsModel,
} from '../lib/validation-notices';
import { buildDatasetDownloadUrl } from '../../../services/feeds';
import { type components } from '../../../services/feeds/types';

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];
type ValidationReport = components['schemas']['ValidationReport'];
type ValidationReportsResponse =
  components['schemas']['GtfsFeedValidationReportsResponse'];

export interface ComplianceCriterionBodyProps {
  criterion: ReliabilityCriterion;
  /** Validation report of the feed's latest dataset, when it has one. */
  report?: ValidationReport;
  /** Feed id, used to build the dataset download URL. */
  feedId?: string;
  /** Validation history of the feed, one entry per dataset. */
  validationReports?: ValidationReportsResponse;
  validationReportsError?: boolean;
  /** Validator rule index, fetched with the seal endpoints. */
  validatorRules?: Record<string, ValidatorRuleInfo>;
  /** Pinned by the page so every date-derived branch agrees. */
  now: Date;
}

/**
 * Body of the Compliant criterion: what the latest dataset's validation
 * report says, the 30-day countdown while an error is still inside its grace
 * period, and the errors behind the verdict.
 */
export default async function ComplianceCriterionBody({
  criterion,
  report,
  feedId,
  validationReports,
  validationReportsError = false,
  validatorRules,
  now,
}: ComplianceCriterionBodyProps): Promise<React.ReactElement> {
  const t = await getTranslations('feeds');

  const model = buildValidationErrorsModel(validationReports, validatorRules);

  // The criterion counts distinct codes, not occurrences, so the sentence
  // and the list below it agree.
  const summary = getComplianceSummary(criterion, report, now, {
    fallbackErrorCount: model.totalCount,
  });

  const downloadUrl =
    feedId != undefined && feedId.length > 0 && model.datasetId != undefined
      ? buildDatasetDownloadUrl(feedId, model.datasetId)
      : undefined;

  return (
    <Box data-testid='compliance-criterion-body'>
      <Typography variant='body1' sx={{ fontWeight: 700 }}>
        {t(summary.subtitleKey)}
      </Typography>
      <Typography variant='body1' sx={{ mt: 1 }}>
        {t.rich(summary.key, { ...summary.values, b: highlight })}
      </Typography>

      {summary.graceDaysLeft != undefined && (
        <CriterionGraceCountdown
          title={t('sealCompliantGraceTitle', { days: summary.graceDaysLeft })}
          description={t('sealCompliantGraceDescription')}
        />
      )}

      {validationReportsError && (
        <Alert
          severity='warning'
          sx={{ mt: 2 }}
          data-testid='validation-errors-error'
        >
          {t('sealComplianceHistoryError')}
        </Alert>
      )}

      <ValidationErrorsPanel model={model} downloadUrl={downloadUrl} />
    </Box>
  );
}
