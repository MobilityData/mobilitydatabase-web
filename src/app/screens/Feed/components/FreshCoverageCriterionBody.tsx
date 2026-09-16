import * as React from 'react';
import { Box, Typography } from '@mui/material';
import { getTranslations } from 'next-intl/server';
import { highlight } from './criterionHighlight';
import CoverageSteps from './CoverageSteps';
import CriterionGraceCountdown from './CriterionGraceCountdown';
import CriterionProbationProgress from './CriterionProbationProgress';
import TimelineTrack from '../../../components/TimelineTrack';
import AxisTicks from '../../../components/AxisTicks';
import {
  FRESH_COVERAGE_MINIMUM_DAYS,
  type LatestCoverageWindow,
  getFreshCoverageSteps,
  getFreshCoverageSummary,
} from '../lib/fresh-coverage';
import {
  getCriterionDisplayStatus,
  getProbationWindowFromEnd,
} from '../../../constants/sealCriteria';
import {
  fitsFullBandLabel,
  placeDateOnAxis,
  placeRangeOnAxis,
} from '../../../utils/timeline';
import { formatDateShort } from '../../../utils/date';
import { type components } from '../../../services/feeds/types';

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];

export interface FreshCoverageCriterionBodyProps {
  criterion: ReliabilityCriterion;
  /**
   * Service window of the feed's latest dataset. Absent when the
   * continuous-coverage call failed, which drops the diagram but leaves the
   * criterion's verdict intact.
   */
  serviceWindow?: LatestCoverageWindow;
  /** Pinned by the page so every date-derived branch agrees. */
  now: Date;
}

/**
 * Body of the "Fresh: rolling 7 days of coverage" criterion: the latest
 * dataset's whole service window as one bar, with a line naming the date it
 * has to reach, and - while coverage is short and still inside its 14-day
 * window - how long is left to publish an update.
 */
