'use client';

import * as React from 'react';
import { Box, Button, Tooltip, Typography, useTheme } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { useTranslations } from 'next-intl';
import { Link } from '../../../../i18n/navigation';
import {
  API_CRITERION_TO_KEY,
  SEAL_CRITERION_ICONS,
  SEAL_STATUS_LABEL_KEYS,
  getConsideredCriteria,
  getCriterionDescription,
  getCriterionDisplayStatus,
  getCriterionStatusColor,
  getPassedCriteriaCount,
  getSealDisplayStatus,
  type SealCriterionContext,
} from '../../../constants/sealCriteria';
import { type components } from '../../../services/feeds/types';

export interface SealQualitySummaryProps {
  feedId: string;
  feedDataType: string;
  reliability: components['schemas']['FeedReliabilityReport'] | undefined;
  /** Feed-level facts that change how some criteria are worded. */
  criterionContext?: SealCriterionContext;
}

export default function SealQualitySummary({
  feedId,
  feedDataType,
  reliability,
  criterionContext,
}: SealQualitySummaryProps): React.ReactElement {
  const t = useTranslations('feeds');
  const tSeal = useTranslations('sealOfReliability');
  const theme = useTheme();

  const criteria = reliability?.criteria ?? [];
  const consideredCriteria = getConsideredCriteria(criteria);
  const passedCriteriaCount = getPassedCriteriaCount(criteria);
  const sealStatus = getSealDisplayStatus(reliability);

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
              {sealStatus === 'probation' && (
                <HourglassEmptyIcon
                  fontSize='small'
                  color='info'
                  sx={{ mr: 0.5 }}
                />
              )}
              {sealStatus === 'notEarned' && (
                <BlockIcon fontSize='small' color='disabled' sx={{ mr: 0.5 }} />
              )}
              <Typography variant='body1' fontWeight={600}>
                {t(SEAL_STATUS_LABEL_KEYS[sealStatus])}
              </Typography>
            </Box>
            <Typography
              variant='caption'
              color='text.secondary'
              sx={{ maxWidth: '200px', lineHeight: '1rem' }}
            >
              {sealStatus === 'earned' && t('sealEarnedCaption')}
              {sealStatus === 'gracePeriod' && t('sealGracePeriodCaption')}
              {sealStatus === 'probation' && t('sealProbationCaption')}
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

                const color = getCriterionStatusColor(displayStatus, theme);
                const criterionDescription = getCriterionDescription(
                  criterion,
                  t,
                  tSeal,
                  criterionContext,
                );

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
