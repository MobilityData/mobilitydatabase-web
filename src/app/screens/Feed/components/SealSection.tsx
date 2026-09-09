import * as React from 'react';
import { Box, Chip, LinearProgress, Tooltip, Typography } from '@mui/material';
import { getTranslations } from 'next-intl/server';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SectionContainer from '../../../components/SectionContainer';
import SealOfReliability from '../../../components/SealOfReliability';
import {
  API_CRITERION_TO_KEY,
  SEAL_CRITERION_ICONS,
  SEAL_STATUS_LABEL_KEYS,
  getConsideredCriteria,
  getCriterionDescription,
  getCriterionDisplayStatus,
  getCriterionStatusColor,
  getDaysUntil,
  getGracePeriodCriteria,
  getPassedCriteriaCount,
  getProbationProgressPercent,
  getProbationWindow,
  getSealDisplayStatus,
  getSoonestGracePeriodEnd,
  joinWithAnd,
  type SealCriterionContext,
} from '../../../constants/sealCriteria';
import { type components } from '../../../services/feeds/types';
import { formatDateShort } from '../../../utils/date';
import { theme } from '../../../Theme';

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];

export interface SealSectionProps {
  reliability: components['schemas']['FeedReliabilityReport'] | undefined;
  criterionContext?: SealCriterionContext;
  backgroundColor?: string;
}

/**
 * "Seal" section of the reliability analysis page: the seal itself on the
 * left, and the per-criterion breakdown on the right. Criterion colors come
 * from the same shared logic as the feed detail page's seal row.
 *
 * Renders on the server - nothing here is interactive. The interactive leaves
 * it renders (Tooltip, the seal image) are Client Components in their own
 * right, and colors come from the theme module rather than `useTheme`.
 */
