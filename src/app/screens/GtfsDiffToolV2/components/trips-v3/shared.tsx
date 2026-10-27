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

/** Legend of ChangeTriplet's signs. */
export function ChangeLegend(): React.ReactElement {
  const items: Array<[keyof typeof CHANGE_COLORS, string]> = [
    ['added', '+ added'],
    ['removed', '− removed'],
    ['modified', '~ modified'],
  ];
  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      {items.map(([k, label]) => (
        <Typography
          key={k}
          variant='caption'
          sx={{ color: CHANGE_COLORS[k], fontWeight: 700 }}
        >
          {label}
        </Typography>
      ))}
    </Box>
  );
}
