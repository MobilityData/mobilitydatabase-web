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
import type { TripsCalendarDoc } from '../../lib/trips-calendar';
import {
  type ServicePeriod,
  periodByDate,
  scheduleLabel,
} from '../../lib/trips-periods';
import { PeriodSwatch, changeShade, periodColor } from './shared';

/** Tooltip of a day: its period and changes. */
function DayTip({
  date,
  period: p,
}: {
  date: GtfsDate;
  period: ServicePeriod;
}): React.ReactElement {
  const c = p.counts;
  return (
    <Box sx={{ py: 0.25 }}>
      <Typography variant='caption' fontWeight={700} component='div'>
        {formatGtfsDate(date)}
      </Typography>
      <Typography variant='caption' component='div'>
        {p.title}, {p.when} · {p.schedule}
      </Typography>
      <Typography variant='caption' component='div'>
        {p.changed.toLocaleString()} trips change ({Math.round(p.share * 100)}%)
        · {c.base.toLocaleString()} → {c.new.toLocaleString()} trips
      </Typography>
    </Box>
  );
}

/**
 * One month at a time, laid out like the Service Dates month view: each day
 * banded with its service period's colour and shaded by the share of trips
 * changed, so a day running another day's schedule stands out. A day opens
 * its trips.
 */
export default function TripsCalendar({
  calendar,
  periods,
  hovered,
  focused,
  onOpen,
}: {
  calendar: TripsCalendarDoc;
  periods: ServicePeriod[];
  /** Period singled out from the list; others dim. */
  hovered: string | null;
  focused: GtfsDate | null;
  onOpen: (date: GtfsDate) => void;
}): React.ReactElement {
  const [cursor, setCursor] = useState<MonthCursor>(() =>
    cursorOf(calendar.first),
  );
  // Follow a day opened elsewhere (period list, weekday table, popup arrows).
  const [shownFor, setShownFor] = useState(focused);
  if (focused !== shownFor) {
    setShownFor(focused);
    if (focused != null) setCursor(cursorOf(focused));
  }
  const byDate = periodByDate(periods);
  const index = (c: MonthCursor): number => c.year * 12 + c.month;
  const min = index(cursorOf(calendar.first));
  const max = index(cursorOf(calendar.last));

  // Legend: one entry per colour, named after its first (main) period.
  const legend: ServicePeriod[] = [];
  for (const p of periods)
    if (p.color != null && !legend.some((l) => l.color === p.color))
      legend.push(p);
  legend.sort((a, b) => (a.color ?? 0) - (b.color ?? 0));
  const hasOther = periods.some((p) => p.color == null);

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
            const p = calendar.days[date] ? byDate[date] : undefined;
            const open = p != null;
            const isFocused = date === focused;
            const dim = hovered != null && p?.id !== hovered;
            const shade = p ? changeShade(p.share) : null;
            return (
              <Tooltip
                key={date}
                title={
                  p ? (
                    <DayTip date={date} period={p} />
                  ) : (
                    `${formatGtfsDate(date)} · not compared`
                  )
                }
              >
                <Box
                  role='gridcell'
                  tabIndex={open ? 0 : -1}
                  aria-label={
                    p
                      ? `${formatGtfsDate(date)}: ${p.title}, ${p.schedule}, ${p.changed} trips changed`
                      : `${formatGtfsDate(date)}: not compared`
                  }
                  onClick={() => open && onOpen(date)}
                  onKeyDown={(e) => {
                    if (open && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onOpen(date);
                    }
                  }}
                  sx={{
                    minHeight: { xs: 52, sm: 64 },
                    p: 0.75,
                    pt: 0.5,
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: isFocused ? 'primary.main' : 'divider',
                    borderTop: p
                      ? `4px solid ${periodColor(p.color)}`
                      : undefined,
                    outline: isFocused ? '1px solid' : 'none',
                    outlineColor: 'primary.main',
                    bgcolor: open ? 'background.paper' : 'action.hover',
                    backgroundImage: shade
                      ? `linear-gradient(${shade}, ${shade})`
                      : undefined,
                    opacity: dim ? 0.3 : 1,
                    cursor: open ? 'pointer' : 'default',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.25,
                    transition: 'box-shadow 120ms, opacity 120ms',
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
                  {p?.exception ? (
                    <Typography
                      variant='caption'
                      fontWeight={700}
                      sx={{ lineHeight: 1.2, fontSize: '0.66rem' }}
                    >
                      {p.runs ? scheduleLabel(p.runs) : 'Exception'}
                    </Typography>
                  ) : null}
                </Box>
              </Tooltip>
            );
          })}
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 2,
          rowGap: 0.75,
          mt: 1.5,
        }}
      >
        {legend.map((p) => (
          <LegendEntry key={p.color} color={p.color}>
            {p.typical ? p.title : `${p.title}, ${p.when}`}
          </LegendEntry>
        ))}
        {hasOther ? (
          <LegendEntry color={null}>
            {legend.length > 0 ? 'Other days' : 'Each day its own'}
          </LegendEntry>
        ) : null}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            ml: { sm: 'auto' },
          }}
        >
          <Typography variant='caption' color='text.secondary'>
            Trips changed 0%
          </Typography>
          <Box
            aria-hidden
            sx={{
              width: 80,
              height: 10,
              borderRadius: '3px',
              border: '1px solid',
              borderColor: 'divider',
              backgroundImage: `linear-gradient(90deg, ${changeShade(0)}, ${changeShade(1)})`,
            }}
          />
          <Typography variant='caption' color='text.secondary'>
            100%
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function LegendEntry({
  color,
  children,
}: {
  color: number | null;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      <PeriodSwatch color={color} />
      <Typography variant='caption'>{children}</Typography>
    </Box>
  );
}
