'use client';

import { Box, type Theme } from '@mui/material';
import React from 'react';
import type { DayKind } from '../../lib/trips-v5-day-kinds';
import {
  type CalendarPalette,
  paletteShade,
  useCalendarPalette,
} from './palette';

/**
 * Background of a day by the share of its trips changed (0–1). Lighter than
 * Trips v3's changeShade: v5's day boxes carry coloured counts, which must
 * stay readable on a day with every trip changed.
 */
export function dayShade(palette: CalendarPalette, share: number): string {
  return paletteShade(palette, share);
}

/**
 * Colour of each kind of day: a hex value, or a theme palette token (sx
 * only) where it must follow light / dark mode. Typical days are a muted,
 * hollow dot; no service a strong, dark one, apart from the change colours.
 */
export const DAY_KIND_COLORS: Record<DayKind, string> = {
  typical: 'text.disabled',
  substitute: '#3d6fd6',
  block: '#8b5cc4',
  oneoff: '#cc4f93',
  none: 'text.primary',
};

/** A kind's colour in a palette: a hex value or a theme token (sx only). */
export function kindColor(palette: CalendarPalette, kind: DayKind): string {
  if (kind === 'typical' || kind === 'none') return DAY_KIND_COLORS[kind];
  return palette.kinds[kind];
}

/** kindColor with the theme tokens resolved, for inline CSS. */
export function dayKindColor(
  theme: Theme,
  palette: CalendarPalette,
  kind: DayKind,
): string {
  if (kind === 'typical') return theme.palette.text.disabled;
  if (kind === 'none') return theme.palette.text.primary;
  return palette.kinds[kind];
}

/** Round dot of a kind of day; typical is hollow. */
export function KindDot({
  kind,
  size = 10,
}: {
  kind: DayKind;
  size?: number;
}): React.ReactElement {
  const color = kindColor(useCalendarPalette(), kind);
  return (
    <Box
      component='span'
      aria-hidden
      sx={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        boxSizing: 'border-box',
        ...(kind === 'typical'
          ? {
              bgcolor: 'transparent',
              border: '1.5px solid',
              borderColor: color,
            }
          : { bgcolor: color }),
      }}
    />
  );
}
