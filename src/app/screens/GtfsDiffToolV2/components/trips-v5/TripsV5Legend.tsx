'use client';

import { Box, Typography } from '@mui/material';
import React from 'react';
import { DAY_KINDS } from '../../lib/trips-v5-day-kinds';
import type { CHANGE_COLORS } from '../trips-v3/shared';
import { KindDot, dayShade } from './shared';
import { useCalendarPalette } from './palette';

const CHANGE_KEY: Array<[keyof typeof CHANGE_COLORS, string]> = [
  ['added', 'Added'],
  ['removed', 'Removed'],
  ['modified', 'Modified'],
];

function Entry({
  swatch,
  children,
}: {
  swatch: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      {swatch}
      <Typography variant='caption'>{children}</Typography>
    </Box>
  );
}

/**
 * Kinds of day (typical, runs another day's schedule, own schedule over
 * several days or one, no service), the change boxes' colours and the change
 * shading.
 */
export default function TripsV5Legend(): React.ReactElement {
  const palette = useCalendarPalette();
  const shadeScale = `linear-gradient(90deg, ${dayShade(palette, 0)}, ${dayShade(palette, 1)})`;
  return (
    <Box sx={{ mt: 1.5, display: 'grid', rowGap: 0.75 }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 2,
          rowGap: 0.75,
        }}
      >
        {DAY_KINDS.filter((k) => k.kind !== 'typical').map((k) => (
          <Entry key={k.kind} swatch={<KindDot kind={k.kind} />}>
            {k.title}
          </Entry>
        ))}
        <Entry
          swatch={
            <Box
              aria-hidden
              sx={{
                width: 10,
                height: 10,
                borderRadius: '3px',
                bgcolor: 'action.hover',
              }}
            />
          }
        >
          Not compared
        </Entry>
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 2,
          rowGap: 0.75,
        }}
      >
        <Typography variant='caption' color='text.secondary'>
          Trips
        </Typography>
        {CHANGE_KEY.map(([kind, label]) => (
          <Entry
            key={kind}
            swatch={
              <Box
                aria-hidden
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '3px',
                  border: '1.5px solid',
                  borderColor: palette.change[kind],
                }}
              />
            }
          >
            {label}
          </Entry>
        ))}
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
              backgroundImage: shadeScale,
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
