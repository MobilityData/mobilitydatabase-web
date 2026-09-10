'use client';

import * as React from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { useTranslations } from 'next-intl';
import { Link } from '../../../../i18n/navigation';
import CriterionProbationProgress from './CriterionProbationProgress';
import {
  API_CRITERION_TO_KEY,
  SEAL_CRITERION_ICONS,
  type SealCriterionContext,
  getCriterionCopy,
  getCriterionDisplayStatus,
  getCriterionStatusColor,
  getDaysUntil,
  getProbationWindowFromEnd,
} from '../../../constants/sealCriteria';
import { type components } from '../../../services/feeds/types';
import { formatDateShort } from '../../../utils/date';

export interface CriterionSectionProps {
  criterion: components['schemas']['ReliabilityCriterion'];
  context?: SealCriterionContext;
  /** The feed's producer URL, shown when its shape is what fails Stable. */
  producerUrl?: string;
  statusChip: React.ReactNode;
  /**
   * Extra chips for the header, placed left of the grace-period countdown and
   * the status chip - a criterion's own headline figure, such as uptime.
   */
  metaChips?: React.ReactNode;
  /**
   * Replaces the generic subtitle / description body. Criteria backed by
   * their own history endpoint - Available, Compliant - say more with that
   * data than the shared copy can, but keep this header and container.
   */
  children?: React.ReactNode;
  /**
   * Suppresses the section's own probation note. Available renders it itself,
   * inline with its grace-period countdown, instead of at the card's end.
   */
  hideProbationProgress?: boolean;
}

/**
 * One criterion presented as its own section: icon and title in the header
 * with a status chip on the right, then the wording the shared copy logic
 * picked for this criterion's state.
 */
export default function CriterionSection({
  criterion,
  context,
  producerUrl,
  statusChip,
  metaChips,
  children,
  hideProbationProgress,
}: CriterionSectionProps): React.ReactElement {
  const t = useTranslations('feeds');
  const tSeal = useTranslations('sealOfReliability');

  const key = API_CRITERION_TO_KEY[criterion.criterion];
  const CriterionIcon = SEAL_CRITERION_ICONS[key];
  const displayStatus = getCriterionDisplayStatus(criterion);
  const color = getCriterionStatusColor(displayStatus);
  const copy = getCriterionCopy(criterion, context);

  // Both states run to a deadline, and they are mutually exclusive - a
  // failure during probation restarts it rather than opening a grace period -
  // so one chip counts down whichever is running. `now` is pinned by the page
  // and threaded through the context so it renders identically on the server
  // and after hydration.
  const deadline =
    displayStatus === 'atRisk'
      ? criterion.grace_period_ends_at
      : displayStatus === 'probation'
        ? criterion.probation_ends_at
        : undefined;
  const daysLeft =
    deadline != null ? getDaysUntil(deadline, context?.now) : undefined;

  const graceNote =
    displayStatus === 'atRisk' && criterion.grace_period_ends_at != null
      ? t('sealCriterionGracePeriodNote', {
          date: formatDateShort(criterion.grace_period_ends_at),
        })
      : undefined;

  // Probation excludes a grace period - a failure during probation restarts
  // it outright - so these two never appear together. `probation_ends_at`
  // is null once the window has elapsed without the nightly job clearing it,
  // which leaves the chip to carry the state on its own.
  const probationWindow =
    displayStatus === 'probation'
      ? getProbationWindowFromEnd(criterion.probation_ends_at)
      : undefined;

  // Only the flagged-URL case is about the URL's shape, so only it earns the
  // side-by-side comparison.
  const showUrlComparison =
    copy.variant === 'unstableUrl' &&
    producerUrl != undefined &&
    producerUrl.length > 0;

  return (
    <Card
      variant='section'
      sx={{ mb: 0, height: '100%' }}
      data-testid={`criterion-section-${key}`}
    >
      {/* Wraps rather than clips: with a metric chip and a grace countdown
          alongside the status chip, the row outgrows a narrow card. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Typography
          component='h3'
          variant='h6'
          sx={{ mb: 0, display: 'flex', gap: 1, alignItems: 'center' }}
        >
          <CriterionIcon
            fontSize='medium'
            aria-hidden
            sx={{
              color,
              borderRadius: '50%',
              flexShrink: 0,
              height: '1.2em',
              width: '1.2em',
            }}
          />
          {tSeal(copy.titleKey)}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: 0.5,
          }}
        >
          <Tooltip title={t('howTheseAreCalculated')} placement='top'>
            <IconButton
              component={Link}
              href={`/seal-of-reliability/how-it-is-calculated#${key}`}
              target='_blank'
              rel='noreferrer'
              size='small'
              aria-label={t('howTheseAreCalculated')}
            >
              <InfoOutlinedIcon fontSize='inherit' />
            </IconButton>
          </Tooltip>
          {metaChips}
          {daysLeft != undefined && (
            <Chip
              data-testid='criterion-days-left-chip'
              size='small'
              variant='outlined'
              icon={<AccessTimeIcon aria-hidden />}
              label={t('sealCriterionDaysLeftChip', { days: daysLeft })}
              sx={{
                color,
                borderColor: color,
                flexShrink: 0,
                '& .MuiChip-icon': { color },
              }}
            />
          )}
          {statusChip}
        </Box>
      </Box>
      <CardContent sx={{ px: 0, '&:last-child': { pb: 0 } }}>
        {children ?? (
          <>
            <Typography variant='body1' sx={{ fontWeight: 700 }}>
              {tSeal(copy.subtitleKey)}
            </Typography>
            <Typography variant='body1' sx={{ mt: 1 }}>
              {tSeal(copy.descriptionKey)}
            </Typography>
            {graceNote != undefined && (
              <Typography variant='body1' sx={{ mt: 1 }}>
                {graceNote}
              </Typography>
            )}
            {showUrlComparison && (
              <Box data-testid='producer-url-comparison' sx={{ mt: 2 }}>
                <UrlBlock
                  label={t('sealCurrentProducerUrlLabel')}
                  url={producerUrl}
                  statusColor='error'
                />
                <UrlBlock
                  label={t('sealStableUrlExampleLabel')}
                  url={t('sealStableUrlExample')}
                  statusColor='success'
                  sx={{ mt: 1.5 }}
                />
              </Box>
            )}
          </>
        )}
        {!(hideProbationProgress ?? false) && probationWindow != undefined && (
          <CriterionProbationProgress
            probationWindow={probationWindow}
            now={context?.now}
          />
        )}
      </CardContent>
    </Card>
  );
}

function UrlBlock({
  label,
  url,
  statusColor,
  sx,
}: {
  label: string;
  url: string;
  /** Highlights the URL as the source of the failure or its fix. */
  statusColor?: 'error' | 'success';
  sx?: React.ComponentProps<typeof Box>['sx'];
}): React.ReactElement {
  return (
    <Box sx={sx}>
      <Typography variant='caption' component='div'>
        {label}
      </Typography>
      <Typography
        component='code'
        variant='body2'
        sx={{
          display: 'block',
          mt: 0.5,
          p: 1,
          borderRadius: '4px',
          backgroundColor: 'action.hover',
          overflowWrap: 'anywhere',
          ...(statusColor != null && {
            color: `${statusColor}.main`,
            border: '1px solid',
            borderColor: `${statusColor}.main`,
          }),
        }}
      >
        {url}
      </Typography>
    </Box>
  );
}
