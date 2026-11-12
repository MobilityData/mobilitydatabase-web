'use client';

import { Box, Tooltip, Typography, useTheme } from '@mui/material';
import { CheckCircle, InfoOutlined } from '@mui/icons-material';
import React from 'react';
import type { GtfsDate } from '../../lib/entity-diff-types';
import { MONTH_NAMES, formatGtfsDate } from '../../lib/calendar-utils';
import { type TripsCalendarDoc, changedTrips } from '../../lib/trips-calendar';
import { type ServicePeriod, periodByDate } from '../../lib/trips-periods';
import { shortDate } from '../../lib/trips-v2-days';

/** Days named in the verdict before it counts them instead. */
const MAX_NAMED = 3;

/** Every date from first to last, inclusive. */
function datesBetween(first: GtfsDate, last: GtfsDate): GtfsDate[] {
  const out: GtfsDate[] = [];
  const d = new Date(
    Date.UTC(+first.slice(0, 4), +first.slice(4, 6) - 1, +first.slice(6, 8)),
  );
  for (let i = 0; i < 800; i++) {
    const s = d.toISOString().slice(0, 10).replace(/-/g, '');
    if (s > last) break;
    out.push(s);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function verdictText(changed: GtfsDate[], compared: number): string {
  if (changed.length === compared) return 'Riders see changes every day';
  if (changed.length <= MAX_NAMED) {
    const names = changed.map(shortDate);
    const list =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    return `Riders see changes on ${list} only`;
  }
  return `Riders see changes on ${changed.length.toLocaleString()} of ${compared.toLocaleString()} days`;
}

/**
 * The one-line answer to "what changes for riders?", over a strip of every
 * date: a day is dark by the share of its trips changed, so a one-off (a
 * special event) stands out from a feed changing everywhere. A day opens
 * its trips.
 */
export default function ServiceVerdict({
  calendar,
  periods,
  onOpen,
}: {
  calendar: TripsCalendarDoc;
  periods: ServicePeriod[];
  onOpen: (date: GtfsDate) => void;
}): React.ReactElement {
  const theme = useTheme();
  const byDate = periodByDate(periods);
  const compared = Object.keys(calendar.days).sort();
  const changed = compared.filter(
    (d) => changedTrips(calendar.counts[calendar.days[d].s]) > 0,
  );
  const idOnly = Math.max(0, ...calendar.counts.map((c) => c.id_only));
  const all = datesBetween(calendar.first, calendar.last);
  const W = all.length;
  const none = changed.length === 0;
  // Month labels; the first (partial) month's only when it has room.
  const firstMonth = all.findIndex((d, i) => i > 0 && d.endsWith('01'));
  const labelled = (d: GtfsDate, i: number): boolean =>
    d.endsWith('01') || (i === 0 && (firstMonth < 0 || firstMonth > W * 0.08));
  const idle = theme.palette.action.disabledBackground;

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        {none ? <CheckCircle sx={{ color: 'success.main' }} /> : null}
        <Typography variant='subtitle1' fontWeight={700}>
          {none
            ? 'No changes riders would notice'
            : verdictText(changed, compared.length)}
        </Typography>
        {idOnly > 0 ? (
          <Tooltip
            title={`Behind the scenes: up to ${idOnly.toLocaleString()} trips a day only got new IDs. Riders see no difference.`}
          >
            <InfoOutlined
              fontSize='small'
              sx={{ color: 'text.secondary' }}
              aria-label='Behind-the-scenes changes'
            />
          </Tooltip>
        ) : null}
      </Box>

      <svg
        viewBox={`0 0 ${W} 24`}
        preserveAspectRatio='none'
        width='100%'
        height={24}
        role='img'
        aria-label={`Trips changed per day, ${formatGtfsDate(calendar.first)} to ${formatGtfsDate(calendar.last)}`}
      >
        {all.map((d, i) => {
          const day = calendar.days[d];
          if (day == null) return null;
          const p = byDate[d];
          const share = p?.share ?? 0;
          const n = changedTrips(calendar.counts[day.s]);
          return (
            <rect
              key={d}
              x={i + 0.1}
              y={0}
              width={0.8}
              height={24}
              fill={
                n > 0
                  ? `rgba(237, 170, 2, ${(0.3 + 0.7 * share).toFixed(3)})`
                  : idle
              }
              style={{ cursor: 'pointer' }}
              onClick={() => onOpen(d)}
            >
              <title>{`${shortDate(d)}: ${n > 0 ? `${n.toLocaleString()} trips change` : 'no change'}`}</title>
            </rect>
          );
        })}
      </svg>
      <Box sx={{ position: 'relative', height: 16 }}>
        {all.map((d, i) =>
          labelled(d, i) ? (
            <Typography
              key={d}
              variant='caption'
              color='text.secondary'
              sx={{
                position: 'absolute',
                left: `${(i / W) * 100}%`,
                fontSize: '0.66rem',
                whiteSpace: 'nowrap',
              }}
            >
              {MONTH_NAMES[Number(d.slice(4, 6)) - 1].slice(0, 3)}
            </Typography>
          ) : null,
        )}
      </Box>
    </Box>
  );
}
