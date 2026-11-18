'use client';

import { Box, Link, Tooltip, Typography } from '@mui/material';
import React from 'react';
import type { GtfsDate } from '../../lib/entity-diff-types';
import {
  CHANGE_KINDS,
  MONTH_NAMES,
  type MonthCursor,
  WEEKDAY_SHORT,
  type DayCounts,
  changedShare,
  countsTotal,
  cursorOf,
  monthGrid,
  parseGtfsDate,
} from '../../lib/calendar-utils';
import { useCalendarPalette } from '../trips-v5/palette';
import { dayShade } from '../trips-v5/shared';
import { ServiceDayTip } from './shared';

const CELL = 20;

const MINI_GRID_SX = {
  display: 'grid',
  gridTemplateColumns: `repeat(7, ${CELL}px)`,
  gap: '3px',
} as const;

const CELL_SX = {
  width: CELL,
  height: CELL,
  borderRadius: '3px',
  color: 'text.disabled',
  fontSize: '0.6rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'transform 120ms',
  '&[data-service="true"]': {
    color: 'text.primary',
    bgcolor: 'action.hover',
  },
  '&[data-changed="true"]': {
    fontWeight: 700,
    cursor: 'pointer',
    // The change underline is an inset shadow: grow rather than lift.
    '&:hover': { transform: 'scale(1.15)' },
  },
  '&[data-marked="true"]': {
    outline: '2px solid',
    outlineColor: 'primary.main',
  },
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
} as const;

interface YearViewProps {
  year: number;
  /** Union of both feeds' service coverage: months outside it are hidden. */
  bounds: { start: GtfsDate | null; end: GtfsDate | null };
  /** Change counts per kind of the dates with changes (filters applied). */
  days: Record<GtfsDate, DayCounts>;
  activeCounts: Record<GtfsDate, [number, number]>;
  focusedDate: GtfsDate | null;
  onDayClick: (date: GtfsDate) => void;
  onMonthClick: (cursor: MonthCursor) => void;
}

/** The change kind with the most services on a day: its underline colour. */
function mainChange(day: DayCounts): (typeof CHANGE_KINDS)[number] {
  return CHANGE_KINDS.reduce((a, b) => (day[b] > day[a] ? b : a));
}

/**
 * A day of a small month: a paper square when it has service, shaded by the
 * share of its services changed and underlined in its main change's colour.
 */
function MiniDay({
  date,
  day,
  active,
  marked,
  onOpen,
}: {
  date: GtfsDate;
  day: DayCounts | undefined;
  active: [number, number];
  marked: boolean;
  onOpen: (date: GtfsDate) => void;
}): React.ReactElement {
  const palette = useCalendarPalette();
  const total = countsTotal(day);
  const changed = day != null && total > 0;
  const shade = changed ? dayShade(palette, changedShare(total, active)) : null;
  const box = (
    <Box
      role={changed ? 'button' : undefined}
      tabIndex={changed ? 0 : -1}
      aria-label={`${date}: ${total} service changes`}
      data-service={active[0] + active[1] > 0}
      data-changed={changed}
      data-marked={marked}
      onClick={() => changed && onOpen(date)}
      onKeyDown={(e) => {
        if (changed && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen(date);
        }
      }}
      style={{
        backgroundImage: shade
          ? `linear-gradient(${shade}, ${shade})`
          : undefined,
        boxShadow: changed
          ? `inset 0 -3px 0 ${palette.change[mainChange(day)]}`
          : undefined,
      }}
      sx={CELL_SX}
    >
      {parseGtfsDate(date).day}
    </Box>
  );
  return changed ? (
    <Tooltip
      title={<ServiceDayTip date={date} day={day} active={active} />}
      placement='top'
    >
      {box}
    </Tooltip>
  ) : (
    box
  );
}

function MiniMonth({
  cursor,
  days,
  activeCounts,
  focusedDate,
  onDayClick,
  onMonthClick,
}: Omit<YearViewProps, 'year' | 'bounds'> & {
  cursor: MonthCursor;
}): React.ReactElement {
  const dates = monthGrid(cursor).flat();
  const changed = dates.filter(
    (d): d is GtfsDate => d != null && countsTotal(days[d]) > 0,
  ).length;
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
        {dates.map((date, i) =>
          date == null ? (
            <Box key={`pad-${i}`} />
          ) : (
            <MiniDay
              key={date}
              date={date}
              day={days[date]}
              active={activeCounts[date] ?? [0, 0]}
              marked={date === focusedDate}
              onOpen={onDayClick}
            />
          ),
        )}
      </Box>
    </Box>
  );
}

/**
 * Twelve small months, like the Trips v5 year view, within the feeds'
 * service coverage. A day with changes opens them; a month's name opens
 * its month.
 */
export default function YearView({
  year,
  bounds,
  ...rest
}: YearViewProps): React.ReactElement {
  const first = bounds.start ? cursorOf(bounds.start) : null;
  const last = bounds.end ? cursorOf(bounds.end) : null;
  const months = MONTH_NAMES.map((_, month) => month).filter(
    (month) =>
      (first == null ||
        year > first.year ||
        (year === first.year && month >= first.month)) &&
      (last == null ||
        year < last.year ||
        (year === last.year && month <= last.month)),
  );
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
        gap: 3,
      }}
    >
      {months.map((month) => (
        <MiniMonth key={month} cursor={{ year, month }} {...rest} />
      ))}
    </Box>
  );
}
