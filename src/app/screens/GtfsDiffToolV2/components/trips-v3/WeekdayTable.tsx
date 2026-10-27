'use client';

import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import React from 'react';
import type { GtfsDate } from '../../lib/entity-diff-types';
import { WEEKDAY_SHORT } from '../../lib/calendar-utils';
import { anchorDates } from '../../lib/trips-anchor';
import {
  type TripsCalendarDoc,
  WEEKDAY_TABLE_ORDER,
  type WeekdaySummary,
} from '../../lib/trips-calendar';
import { shortDate } from '../../lib/trips-v2-days';
import { CHANGE_COLORS } from './shared';

const ROWS = [
  { key: 'added', label: 'Added', sign: '+' },
  { key: 'removed', label: 'Removed', sign: '−' },
  { key: 'modified', label: 'Modified', sign: '~' },
] as const;

const cellSx = { textAlign: 'center', py: 1, px: 1 } as const;

/** "8 Sep" (shared), "24 Aug → 9 Nov" (feeds sharing no dates). */
function dayLabel(w: WeekdaySummary): string {
  const d = anchorDates(w.key);
  const day = (x: GtfsDate): string => shortDate(x).replace(/^\w+ /, '');
  return d.base === d.new ? day(w.date) : `${day(d.base)} → ${day(d.new)}`;
}

/**
 * Trips added / removed / modified on a typical day of each weekday,
 * Saturday first. A column opens that day.
 */
export default function WeekdayTable({
  calendar,
  onOpen,
}: {
  calendar: TripsCalendarDoc;
  onOpen: (date: GtfsDate) => void;
}): React.ReactElement {
  const byDay = new Map(calendar.weekdays.map((w) => [w.weekday, w]));
  const columns = WEEKDAY_TABLE_ORDER.map((wd) => ({ wd, w: byDay.get(wd) }));
  const clickable = (w: WeekdaySummary | undefined): object =>
    w
      ? {
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
        }
      : {};

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size='small' sx={{ minWidth: 640 }}>
        <TableHead>
          <TableRow>
            <TableCell />
            {columns.map(({ wd, w }) => (
              <TableCell
                key={wd}
                onClick={() => w && onOpen(w.date)}
                sx={{ ...cellSx, ...clickable(w) }}
              >
                <Typography variant='body2' fontWeight={700}>
                  {WEEKDAY_SHORT[wd]}
                </Typography>
                {w ? (
                  <Typography
                    variant='caption'
                    color='text.secondary'
                    component='div'
                    sx={{ whiteSpace: 'nowrap' }}
                    title={
                      w.busiest
                        ? 'No two days run the same services: the busiest one'
                        : `${w.days} of ${w.of} days run this schedule`
                    }
                  >
                    {w.busiest ? 'Busiest · ' : ''}
                    {dayLabel(w)}
                  </Typography>
                ) : null}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {ROWS.map((row) => (
            <TableRow key={row.key}>
              <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                {row.label}
              </TableCell>
              {columns.map(({ wd, w }) => {
                const c = w ? calendar.counts[w.s] : undefined;
                const n = c?.[row.key] ?? 0;
                return (
                  <TableCell
                    key={wd}
                    onClick={() => w && onOpen(w.date)}
                    sx={{
                      ...cellSx,
                      ...clickable(w),
                      fontWeight: 700,
                      color: n > 0 ? CHANGE_COLORS[row.key] : 'text.disabled',
                    }}
                  >
                    {c == null
                      ? '—'
                      : n > 0
                        ? `${row.sign}${n.toLocaleString()}`
                        : '0'}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
          <TableRow>
            <TableCell
              sx={{ fontWeight: 700, whiteSpace: 'nowrap', borderBottom: 0 }}
            >
              Trips
            </TableCell>
            {columns.map(({ wd, w }) => {
              const c = w ? calendar.counts[w.s] : undefined;
              return (
                <TableCell
                  key={wd}
                  onClick={() => w && onOpen(w.date)}
                  sx={{
                    ...cellSx,
                    ...clickable(w),
                    borderBottom: 0,
                    color: 'text.secondary',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c == null
                    ? '—'
                    : c.base === c.new
                      ? c.new.toLocaleString()
                      : `${c.base.toLocaleString()} → ${c.new.toLocaleString()}`}
                </TableCell>
              );
            })}
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  );
}
