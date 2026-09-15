import * as React from 'react';
import { Alert, Box, Chip, Typography } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { getTranslations } from 'next-intl/server';
import { highlight } from './criterionHighlight';
import CoverageComparisonRows from './CoverageComparisonRows';
import CoverageSteps from './CoverageSteps';
import CriterionGraceCountdown from './CriterionGraceCountdown';
import CriterionProbationProgress from './CriterionProbationProgress';
import { type TrackTone } from '../../../components/TimelineTrack';
import {
  CONTINUOUS_MAX_COVERAGE_YEARS,
  buildCoverageComparison,
  getContinuousCoverageSummary,
  getCoverageWindowLength,
  getCoverageWindowTooltip,
  getDistinctFailureBoundary,
} from '../lib/continuous-coverage';
import {
  getCriterionDisplayStatus,
  getProbationWindowFromEnd,
} from '../../../constants/sealCriteria';
import { formatDateShort } from '../../../utils/date';
import { type components } from '../../../services/feeds/types';

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];
type ContinuousCoverageResponse =
  components['schemas']['GtfsFeedContinuousCoverageResponse'];

export interface ContinuousCoverageCriterionBodyProps {
  criterion: ReliabilityCriterion;
  /** Absent when the continuous-coverage call failed or returned nothing. */
  coverage?: ContinuousCoverageResponse;
  /** Pinned by the page so every date-derived branch agrees. */
  now: Date;
  /** Builds each row's dataset download link. Absent omits the link. */
  feedId?: string;
}

/**
 * Body of the "Fresh: continuous coverage" criterion: the files the
 * calculation reads, the service window the latest dataset declares, and the
 * datasets whose joins decide the verdict.
 *
 * At most four datasets are drawn, as two pairs on their own axes: the latest
 * dataset with the one before it, always; and - when the API reports a
 * failure on an older dataset - that dataset with the one before it, since
 * the latest pair on its own would not explain a seal the feed has lost.
 */
