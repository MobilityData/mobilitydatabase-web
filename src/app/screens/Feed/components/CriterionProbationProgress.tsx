'use client';

import * as React from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  LinearProgress,
  Typography,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import {
  type ProbationWindow,
  getProbationProgressPercent,
} from '../../../constants/sealCriteria';
import { formatDateShort } from '../../../utils/date';

export interface CriterionProbationProgressProps {
  probationWindow: ProbationWindow;
  /** Pinned by the page so the bar renders the same either side of hydration. */
  now?: Date;
}

/**
 * How far a criterion has served of the six clean months it owes after a
 * confirmed failure.
 *
 * An info Alert rather than a warning: nothing is currently wrong, the
 * criterion is passing and rebuilding its record. The bar mirrors the
 * feed-level one in the seal banner, so the two read as the same clock.
 */
export default function CriterionProbationProgress({
  probationWindow,
  now,
}: CriterionProbationProgressProps): React.ReactElement {
  const t = useTranslations('feeds');
  const endsOn = formatDateShort(probationWindow.end.toISOString());

  return (
    <Alert
      data-testid='criterion-probation-note'
      severity='info'
      sx={{
        mt: 2,
        width: '100%',
        // Alert's message column is sized by its content, so the bar would
        // only span the widest line. Stretching the column is what actually
        // gives the bar - and the dates under it - the Alert's full width.
        '& .MuiAlert-message': { width: '100%', minWidth: 0 },
      }}
    >
      <AlertTitle>
        {t('sealCriterionProbationNote', { date: endsOn })}
      </AlertTitle>
      <LinearProgress
        variant='determinate'
        color='info'
        value={getProbationProgressPercent(probationWindow, now)}
        aria-label={t('sealProbationCaption')}
        sx={{ mt: 1, width: '100%' }}
      />
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 2,
          mt: 0.5,
        }}
      >
        <ProbationBound
          label={t('sealProbationStartDateLabel')}
          date={formatDateShort(probationWindow.start.toISOString())}
        />
        <ProbationBound
          label={t('sealProbationEarnDateLabel')}
          date={endsOn}
          align='right'
        />
      </Box>
    </Alert>
  );
}

function ProbationBound({
  label,
  date,
  align,
}: {
  label: string;
  date: string;
  align?: 'right';
}): React.ReactElement {
  return (
    <Box sx={{ textAlign: align }}>
      {/* Inherits the Alert's color rather than taking text.secondary, which
          would clash with the info palette. */}
      <Typography variant='caption' component='div' sx={{ opacity: 0.8 }}>
        {label}
      </Typography>
      <Typography variant='caption' component='div' sx={{ fontWeight: 700 }}>
        {date}
      </Typography>
    </Box>
  );
}
