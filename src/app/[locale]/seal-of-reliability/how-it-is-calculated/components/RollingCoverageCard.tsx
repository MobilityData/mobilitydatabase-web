import { Box, Card, Typography } from '@mui/material';
import { type ReactElement } from 'react';
import { getTranslations } from 'next-intl/server';
import { type RollingCoverageExample } from '../lib/content';
import { placeDateOnAxis, placeRangeOnAxis } from '../lib/timeline';
import TimelineTrack from './TimelineTrack';
import ResultChip from './ResultChip';

export default async function RollingCoverageCard({
  example,
}: {
  example: RollingCoverageExample;
}): Promise<ReactElement> {
  const t = await getTranslations('sealOfReliability.howItIsCalculated');
  const prefix = `freshRolling.examples.${example.id}`;

  const coverage = placeRangeOnAxis(
    { start: example.fetchDate, end: example.lastServiceDate },
    example.axis,
  );
  const minimumMarker = placeDateOnAxis(
    example.minimumServiceDate,
    example.axis,
  );

  return (
    <Card variant='section' sx={{ mb: 0 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          mb: 1.5,
        }}
      >
        <Typography variant='subtitle2' sx={{ fontWeight: 700 }}>
          {t(`${prefix}.title`)}
        </Typography>
        <ResultChip
          passes={example.passes}
          label={example.passes ? t('result.pass') : t('result.fail')}
        />
      </Box>

      <Box
        sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}
        aria-hidden
      >
        <Typography variant='caption' sx={{ color: 'text.secondary' }}>
          {t(`${prefix}.axisStart`)}
        </Typography>
        <Typography variant='caption' sx={{ color: 'text.secondary' }}>
          {t(`${prefix}.axisEnd`)}
        </Typography>
      </Box>

      <TimelineTrack
        ariaLabel={t(`${prefix}.diagramAriaLabel`)}
        segments={[
          {
            id: 'coverage',
            ...coverage,
            tone: example.passes ? 'success' : 'error',
          },
        ]}
        markers={[
          {
            id: 'minimum',
            leftPercent: minimumMarker,
            tone: 'neutral',
            label: t('freshRolling.minimumLabel'),
          },
        ]}
      />

      <Typography variant='body2' sx={{ fontWeight: 700, mt: 1 }}>
        {t(`${prefix}.lastService`)}
      </Typography>
      <Typography variant='caption' sx={{ color: 'text.secondary' }}>
        {t(`${prefix}.caption`)}
      </Typography>
    </Card>
  );
}
