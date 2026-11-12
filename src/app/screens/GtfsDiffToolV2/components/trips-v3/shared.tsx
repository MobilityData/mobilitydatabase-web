'use client';

import { Box, Typography } from '@mui/material';
import React from 'react';
import type { TripChangeCounts } from '../../lib/trips-calendar';
import { ADDED, CHANGED, REMOVED } from '../trips-v2/shared';

/** Section id and slug of the Trips v3 page in the report header. */
export const TRIPS_V3_SECTION = 'trips_v3';
export const TRIPS_V3_SLUG = 'trips-v3';

export const CHANGE_COLORS = {
  added: ADDED,
  removed: REMOVED,
  modified: CHANGED,
} as const;

/** "+12 −3 ~40": trips added, removed, modified; zeros left out. */
export function ChangeTriplet({
  counts,
  stacked = false,
  size = '0.78rem',
}: {
  counts: TripChangeCounts | undefined;
  /** One count per line (calendar boxes). */
  stacked?: boolean;
  size?: string;
}): React.ReactElement {
  const parts: Array<[keyof typeof CHANGE_COLORS, string, number]> = counts
    ? [
        ['added', '+', counts.added],
        ['removed', '−', counts.removed],
        ['modified', '~', counts.modified],
      ]
    : [];
  const shown = parts.filter(([, , n]) => n > 0);
  if (shown.length === 0)
    return (
      <Typography
        component='span'
        sx={{ fontSize: size, color: 'text.disabled' }}
      >
        No change
      </Typography>
    );
  return (
    <Box
      component='span'
      sx={{
        display: 'inline-flex',
        flexDirection: stacked ? 'column' : 'row',
        gap: stacked ? 0 : 1,
        lineHeight: 1.25,
      }}
    >
      {shown.map(([kind, sign, n]) => (
        <Box
          key={kind}
          component='span'
          sx={{
            color: CHANGE_COLORS[kind],
            fontWeight: 700,
            fontSize: size,
            whiteSpace: 'nowrap',
          }}
        >
          {sign}
          {n.toLocaleString()}
        </Box>
      ))}
    </Box>
  );
}

/**
 * Colours of service periods (lib/trips-periods), in order. Clear of the
 * added / removed / modified green, red and amber, which shade the days.
 */
export const PERIOD_COLORS = [
  '#3d6fd6',
  '#8b5cc4',
  '#178f8f',
  '#cc4f93',
  '#8a6440',
  '#4a5a78',
];

/** Periods without a colour of their own. */
export const OTHER_PERIOD_COLOR = '#b0b0b0';

export function periodColor(color: number | null): string {
  return color == null
    ? OTHER_PERIOD_COLOR
    : PERIOD_COLORS[color % PERIOD_COLORS.length];
}

/** Background of a day by the share of its trips changed (0–1). */
export function changeShade(share: number): string {
  const alpha = share > 0 ? 0.06 + 0.5 * share : 0;
  return `rgba(237, 170, 2, ${alpha.toFixed(3)})`;
}

/** Swatch of a period's colour. */
export function PeriodSwatch({
  color,
  size = 10,
}: {
  color: number | null;
  size?: number;
}): React.ReactElement {
  return (
    <Box
      component='span'
      aria-hidden
      sx={{
        display: 'inline-block',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '3px',
        bgcolor: periodColor(color),
      }}
    />
  );
}