export default async function ContinuousCoverageCriterionBody({
  criterion,
  coverage,
  now,
  feedId,
}: ContinuousCoverageCriterionBodyProps): Promise<React.ReactElement> {
  const t = await getTranslations('feeds');
  const summary = getContinuousCoverageSummary(criterion, coverage, now);
  const displayStatus = getCriterionDisplayStatus(criterion);

  const latestComparison = buildCoverageComparison(
    coverage?.latest_state,
    feedId,
  );
  // Only drawn while the criterion is actually failing: atRisk has the grace
  // countdown, probation has its own note below, and pass needs no
  // explanation at all, so the historical failure diagram would only
  // relitigate a state the page has already accounted for elsewhere.
  const failureComparison =
    displayStatus === 'fail'
      ? buildCoverageComparison(getDistinctFailureBoundary(coverage), feedId)
      : undefined;

  const latest = coverage?.latest_state?.newer;
  const coverageWindow = latest?.coverage_window;
  const windowLength = getCoverageWindowLength(coverageWindow);
  const withinMax = latest?.within_max_coverage_window;

  const tone: TrackTone =
    displayStatus === 'fail' || displayStatus === 'atRisk'
      ? 'error'
      : displayStatus === 'notApplicable' || displayStatus === 'notEvaluated'
        ? 'neutral'
        : 'success';

  const probationWindow =
    displayStatus === 'probation'
      ? getProbationWindowFromEnd(
          criterion.probation_ends_at,
          criterion.last_failure_at,
        )
      : undefined;

  return (
    <Box data-testid='continuous-coverage-criterion-body'>
      <Typography variant='body1' sx={{ fontWeight: 700 }}>
        {t(summary.subtitleKey, { years: CONTINUOUS_MAX_COVERAGE_YEARS })}
      </Typography>
      <Typography variant='body1' sx={{ mt: 1 }}>
        {t('sealContinuousIntro', { years: CONTINUOUS_MAX_COVERAGE_YEARS })}
      </Typography>
      <Typography variant='body1' sx={{ mt: 1 }}>
        {t.rich(summary.key, { ...summary.values, b: highlight })}
      </Typography>

      {latestComparison != undefined && latestComparison.files.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography
            variant='caption'
            component='h4'
            sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}
          >
            {t('sealContinuousFilesTitle')}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {latestComparison.files.map((file) => (
              <Chip
                key={file.name}
                size='small'
                variant='outlined'
                color={file.present ? 'success' : 'default'}
                icon={
                  file.present ? (
                    <CheckCircleOutlineIcon fontSize='small' />
                  ) : (
                    <RemoveCircleOutlineIcon fontSize='small' />
                  )
                }
                label={
                  file.present
                    ? file.name
                    : t('sealContinuousFileMissing', { name: file.name })
                }
                sx={{ fontFamily: 'monospace' }}
              />
            ))}
          </Box>
        </Box>
      )}

      {coverageWindow != undefined && windowLength != undefined && (
        <Box sx={{ mt: 3 }} data-testid='continuous-coverage-window-section'>
          <Typography
            variant='subtitle1'
            component='h4'
            sx={{ fontWeight: 700 }}
          >
            {t('sealContinuousWindowSectionTitle')}
          </Typography>
          <Typography variant='body1' sx={{ color: 'text.secondary', mb: 1.5 }}>
            {t('sealContinuousWindowSectionDescription', {
              years: CONTINUOUS_MAX_COVERAGE_YEARS,
            })}
          </Typography>
          <CoverageSteps
            steps={[
              {
                id: 'start',
                label: t('sealContinuousCoverageStart'),
                value: formatDateShort(coverageWindow.start),
              },
              {
                id: 'end',
                label: t('sealContinuousCoverageEnd'),
                value: formatDateShort(coverageWindow.end),
              },
            ]}
            // The verdict is on how long the window runs, not on the date it
            // ends, so it is the span between the two stops that is marked.
            // Null means there was no window to measure, and nothing to mark.
            connectors={[
              {
                label: t(windowLength.key, windowLength.values),
                tooltip: t(
                  getCoverageWindowTooltip(withinMax).key,
                  getCoverageWindowTooltip(withinMax).values,
                ),
                ...(withinMax != null && {
                  tone: withinMax ? ('success' as const) : ('error' as const),
                }),
              },
            ]}
            sx={{ maxWidth: { sm: '70%' }, mx: 'auto' }}
          />
        </Box>
      )}

      <Box sx={{ mt: 3 }} data-testid='continuous-coverage-continuity-section'>
        <Typography variant='subtitle1' component='h4' sx={{ fontWeight: 700 }}>
          {t('sealContinuousContinuitySectionTitle')}
        </Typography>
        <Typography variant='body1' sx={{ mb: 1.5 }}>
          {t('sealContinuousContinuitySectionDescription')}
          {probationWindow != undefined && (
            <>
              {' '}
              {t.rich('sealContinuousProbationDetail', {
                fixedDate: formatDateShort(probationWindow.start.toISOString()),
                endDate: formatDateShort(probationWindow.end.toISOString()),
                b: highlight,
              })}
            </>
          )}
        </Typography>

        {latestComparison != undefined && (
          <Box sx={{ mt: 2 }}>
            <CoverageComparisonRows comparison={latestComparison} tone={tone} />
          </Box>
        )}

        {failureComparison != undefined && (
          <Box sx={{ mt: 2 }}>
            <Typography
              variant='subtitle2'
              component='h5'
              sx={{ fontWeight: 700 }}
            >
              {t('sealContinuousFailureTitle')}
            </Typography>
            <CoverageComparisonRows
              comparison={failureComparison}
              tone='error'
            />
          </Box>
        )}

        {latestComparison == undefined && failureComparison == undefined && (
          <Alert
            data-testid='continuous-coverage-no-history'
            severity='info'
            sx={{ mt: 2 }}
          >
            {t(
              // The endpoint failing and the endpoint reporting no datasets
              // both leave nothing to draw, but only one is worth retrying.
              coverage == undefined
                ? 'sealContinuousNoHistoryDescription'
                : 'sealContinuousNoHistory',
            )}
          </Alert>
        )}

        {summary.graceDaysLeft != undefined && (
          <CriterionGraceCountdown
            title={t('sealContinuousGraceTitle', {
              days: summary.graceDaysLeft,
            })}
            description={t('sealContinuousGraceDescription')}
          />
        )}

        {probationWindow != undefined && (
          <CriterionProbationProgress
            probationWindow={probationWindow}
            now={now}
          />
        )}
      </Box>
    </Box>
  );
}
