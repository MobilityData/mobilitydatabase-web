'use client';

import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import React, { useState } from 'react';
import type { GtfsDate } from '../../lib/entity-diff-types';
import {
  MONTH_NAMES,
  type MonthCursor,
  WEEKDAY_SHORT,
  cursorOf,
  formatGtfsDate,
  monthGrid,
  parseGtfsDate,
  shiftMonth,
} from '../../lib/calendar-utils';
import { type TripsCalendarDoc, changedTrips } from '../../lib/trips-calendar';
import { ChangeLegend, ChangeTriplet } from './shared';

/**
 * One month at a time, each day showing trips added / removed / modified.
 * Laid out like the Service Dates month view; a day opens its trips.
 */
export default function TripsCalendar({
  calendar,
  focused,
  onOpen,
}: {
  calendar: TripsCalendarDoc;
  focused: GtfsDate | null;
  onOpen: (date: GtfsDate) => void;
}): React.ReactElement {
  const [cursor, setCursor] = useState<MonthCursor>(() =>
    cursorOf(calendar.first),
  );
  // Follow a day opened elsewhere (weekday table, popup arrows).
  const [shownFor, setShownFor] = useState(focused);
  if (focused !== shownFor) {
    setShownFor(focused);
    if (focused != null) setCursor(cursorOf(focused));
  }
  const index = (c: MonthCursor): number => c.year * 12 + c.month;
  const min = index(cursorOf(calendar.first));
  const max = index(cursorOf(calendar.last));

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <IconButton
          size='small'
          aria-label='Previous month'
          disabled={index(cursor) <= min}
          onClick={() => setCursor((c) => shiftMonth(c, -1))}
        >
          <ChevronLeft />
        </IconButton>
        <Typography
          variant='subtitle1'
          fontWeight={700}
          sx={{ minWidth: 150, textAlign: 'center' }}
        >
          {MONTH_NAMES[cursor.month]} {cursor.year}
        </Typography>
        <IconButton
          size='small'
          aria-label='Next month'
          disabled={index(cursor) >= max}
          onClick={() => setCursor((c) => shiftMonth(c, 1))}
        >
          <ChevronRight />
        </IconButton>
        <Box sx={{ flex: 1 }} />
        <ChangeLegend />
      </Box>
      <Box
        role='grid'
        aria-label={`${MONTH_NAMES[cursor.month]} ${cursor.year}`}
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
        {monthGrid(cursor)
          .flat()
          .map((date, i) => {
            if (date == null) return <Box key={`pad-${i}`} />;
            const day = calendar.days[date];
            const c = day ? calendar.counts[day.s] : undefined;
            const open = day != null;
            const isFocused = date === focused;
            return (
              <Tooltip
                key={date}
                title={
                  c
                    ? `${formatGtfsDate(date)} · trips ${c.base.toLocaleString()} → ${c.new.toLocaleString()}`
                    : `${formatGtfsDate(date)} · not compared`
                }
              >
                <Box
                  role='gridcell'
                  tabIndex={open ? 0 : -1}
                  aria-label={`${formatGtfsDate(date)}: ${changedTrips(c)} trips changed`}
                  onClick={() => open && onOpen(date)}
                  onKeyDown={(e) => {
                    if (open && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onOpen(date);
                    }
                  }}
                  sx={{
                    minHeight: { xs: 64, sm: 84 },
                    p: 0.75,
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: isFocused ? 'primary.main' : 'divider',
                    outline: isFocused ? '1px solid' : 'none',
                    outlineColor: 'primary.main',
                    bgcolor: open ? 'background.paper' : 'action.hover',
                    cursor: open ? 'pointer' : 'default',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.25,
                    transition: 'box-shadow 120ms',
                    '&:hover': open ? { boxShadow: 2 } : undefined,
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'primary.main',
                    },
                  }}
                >
                  <Typography
                    variant='body2'
                    fontWeight={700}
                    color={open ? 'text.primary' : 'text.disabled'}
                  >
                    {parseGtfsDate(date).day}
                  </Typography>
                  {open ? (
                    <ChangeTriplet counts={c} stacked size='0.72rem' />
                  ) : null}
                </Box>
              </Tooltip>
            );
          })}
      </Box>
    </Box>
  );
}
