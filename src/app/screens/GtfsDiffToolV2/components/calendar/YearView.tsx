'use client';

import { Box, Link, Tooltip, Typography } from '@mui/material';
import React from 'react';
import type { GtfsDate } from '../../lib/entity-diff-types';
import {
  MONTH_NAMES,
  type MonthCursor,
  WEEKDAY_SHORT,
  type DayCounts,
  countsTotal,
  formatGtfsDate,
  monthGrid,
  parseGtfsDate,
} from '../../lib/calendar-utils';
import { changeBackground } from './shared';

const CELL = 20;

interface YearViewProps {
  year: number;
  /** Change counts per kind of the dates with changes (filters applied). */
  days: Record<GtfsDate, DayCounts>;
  activeCounts: Record<GtfsDate, [number, number]>;
  focusedDate: GtfsDate | null;
  onDayClick: (date: GtfsDate) => void;
  onMonthClick: (cursor: MonthCursor) => void;
}

function MiniMonth({
  cursor,
  days,
  activeCounts,
  focusedDate,
  onDayClick,
  onMonthClick,
}: Omit<YearViewProps, 'year'> & { cursor: MonthCursor }): React.ReactElement {
  const changed = monthGrid(cursor)
    .flat()
    .filter((d): d is GtfsDate => d != null && days[d] != null).length;

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          mb: 0.5,
        }}
      >
        <Link
          component='button'
          type='button'
          underline='hover'
          color='text.primary'
          onClick={() => onMonthClick(cursor)}
          sx={{ fontWeight: 700, fontSize: '0.85rem' }}
        >
          {MONTH_NAMES[cursor.month]}
        </Link>
        {changed > 0 && (
          <Typography variant='caption' color='text.secondary'>
            {changed} day{changed === 1 ? '' : 's'} changed
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(7, ${CELL}px)`,
          gap: '3px',
        }}
      >
        {WEEKDAY_SHORT.map((w) => (
          <Typography
            key={w}
            sx={{
              fontSize: '0.6rem',
              textAlign: 'center',
              color: 'text.secondary',
            }}
          >
            {w[0]}
          </Typography>
        ))}
        {monthGrid(cursor)
          .flat()
          .map((date, i) => {
            if (date == null) return <Box key={`pad-${i}`} />;
            const day = days[date];
            const total = countsTotal(day);
            const [b, n] = activeCounts[date] ?? [0, 0];
            const cell = (
              <Box
                key={date}
                onClick={() => total > 0 && onDayClick(date)}
                sx={{
                  width: CELL,
                  height: CELL,
                  borderRadius: '3px',
                  background: changeBackground(day),
                  bgcolor:
                    total > 0
                      ? undefined
                      : b + n > 0
                        ? 'action.selected'
                        : 'transparent',
                  color: total > 0 ? '#fff' : 'text.secondary',
                  fontSize: '0.6rem',
                  fontWeight: total > 0 ? 700 : 400,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: total > 0 ? 'pointer' : 'default',
                  outline: date === focusedDate ? '2px solid' : 'none',
                  outlineColor: 'primary.main',
                }}
              >
                {parseGtfsDate(date).day}
              </Box>
            );
            if (total === 0) return cell;
            return (
              <Tooltip
                key={date}
                title={`${formatGtfsDate(date)} · +${day.added} added · −${day.removed} removed · ~${day.modified} modified`}
              >
                {cell}
              </Tooltip>
            );
          })}
      </Box>
    </Box>
  );
}

export default function YearView({
  year,
  ...rest
}: YearViewProps): React.ReactElement {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
        gap: 3,
      }}
    >
      {MONTH_NAMES.map((_, month) => (
        <MiniMonth key={month} cursor={{ year, month }} {...rest} />
      ))}
    </Box>
  );
}
