import * as React from 'react';
import { Box, Button, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { getTranslations } from 'next-intl/server';
import CriterionGraceCountdown from './CriterionGraceCountdown';
import { getComplianceSummary } from '../lib/compliance-report';
import { type components } from '../../../services/feeds/types';

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];
type ValidationReport = components['schemas']['ValidationReport'];

export interface ComplianceCriterionBodyProps {
  criterion: ReliabilityCriterion;
  /** Validation report of the feed's latest dataset, when it has one. */
  report?: ValidationReport;
  /** Pinned by the page so every date-derived branch agrees. */
  now: Date;
}

/**
 * Body of the Compliant criterion: what the latest dataset's validation
 * report says, the 30-day countdown while an error is still inside its grace
 * period, and a way through to the report itself.
 */
export default async function ComplianceCriterionBody({
  criterion,
  report,
  now,
}: ComplianceCriterionBodyProps): Promise<React.ReactElement> {
  const t = await getTranslations('feeds');
  const summary = getComplianceSummary(criterion, report, now);
  const reportUrl = report?.url_html;

  return (
    <Box data-testid='compliance-criterion-body'>
      {/* Bold headline then detail, matching the shape Official and Stable
          get from the shared criterion copy. */}
      <Typography variant='body1' sx={{ fontWeight: 700 }}>
        {t(summary.subtitleKey)}
      </Typography>
      <Typography variant='body1' sx={{ mt: 1 }}>
        {t(summary.key, summary.values)}
      </Typography>

      {summary.graceDaysLeft != undefined && (
        <CriterionGraceCountdown
          title={t('sealCompliantGraceTitle', {
            days: summary.graceDaysLeft,
          })}
          description={t('sealCompliantGraceDescription')}
        />
      )}

      {reportUrl != undefined && reportUrl.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button
            href={reportUrl}
            target='_blank'
            rel='noreferrer'
            variant='text'
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
            endIcon={<OpenInNewIcon></OpenInNewIcon>}
          >
            {t('sealCompliantViewReport')}
          </Button>
        </Box>
      )}
    </Box>
  );
}
