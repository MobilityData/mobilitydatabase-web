'use client';

import { Box, Tooltip, Typography } from '@mui/material';
import React, { useMemo } from 'react';
import type { GtfsDate } from '../../lib/entity-diff-types';
import {
  type MonthCursor,
  WEEKDAY_SHORT,
  type DayCounts,
  countsTotal,
  monthGrid,
  parseGtfsDate,
} from '../../lib/calendar-utils';
import { ChangeSquares } from './shared';

interface MonthViewProps {
  cursor: MonthCursor;
  /** Change counts per kind of the dates with changes (filters applied). */
  days: Record<GtfsDate, DayCounts>;
  activeCounts: Record<GtfsDate, [number, number]>;
  focusedDate: GtfsDate | null;
  onDayClick: (date: GtfsDate) => void;
}

export default function MonthView({
  cursor,
  days,
  activeCounts,
  focusedDate,
  onDayClick,
}: MonthViewProps): React.ReactElement {
  const weeks = useMemo(() => monthGrid(cursor), [cursor]);

  return (
    <Box
      role='grid'
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gap: '4px',
      }}
    >
      {WEEKDAY_SHORT.map((w) => (
        <Typography
          key={w}
          variant='caption'
          color='text.secondary'
          fontWeight={700}
          sx={{ textAlign: 'center', pb: 0.5 }}
        >
          {w}
        </Typography>
      ))}
      {weeks.flat().map((date, i) => {
        if (date == null) return <Box key={`pad-${i}`} />;
        const day = days[date];
        const total = countsTotal(day);
        const [baseActive, newActive] = activeCounts[date] ?? [0, 0];
        const hasService = baseActive + newActive > 0;
        const focused = date === focusedDate;
        return (
          <Box
            key={date}
            role='gridcell'
            tabIndex={total > 0 ? 0 : -1}
            aria-label={`${date}: ${total} changes`}
            onClick={() => total > 0 && onDayClick(date)}
            onKeyDown={(e) => {
              if (total > 0 && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onDayClick(date);
              }
            }}
            sx={{
              minHeight: { xs: 64, sm: 88 },
              p: 0.75,
              borderRadius: '6px',
              border: '1px solid',
              borderColor: focused ? 'primary.main' : 'divider',
              outline: focused ? '1px solid' : 'none',
              outlineColor: 'primary.main',
              bgcolor: hasService ? 'background.paper' : 'action.hover',
              cursor: total > 0 ? 'pointer' : 'default',
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              transition: 'box-shadow 120ms',
              '&:hover': total > 0 ? { boxShadow: 2 } : undefined,
              '&:focus-visible': {
                outline: '2px solid',
                outlineColor: 'primary.main',
              },
            }}
          >
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <Typography variant='body2' fontWeight={700}>
                {parseGtfsDate(date).day}
              </Typography>
              {hasService && (
                <Tooltip
                  title={`Active services: ${baseActive} before → ${newActive} after`}
                >
                  <Typography
                    variant='caption'
                    sx={{
                      color:
                        baseActive === newActive
                          ? 'text.secondary'
                          : newActive > baseActive
                            ? '#2e7d32'
                            : '#d32f2f',
                      fontSize: '0.65rem',
                    }}
                  >
                    {baseActive === newActive
                      ? newActive
                      : `${baseActive}→${newActive}`}
                  </Typography>
                </Tooltip>
              )}
            </Box>
            <ChangeSquares day={day} />
          </Box>
        );
      })}
    </Box>
  );
}