export default async function FreshCoverageCriterionBody({
  criterion,
  serviceWindow,
  now,
}: FreshCoverageCriterionBodyProps): Promise<React.ReactElement> {
  const t = await getTranslations('feeds');
  const displayStatus = getCriterionDisplayStatus(criterion);
  // Drops "today" from the summary row entirely: both of these states have
  // already dropped it from the diagram too (see `diagramTone` below), and
  // today having last mattered days, months or years ago makes a poor first
  // stop for a row that otherwise reads left to right. `atRisk` still reads
  // as a warning rather than a failure - the grace period hasn't run out.
  const compactTone =
    displayStatus === 'fail'
      ? ('error' as const)
      : displayStatus === 'atRisk'
        ? ('warning' as const)
        : undefined;
  const summary = getFreshCoverageSummary(criterion, serviceWindow, now);
  const window = summary.window;
  const steps =
    window != undefined
      ? getFreshCoverageSteps(window, compactTone)
      : undefined;
  // The diagram's own verdict colour: `atRisk` is tinted as a warning since
  // the grace period hasn't run out, everything else short of the minimum
  // reads as the failing colour it already used.
  const diagramTone: 'success' | 'warning' | 'error' =
    displayStatus === 'atRisk'
      ? 'warning'
      : window == undefined || window.meetsMinimum
        ? 'success'
        : 'error';
  // Only set while coverage falls short; see `missingCoverageBand`.
  const missingCoverageBand =
    window?.missingCoverageBand != undefined
      ? placeRangeOnAxis(window.missingCoverageBand, window.axis)
      : undefined;

  // Probation excludes a grace period, so only one of these ever renders.
  const probationWindow =
    displayStatus === 'probation'
      ? getProbationWindowFromEnd(
          criterion.probation_ends_at,
          criterion.last_failure_at,
        )
      : undefined;

  return (
    <Box data-testid='fresh-coverage-criterion-body'>
      <Typography variant='body1' sx={{ fontWeight: 700 }}>
        {t(summary.subtitleKey, { minimumDays: FRESH_COVERAGE_MINIMUM_DAYS })}
      </Typography>
      <Typography variant='body1' sx={{ mt: 1 }}>
        {t.rich(summary.key, { ...summary.values, b: highlight })}
      </Typography>

      {window != undefined && steps != undefined && (
        <>
          <CoverageSteps
            steps={steps.steps.map((step) => ({
              id: step.id,
              label: t(step.labelKey),
              value: formatDateShort(step.date),
              ...(step.tone != undefined && { tone: step.tone }),
              ...(step.tooltipKey != undefined && {
                tooltip: t(step.tooltipKey, {
                  minimumDays: FRESH_COVERAGE_MINIMUM_DAYS,
                }),
              }),
            }))}
            connectors={steps.connectors.map((connector) => ({
              label: t(connector.key, connector.values),
              ...(connector.tone != undefined && { tone: connector.tone }),
            }))}
            sx={{ mt: 4, maxWidth: { sm: '70%' }, mx: 'auto' }}
          />

          <Box sx={{ mt: 3 }}>
            {/* While still inside the grace period, the axis has little room
              to spare past the required date - the feed only just fell
              short - so the label reads above the track instead of beside
              the line, where it would otherwise crowd the edge. */}
            {displayStatus === 'atRisk' && (
              <AxisTicks
                ticks={[
                  {
                    id: 'required-above',
                    leftPercent: placeDateOnAxis(
                      window.minimumDate,
                      window.axis,
                    ),
                    label: t('sealFreshRollingMinimumLabel'),
                    tooltip: formatDateShort(window.minimumDate),
                    bold: true,
                    center: true,
                  },
                ]}
              />
            )}
            <TimelineTrack
              ariaLabel={t('sealFreshRollingDiagramLabel', {
                start: formatDateShort(
                  window.serviceStartDate ?? window.serviceEndDate,
                ),
                end: formatDateShort(window.serviceEndDate),
                minimum: formatDateShort(window.minimumDate),
                minimumDays: FRESH_COVERAGE_MINIMUM_DAYS,
              })}
              segments={[
                // The dataset's own declared window, coloured by whether it
                // reaches the minimum the criterion requires.
                {
                  id: 'coverage',
                  ...placeRangeOnAxis(window.bar, window.axis),
                  tone: diagramTone,
                  // Squared off where the missing-coverage band picks up
                  // immediately after it, so the pair reads as one shape.
                  roundedEnd: missingCoverageBand == undefined,
                },
                // Coverage falling short leaves this stretch bare, so it is
                // outlined rather than filled, and only labelled once it is
                // wide enough to hold the words rather than clipping them
                // away. Continues the bar above with no border or radius of
                // its own on the side where the two meet.
                ...(missingCoverageBand != undefined
                  ? [
                      {
                        id: 'missing-coverage',
                        ...missingCoverageBand,
                        tone:
                          diagramTone === 'warning'
                            ? ('warningDashed' as const)
                            : ('errorDashed' as const),
                        roundedStart: false,
                        ...(fitsFullBandLabel(
                          missingCoverageBand.widthPercent,
                        ) && {
                          label: t('sealFreshRollingMissingCoverageLabel'),
                        }),
                      },
                    ]
                  : []),
              ]}
              // Named on the line itself rather than by a tick below, since
              // there is no longer a "today" to space it against - except
              // while at risk, where the tick above already carries the
              // label (see above). Drawn without its own line whenever the
              // missing-coverage band already ends exactly there - a second
              // line on top of that border would only double it up.
              markers={[
                {
                  id: 'required',
                  leftPercent: placeDateOnAxis(window.minimumDate, window.axis),
                  tone: diagramTone,
                  ...(displayStatus !== 'atRisk' && {
                    label: t('sealFreshRollingMinimumLabel'),
                  }),
                  showLine: missingCoverageBand == undefined,
                },
              ]}
            />
            <AxisTicks
              ticks={[
                ...(window.serviceStartDate != undefined
                  ? [
                      {
                        id: 'service-start-date',
                        leftPercent: placeDateOnAxis(
                          window.serviceStartDate,
                          window.axis,
                        ),
                        label: t('sealFreshRollingServiceStartDate', {
                          date: formatDateShort(window.serviceStartDate),
                        }),
                      },
                    ]
                  : []),
                {
                  id: 'service-end-date',
                  leftPercent: placeDateOnAxis(
                    window.serviceEndDate,
                    window.axis,
                  ),
                  label: t('sealFreshRollingServiceEndDate', {
                    date: formatDateShort(window.serviceEndDate),
                  }),
                  // Coverage that falls short leaves track beyond its end -
                  // the axis runs on to the required date - so the label has
                  // to sit on the line rather than be tucked in from an edge
                  // that is no longer there.
                  center: !window.meetsMinimum,
                },
              ]}
            />
          </Box>
        </>
      )}

      {summary.graceDaysLeft != undefined && (
        <CriterionGraceCountdown
          title={t('sealFreshRollingGraceTitle', {
            days: summary.graceDaysLeft,
          })}
          description={t('sealFreshRollingGraceDescription', {
            minimumDays: FRESH_COVERAGE_MINIMUM_DAYS,
          })}
        />
      )}

      {probationWindow != undefined && (
        <CriterionProbationProgress
          probationWindow={probationWindow}
          now={now}
        />
      )}
    </Box>
  );
}
