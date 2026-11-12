'use client';

import { Box, Typography } from '@mui/material';
import React from 'react';
import { formatGtfsDate } from '../../lib/calendar-utils';
import type { TripsDayCell } from '../../lib/trips-v5-calendar';
import { dayKindLabel, dayKindOf } from '../../lib/trips-v5-day-kinds';
import { ChangeTriplet } from '../trips-v3/shared';
import { KindDot } from './shared';

/** Tooltip of a day: its kind, the day it's compared with, its changes. */
export default function TripsV5DayTip({
  cell,
}: {
  cell: TripsDayCell;
}): React.ReactElement {
  const p = cell.period;
  const c = cell.counts;
  if (p == null || c == null)
    return <>{`${formatGtfsDate(cell.date)} · not compared`}</>;
  const kind = dayKindOf(p);
  return (
    <Box sx={{ py: 0.25 }}>
      <Typography variant='caption' fontWeight={700} component='div'>
        {formatGtfsDate(cell.date)}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {kind !== 'typical' ? <KindDot kind={kind} size={8} /> : null}
        <Typography variant='caption'>{dayKindLabel(p)}</Typography>
      </Box>
      {cell.base ? (
        <Typography variant='caption' component='div'>
          Compared {formatGtfsDate(cell.base)} (old)
        </Typography>
      ) : null}
      <Typography variant='caption' component='div'>
        {cell.changed === 0
          ? 'No trip changes'
          : `${cell.changed.toLocaleString()} trips change (${Math.round(p.share * 100)}%)`}{' '}
        · {c.base.toLocaleString()} → {c.new.toLocaleString()} trips
      </Typography>
      {cell.changed > 0 ? (
        // On a light chip: the change colours are too dark on the tooltip.
        <Box
          sx={{
            display: 'inline-block',
            mt: 0.25,
            px: 0.5,
            borderRadius: 1,
            bgcolor: 'background.paper',
          }}
        >
          <ChangeTriplet counts={c} size='0.72rem' />
        </Box>
      ) : null}
    </Box>
  );
}
