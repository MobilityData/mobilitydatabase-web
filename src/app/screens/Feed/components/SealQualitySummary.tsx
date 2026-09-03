'use client';

import * as React from 'react';
import { Box, Button, Tooltip, Typography, useTheme } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useTranslations } from 'next-intl';
import { Link } from '../../../../i18n/navigation';
import {
  API_CRITERION_TO_KEY,
  SEAL_CRITERION_ICONS,
} from '../../../constants/sealCriteria';
import { type components } from '../../../services/feeds/types';

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];

type CriterionDisplayStatus =
  | 'pass'
  | 'atRisk'
  | 'fail'
  | 'notApplicable'
  | 'notEvaluated'
  | 'probation';

// `on_probation` is independent of `status` - a criterion can read `pass`
// while on probation and still not count towards the seal, so it takes
// priority over the status-derived states below.
function getCriterionDisplayStatus(
  criterion: ReliabilityCriterion,
): CriterionDisplayStatus {
  if (criterion.on_probation) {
    return 'probation';
  }
  switch (criterion.status) {
    case 'pass':
      return 'pass';
    case 'fail':
      return criterion.in_grace_period ? 'atRisk' : 'fail';
    case 'not_applicable':
      return 'notApplicable';
    case 'unknown':
    case 'never_evaluated':
      return 'notEvaluated';
  }
}

export interface SealQualitySummaryProps {
  feedId: string;
  feedDataType: string;
  reliability: components['schemas']['FeedReliabilityReport'] | undefined;
}

export default function SealQualitySummary({
  feedId,
  feedDataType,
  reliability,
}: SealQualitySummaryProps): React.ReactElement {
  const t = useTranslations('feeds');
  const tSeal = useTranslations('sealOfReliability');
  const theme = useTheme();

  const criteria = reliability?.criteria ?? [];
  const hasSeal = reliability?.has_seal ?? false;
  const anyInGracePeriod = criteria.some((c) => c.in_grace_period);
  // not_applicable criteria are withdrawn from the seal entirely, so they
  // shouldn't count towards "X out of Y criteria met"
  const consideredCriteria = criteria.filter(
    (c) => c.status !== 'not_applicable',
  );
  const passedCriteriaCount = consideredCriteria.filter(
    (c) => c.status === 'pass' && !c.on_probation,
  ).length;

  const sealStatus: 'earned' | 'gracePeriod' | 'notEarned' = !hasSeal
    ? 'notEarned'
    : anyInGracePeriod
      ? 'gracePeriod'
      : 'earned';

  return (
    <Box data-testid='seal-quality-row' sx={{ ml: 2 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'start',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box data-testid='seal-status' sx={{ display: 'grid' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {sealStatus === 'earned' && (
                <CheckCircleIcon
                  fontSize='small'
                  color='success'
                  sx={{ mr: 0.5 }}
                />
              )}
              {sealStatus === 'gracePeriod' && (
                <WarningAmberIcon
                  fontSize='small'
                  color='warning'
                  sx={{ mr: 0.5 }}
                />
              )}
              {sealStatus === 'notEarned' && (
                <BlockIcon fontSize='small' color='disabled' sx={{ mr: 0.5 }} />
              )}
              <Typography variant='body1' fontWeight={600}>
                {sealStatus === 'earned' && t('sealEarnedLabel')}
                {sealStatus === 'gracePeriod' && t('sealInGracePeriodLabel')}
                {sealStatus === 'notEarned' && t('sealNotYetEarnedLabel')}
              </Typography>
            </Box>
            <Typography
              variant='caption'
              color='text.secondary'
              sx={{ maxWidth: '200px', lineHeight: '1rem' }}
            >
              {sealStatus === 'earned' && t('sealEarnedCaption')}
              {sealStatus === 'gracePeriod' && t('sealGracePeriodCaption')}
              {sealStatus === 'notEarned' &&
                consideredCriteria.length > 0 &&
                t('sealCriteriaMetCaption', {
                  passed: passedCriteriaCount,
                  total: consideredCriteria.length,
                })}
            </Typography>
          </Box>

          <Box sx={{ mt: 0.5 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {criteria.map((criterion) => {
                const key = API_CRITERION_TO_KEY[criterion.criterion];
                const CriterionIcon = SEAL_CRITERION_ICONS[key];
                const displayStatus = getCriterionDisplayStatus(criterion);

                const color = {
                  pass: theme.palette.success.light,
                  atRisk: theme.palette.warning.light,
                  fail: theme.palette.error.light,
                  notApplicable: theme.palette.grey[500],
                  notEvaluated: theme.palette.grey[500],
                  probation: theme.palette.info.light,
                }[displayStatus];

                const statusLabel = {
                  pass: t('sealCriterionPass'),
                  atRisk: t('sealCriterionInGracePeriod'),
                  fail: t('sealCriterionFail'),
                  notApplicable: t('sealCriterionNotApplicable'),
                  notEvaluated: t('sealCriterionNotEvaluated'),
                  probation: t('sealCriterionOnProbation'),
                }[displayStatus];

                const graceNote =
                  displayStatus === 'atRisk' &&
                  criterion.grace_period_ends_at != null
                    ? ` ${t('sealCriterionGracePeriodNote', {
                        date: new Date(
                          criterion.grace_period_ends_at,
                        ).toDateString(),
                      })}`
                    : '';

                // not_applicable on this criterion only ever means the feed
                // is seasonal - seasonal feeds are excluded from the rolling
                // 7-day coverage check entirely.
                const seasonalNote =
                  key === 'freshRolling' && displayStatus === 'notApplicable'
                    ? ` ${t('sealCriterionSeasonalNote')}`
                    : '';

                const criterionDescription = `${tSeal(`criteria.${key}.title`)} — ${statusLabel}: ${tSeal(
                  `criteria.${key}.description`,
                )}${graceNote}${seasonalNote}`;

                return (
                  <Tooltip
                    key={criterion.criterion}
                    placement='top'
                    title={criterionDescription}
                  >
                    <Box
                      component='span'
                      tabIndex={0}
                      role='img'
                      aria-label={criterionDescription}
                      data-testid={`criterion-${key}-${displayStatus}`}
                      sx={{
                        display: 'inline-flex',
                        borderRadius: '50%',
                        '&:focus-visible': {
                          outline: `2px solid ${theme.palette.primary.main}`,
                          outlineOffset: 2,
                        },
                      }}
                    >
                      <CriterionIcon
                        fontSize='medium'
                        sx={{
                          backgroundColor: 'transparent',
                          borderRadius: '50%',
                          color,
                          border: '1px solid',
                          borderColor: color,
                          p: '4px',
                        }}
                      />
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mt: 1, alignItems: 'center' }}>
        <Button
          variant='text'
          color='secondary'
          size='small'
          sx={{ height: 'fit-content', mt: 0.5, ml: '-5px' }}
          component={Link}
          href={`/feeds/${feedDataType}/${feedId}/seal-of-reliability`}
        >
          {t('seeFullAnalysis')}
        </Button>
      </Box>
    </Box>
  );
}
