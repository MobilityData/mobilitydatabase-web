import * as React from 'react';
import { Box, Typography } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import { getTranslations } from 'next-intl/server';
import AvailabilityHeatmap from './AvailabilityHeatmap';
import CriterionGraceCountdown from './CriterionGraceCountdown';
import CriterionProbationProgress from './CriterionProbationProgress';
import {
  AVAILABILITY_HISTORY_MONTHS,
  type AvailabilityCalendar,
  getAvailabilitySummary,
} from '../lib/availability-history';
import {
  getCriterionDisplayStatus,
  getProbationWindowFromEnd,
} from '../../../constants/sealCriteria';
import { type components } from '../../../services/feeds/types';
import { theme } from '../../../Theme';

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];

export interface AvailabilityCriterionBodyProps {
  criterion: ReliabilityCriterion;
  /**
   * Built by the page, which also needs it for the header's uptime chip.
   * Empty of checks when the history call failed - the criterion still
   * renders, it just has no record to show.
   */
  calendar: AvailabilityCalendar;
  /** Pinned by the page so every date-derived branch agrees. */
  now: Date;
}

/**
 * Body of the Available criterion: what the daily fetch record says, the
 * record itself as a heatmap, and - while the feed is inside its 14-day
 * window - how long is left to restore access.
 */
export default async function AvailabilityCriterionBody({
  criterion,
  calendar,
  now,
}: AvailabilityCriterionBodyProps): Promise<React.ReactElement> {
  const t = await getTranslations('feeds');
  const summary = getAvailabilitySummary(criterion, calendar, now);
  const hasHistory = calendar.successCount + calendar.failureCount > 0;

  // Probation excludes a grace period, so only one of these ever renders -
  // both occupy the same slot, right under the summary sentence.
  const probationWindow =
    getCriterionDisplayStatus(criterion) === 'probation'
      ? getProbationWindowFromEnd(criterion.probation_ends_at)
      : undefined;

  return (
    <Box data-testid='availability-criterion-body'>
      <Typography variant='body1'>
        {t('sealAvailabilityIntro', { months: AVAILABILITY_HISTORY_MONTHS })}{' '}
        {t(summary.key, summary.values)}
      </Typography>

      {summary.graceDaysLeft != undefined && (
        <CriterionGraceCountdown
          title={t('sealAvailabilityGraceTitle', {
            days: summary.graceDaysLeft,
          })}
          description={t('sealAvailabilityGraceDescription')}
        />
      )}

      {probationWindow != undefined && (
        <CriterionProbationProgress
          probationWindow={probationWindow}
          now={now}
        />
      )}

      {hasHistory && (
        <>
          <AvailabilityHeatmap calendar={calendar} />
          <Box
            component='ul'
            sx={{
              listStyle: 'none',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              p: 0,
              m: 0,
              mt: 1,
            }}
          >
            <LegendItem
              color={theme.vars.palette.success.light}
              label={t('sealAvailabilitySuccessfulDays', {
                count: calendar.successCount,
              })}
            />
            <LegendItem
              color={theme.vars.palette.error.main}
              label={t('sealAvailabilityFailedDays', {
                count: calendar.failureCount,
              })}
            />
            {calendar.uncheckedCount > 0 && (
              <LegendItem
                color={theme.vars.palette.action.disabledBackground}
                label={t('sealAvailabilityUncheckedDays', {
                  count: calendar.uncheckedCount,
                })}
              />
            )}
          </Box>
        </>
      )}
    </Box>
  );
}

function LegendItem({
  color,
  label,
}: {
  color: string;
  label: string;
}): React.ReactElement {
  return (
    <Typography
      component='li'
      variant='caption'
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
    >
      <CircleIcon aria-hidden sx={{ color, fontSize: '0.7rem' }} />
      {label}
    </Typography>
  );
}
