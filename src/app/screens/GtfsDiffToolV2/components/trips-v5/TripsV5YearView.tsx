'use client';

import {
  Box,
  Link,
  type SxProps,
  type Theme,
  Tooltip,
  Typography,
} from '@mui/material';
import React, { useMemo } from 'react';
import type { GtfsDate } from '../../lib/entity-diff-types';
import {
  MONTH_NAMES,
  type MonthCursor,
  WEEKDAY_SHORT,
} from '../../lib/calendar-utils';
import type { TripsCalendarDoc } from '../../lib/trips-calendar';
import type { ServicePeriod } from '../../lib/trips-periods';
import {
  type TripsDayCell,
  changedDays,
  dayAriaLabel,
  tripsMonthCells,
  yearMonths,
} from '../../lib/trips-v5-calendar';
import { DAY_KINDS, dayKindOf } from '../../lib/trips-v5-day-kinds';
import TripsV5DayTip from './TripsV5DayTip';
import { dayKindColor, dayShade } from './shared';
import { type CalendarPalette, useCalendarPalette } from './palette';

const CELL = 20;

const MINI_GRID_SX = {
  display: 'grid',
  gridTemplateColumns: `repeat(7, ${CELL}px)`,
  gap: '3px',
} as const;

function cellSx(palette: CalendarPalette): SxProps<Theme> {
  return {
    width: CELL,
    height: CELL,
    borderRadius: '3px',
    color: 'text.disabled',
    fontSize: '0.6rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 120ms, transform 120ms',
    '&[data-compared="true"]': {
      color: 'text.primary',
      bgcolor: 'background.paper',
      cursor: 'pointer',
      // The kind underline is an inset shadow: grow rather than lift.
      '&:hover': { transform: 'scale(1.15)' },
    },
    '&[data-changed="true"]': { fontWeight: 700 },
    '&[data-marked="true"]': {
      outline: '2px solid',
      outlineColor: 'primary.main',
    },
    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
    // Underlined in the colour of the day's kind; typical days aren't.
    ...Object.fromEntries(
      DAY_KINDS.filter(({ kind }) => kind !== 'typical').map(({ kind }) => [
        `&[data-kind="${kind}"]`,
        {
          boxShadow: (theme: Theme) =>
            `inset 0 -3px 0 ${dayKindColor(theme, palette, kind)}`,
        },
      ]),
    ),
  } as const;
}

interface ViewProps {
  calendar: TripsCalendarDoc;
  byDate: Record<GtfsDate, ServicePeriod>;
  /** Periods singled out from the periods table; others dim. */
  hovered: readonly string[] | null;
  marked: GtfsDate | null;
  onOpen: (date: GtfsDate) => void;
  onMonthClick: (cursor: MonthCursor) => void;
}

/** A compared day: shaded by trips changed, underlined in its kind's colour. */
function MiniDay({
  cell,
  dim,
  marked,
  onOpen,
}: {
  cell: TripsDayCell;
  dim: boolean;
  marked: boolean;
  onOpen: (date: GtfsDate) => void;
}): React.ReactElement {
  const p = cell.period;
  const palette = useCalendarPalette();
  const sx = useMemo(() => cellSx(palette), [palette]);
  const shade = p ? dayShade(palette, p.share) : null;
  const box = (
    <Box
      role={p ? 'button' : undefined}
      tabIndex={p ? 0 : -1}
      aria-label={dayAriaLabel(cell)}
      data-compared={p != null}
      data-changed={cell.changed > 0}
      data-marked={marked}
      data-kind={p ? dayKindOf(p) : undefined}
      onClick={() => p && onOpen(cell.date)}
      onKeyDown={(e) => {
        if (p && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen(cell.date);
        }
      }}
      style={{
        backgroundImage: shade
          ? `linear-gradient(${shade}, ${shade})`
          : undefined,
        opacity: dim ? 0.3 : undefined,
      }}
      sx={sx}
    >
      {cell.day}
    </Box>
  );
  return p ? (
    <Tooltip title={<TripsV5DayTip cell={cell} />} placement='top'>
      {box}
    </Tooltip>
  ) : (
    box
  );
}

function MiniMonth({
  year,
  month,
  calendar,
  byDate,
  hovered,
  marked,
  onOpen,
  onMonthClick,
}: ViewProps & { year: number; month: number }): React.ReactElement {
  const cells = useMemo(
    () => tripsMonthCells(calendar, byDate, { year, month }),
    [calendar, byDate, year, month],
  );
  const changed = changedDays(cells);
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
          onClick={() => onMonthClick({ year, month })}
          sx={{ fontWeight: 700, fontSize: '0.85rem' }}
        >
          {MONTH_NAMES[month]}
        </Link>
        {changed > 0 ? (
          <Typography variant='caption' color='text.secondary'>
            {changed} day{changed === 1 ? '' : 's'} changed
          </Typography>
        ) : null}
      </Box>
      <Box sx={MINI_GRID_SX}>
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
        {cells.map((cell, i) =>
          cell == null ? (
            <Box key={`pad-${i}`} />
          ) : (
            <MiniDay
              key={cell.date}
              cell={cell}
              dim={hovered != null && !hovered.includes(cell.period?.id ?? '')}
              marked={cell.date === marked}
              onOpen={onOpen}
            />
          ),
        )}
      </Box>
    </Box>
  );
}

/**
 * Twelve small months, like the Service Dates year view, within the compared
 * calendar's months. A day opens its trips; a month's name opens its month.
 */
export default function TripsV5YearView({
  year,
  ...rest
}: ViewProps & { year: number }): React.ReactElement {
  const months = yearMonths(year, rest.calendar.first, rest.calendar.last);
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
        gap: 3,
      }}
    >
      {months.map((month) => (
        <MiniMonth key={month} year={year} month={month} {...rest} />
      ))}
    </Box>
  );
}
