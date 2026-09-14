import { Box, Card, Typography } from '@mui/material';
import { type ReactElement } from 'react';
import { getTranslations } from 'next-intl/server';
import { type ScenarioEntry } from '../lib/content';
import {
  type DateRange,
  findGapSpans,
  placeDateOnAxis,
  placeRangeOnAxis,
} from '../lib/timeline';
import TimelineTrack, {
  type TrackSegment,
  type TrackTone,
} from './TimelineTrack';
import AxisTicks from './AxisTicks';
import ResultChip from './ResultChip';
import RichText from '../../../../components/RichText';

export default async function ScenarioCard({
  scenario,
}: {
  scenario: ScenarioEntry;
}): Promise<ReactElement> {
  const t = await getTranslations('sealOfReliability.howItIsCalculated');
  const prefix = `freshContinuous.scenarios.${scenario.id}`;
  const tone: TrackTone = scenario.passes ? 'success' : 'error';

  const gapLabel = t('freshContinuous.scenarios.gapLabel');

  /** Outlined placeholders sitting in the empty space between datasets. */
  const gapSegments = (ranges: DateRange[], idPrefix: string): TrackSegment[] =>
    findGapSpans(ranges).map((gap, index) => ({
      id: `${idPrefix}-gap-${index}`,
      ...placeRangeOnAxis(gap, scenario.axis),
      label: gapLabel,
      tone: 'gap' as const,
    }));

  const calendarSegments: TrackSegment[] = [
    ...gapSegments(scenario.calendarDatasets, 'calendar'),
    ...scenario.calendarDatasets.map((dataset, index) => ({
      id: `calendar-${index}`,
      ...placeRangeOnAxis(dataset, scenario.axis),
      label: t(dataset.labelKey),
      tone,
    })),
  ];

  const declaredRanges = scenario.declaredRanges ?? [];
  const declaredSegments: TrackSegment[] = [
    ...gapSegments(declaredRanges, 'declared'),
    ...declaredRanges.map((range, index) => ({
      id: `declared-${index}`,
      ...placeRangeOnAxis(range, scenario.axis),
      tone,
    })),
  ];

  const axisTicks = scenario.axisTicks.map((tick) => ({
    id: tick.date,
    leftPercent: placeDateOnAxis(tick.date, scenario.axis),
    label: t(tick.labelKey),
  }));

  return (
    <Card variant='section' sx={{ mb: 0 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Typography variant='subtitle2' sx={{ fontWeight: 700 }}>
          {t(`${prefix}.title`)}
        </Typography>
        <ResultChip
          passes={scenario.passes}
          label={scenario.passes ? t('result.pass') : t('result.fail')}
        />
      </Box>

      {declaredSegments.length > 0 ? (
        <Typography variant='caption' sx={{ color: 'text.secondary' }}>
          <RichText text={t('freshContinuous.scenarios.feedInfoPresent')} />
        </Typography>
      ) : null}

      <Typography
        variant='caption'
        component='p'
        sx={{ color: 'text.secondary', mt: 1.5, mb: 0.5 }}
      >
        {t('freshContinuous.scenarios.calendarSourceLabel')}
      </Typography>
      <TimelineTrack
        ariaLabel={t(`${prefix}.diagramAriaLabel`)}
        segments={calendarSegments}
      />
      {declaredSegments.length === 0 ? <AxisTicks ticks={axisTicks} /> : null}

      {declaredSegments.length > 0 ? (
        <>
          <Typography
            variant='caption'
            component='p'
            sx={{ color: 'text.secondary', mt: 1.5, mb: 0.5 }}
          >
            <RichText
              text={t('freshContinuous.scenarios.declaredSourceLabel')}
            />
          </Typography>
          <TimelineTrack
            ariaLabel={t(`${prefix}.declaredDiagramAriaLabel`)}
            segments={declaredSegments}
          />
          <AxisTicks ticks={axisTicks} />
        </>
      ) : null}

      <Typography
        variant='caption'
        component='p'
        sx={{ color: 'text.secondary', mt: 1.5 }}
      >
        <RichText text={t(`${prefix}.caption`)} />
      </Typography>
    </Card>
  );
}