export default async function SealSection({
  reliability,
  criterionContext,
  backgroundColor,
}: SealSectionProps): Promise<React.ReactElement | null> {
  const [t, tSeal, tCommon] = await Promise.all([
    getTranslations('feeds'),
    getTranslations('sealOfReliability'),
    getTranslations('common'),
  ]);
  // Pinned by the caller (see FeedReliabilityView) so the countdown and the
  // progress bar match whatever the rest of the page rendered against.
  const now = criterionContext?.now ?? new Date();

  if (reliability == undefined) {
    return null;
  }

  const criteria = reliability.criteria ?? [];
  const context: SealCriterionContext = { ...criterionContext, now };
  const sealStatus = getSealDisplayStatus(reliability);
  const hasSeal = sealStatus === 'earned' || sealStatus === 'gracePeriod';
  const probationWindow =
    sealStatus === 'probation' ? getProbationWindow(reliability) : undefined;

  const shortTitle = (criterion: ReliabilityCriterion): string =>
    tSeal(`criteria.${API_CRITERION_TO_KEY[criterion.criterion]}.shortTitle`);

  const statusDescription = ((): string => {
    switch (sealStatus) {
      case 'earned':
        return t('sealStatusEarnedDescription');
      case 'gracePeriod': {
        const atRisk = getGracePeriodCriteria(criteria);
        const soonestDeadline = getSoonestGracePeriodEnd(criteria);
        return t('sealStatusGracePeriodDescription', {
          days:
            soonestDeadline != null ? getDaysUntil(soonestDeadline, now) : 0,
          criteria: joinWithAnd(atRisk.map(shortTitle), tCommon('and')),
          criteriaCount: atRisk.length,
        });
      }
      case 'probation':
        return t('sealStatusProbationDescription');
      case 'notEarned':
        return t('sealStatusNotEarnedDescription', {
          passed: getPassedCriteriaCount(criteria),
          total: getConsideredCriteria(criteria).length,
        });
    }
  })();

  return (
    <SectionContainer
      data-testid='seal-section'
      sx={{ mt: 2, ...(backgroundColor != null && { backgroundColor }) }}
      maxWidth='xl'
    >
      <Box
        sx={{
          display: 'flex',
          flexWrap: { xs: 'wrap', md: 'nowrap' },
          alignItems: 'center',
          gap: 4,
        }}
      >
        <Box
          sx={{
            width: { xs: '100%', md: '20%' },
            display: 'flex',
            justifyContent: 'center',
            // A full-color seal on a feed that doesn't hold it would misread
            opacity: hasSeal ? 1 : 0.35,
            filter: hasSeal ? 'none' : 'grayscale(1)',
          }}
        >
          <SealOfReliability size='xlarge' />
        </Box>

        <Box sx={{ width: { xs: '100%', md: '70%' } }}>
          <Typography
            component='h3'
            variant='h5'
            sx={{
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            {sealStatus === 'earned' && (
              <CheckCircleIcon color='success' aria-hidden fontSize='large' />
            )}
            {t(SEAL_STATUS_LABEL_KEYS[sealStatus])}
          </Typography>
          <Typography
            data-testid='seal-status-description'
            variant='body1'
            color='text.secondary'
            sx={{ mt: 0.5 }}
          >
            {statusDescription}
          </Typography>

          <Box
            component='ul'
            sx={{
              listStyle: 'none',
              p: 0,
              m: 0,
              mt: 2,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 2,
            }}
          >
            {criteria.map((criterion) => {
              const key = API_CRITERION_TO_KEY[criterion.criterion];
              const CriterionIcon = SEAL_CRITERION_ICONS[key];
              const displayStatus = getCriterionDisplayStatus(criterion);
              const color = getCriterionStatusColor(displayStatus);
              const description = getCriterionDescription(
                criterion,
                t,
                tSeal,
                context,
              );

              const contrastText = {
                pass: theme.vars.palette.success.contrastText,
                atRisk: theme.vars.palette.warning.contrastText,
                fail: theme.vars.palette.error.contrastText,
                notApplicable: theme.vars.palette.common.black,
                notEvaluated: theme.vars.palette.common.black,
                probation: theme.vars.palette.info.contrastText,
              }[displayStatus];

              return (
                <Tooltip
                  key={criterion.criterion}
                  placement='top'
                  title={description}
                >
                  <Chip
                    component='li'
                    tabIndex={0}
                    data-testid={`seal-criterion-${key}-${displayStatus}`}
                    variant='filled'
                    icon={<CriterionIcon aria-hidden />}
                    label={tSeal(`criteria.${key}.shortTitle`)}
                    sx={{
                      backgroundColor: color,
                      color: contrastText,
                      '& .MuiChip-icon': { color: contrastText },
                      '&:focus-visible': {
                        outline: `2px solid ${theme.vars.palette.primary.main}`,
                        outlineOffset: 2,
                      },
                    }}
                  />
                </Tooltip>
              );
            })}
          </Box>

          {hasSeal && reliability.earned_at != null && (
            <Typography
              data-testid='seal-earned-on'
              variant='caption'
              color='text.secondary'
              sx={{ mt: 1 }}
            >
              {t('sealEarnedOn', {
                date: formatDateShort(reliability.earned_at),
              })}
            </Typography>
          )}

          {probationWindow != undefined && (
            <Box data-testid='probation-progress' sx={{ mt: 3 }}>
              <LinearProgress
                variant='determinate'
                value={getProbationProgressPercent(probationWindow, now)}
                aria-label={t('sealProbationCaption')}
              />
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 2,
                  mt: 0.5,
                }}
              >
                <Box>
                  <Typography
                    variant='caption'
                    color='text.secondary'
                    component='div'
                  >
                    {t('sealProbationStartDateLabel')}
                  </Typography>
                  <Typography variant='caption' component='div'>
                    {formatDateShort(probationWindow.start.toISOString())}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography
                    variant='caption'
                    color='text.secondary'
                    component='div'
                  >
                    {t('sealProbationEarnDateLabel')}
                  </Typography>
                  <Typography variant='caption' component='div'>
                    {formatDateShort(probationWindow.end.toISOString())}
                  </Typography>
                </Box>
              </Box>
              <Typography variant='body2' sx={{ mt: 1, fontWeight: 700 }}>
                {t('sealProjectedSealDate', {
                  date: formatDateShort(probationWindow.end.toISOString()),
                })}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </SectionContainer>
  );
}
