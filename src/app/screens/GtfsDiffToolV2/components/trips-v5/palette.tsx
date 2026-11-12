'use client';

import { Box, MenuItem, TextField, Typography } from '@mui/material';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { ADDED, CHANGED, REMOVED } from '../trips-v2/shared';

/**
 * Colour options of the Trips v5 calendar, to compare while prototyping:
 * the shading of a day by trips changed, the added / removed / modified
 * boxes and the kind-of-day dots. Typical and no-service days keep their
 * theme colours in every palette.
 */
export interface CalendarPalette {
  id: string;
  label: string;
  /** Day shading colour: any CSS colour, theme variables included. */
  shade: string;
  /** Shading alpha of a day with every trip changed. */
  shadeMax: number;
  change: { added: string; removed: string; modified: string };
  kinds: { substitute: string; block: string; oneoff: string };
}

function themeVar(name: string): string {
  return `var(--mui-palette-${name})`;
}

export const CALENDAR_PALETTES: CalendarPalette[] = [
  {
    id: 'amber',
    label: 'Amber (current)',
    shade: 'rgb(237, 170, 2)',
    shadeMax: 0.23,
    change: { added: ADDED, removed: REMOVED, modified: CHANGED },
    kinds: { substitute: '#3d6fd6', block: '#8b5cc4', oneoff: '#cc4f93' },
  },
  {
    id: 'blue',
    label: 'Blue',
    shade: 'rgb(25, 118, 210)',
    shadeMax: 0.2,
    change: { added: '#2e7d32', removed: '#d32f2f', modified: '#1565c0' },
    kinds: { substitute: '#ef6c00', block: '#8b5cc4', oneoff: '#cc4f93' },
  },
  {
    id: 'colorblind',
    label: 'Colour-blind safe',
    shade: 'rgb(230, 159, 0)',
    shadeMax: 0.26,
    change: { added: '#009e73', removed: '#d55e00', modified: '#0072b2' },
    kinds: { substitute: '#56b4e9', block: '#cc79a7', oneoff: '#882255' },
  },
  {
    id: 'grey',
    label: 'Neutral grey',
    shade: 'rgb(96, 125, 139)',
    shadeMax: 0.26,
    change: { added: '#2e7d32', removed: '#c62828', modified: '#6a1b9a' },
    kinds: { substitute: '#0288d1', block: '#ef6c00', oneoff: '#c2185b' },
  },
  {
    id: 'teal',
    label: 'Teal',
    shade: 'rgb(0, 137, 123)',
    shadeMax: 0.22,
    change: { added: '#1565c0', removed: '#c62828', modified: '#ef6c00' },
    kinds: { substitute: '#6a1b9a', block: '#5d4037', oneoff: '#ad1457' },
  },
  {
    // The app theme's palette (src/app/Theme.ts), as CSS variables so it
    // follows light / dark mode.
    id: 'theme',
    label: 'Theme colours',
    shade: themeVar('primary-main'),
    shadeMax: 0.22,
    change: {
      added: themeVar('success-main'),
      removed: themeVar('error-main'),
      modified: themeVar('warning-main'),
    },
    kinds: {
      substitute: themeVar('secondary-main'),
      block: themeVar('info-main'),
      oneoff: themeVar('primary-dark'),
    },
  },
];

const DEFAULT_PALETTE = CALENDAR_PALETTES[0];
const STORAGE_KEY = 'gtfs-diff-trips-v5-palette';

const PaletteContext = createContext<CalendarPalette>(DEFAULT_PALETTE);

export const CalendarPaletteProvider = PaletteContext.Provider;

export function useCalendarPalette(): CalendarPalette {
  return useContext(PaletteContext);
}

/** Background of a day by the share of its trips changed (0–1). */
export function paletteShade(p: CalendarPalette, share: number): string {
  const alpha = share > 0 ? 0.03 + (p.shadeMax - 0.03) * share : 0;
  return `color-mix(in srgb, ${p.shade} ${(alpha * 100).toFixed(1)}%, transparent)`;
}

/** The chosen palette, remembered in this browser. */
export function useCalendarPaletteChoice(): [
  CalendarPalette,
  (id: string) => void,
] {
  const [id, setId] = useState(DEFAULT_PALETTE.id);
  // After mount: the server render can't read localStorage.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && CALENDAR_PALETTES.some((p) => p.id === saved)) setId(saved);
    } catch {
      // Storage blocked: keep the default.
    }
  }, []);
  const choose = (next: string): void => {
    setId(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice lasts until reload.
    }
  };
  const palette = CALENDAR_PALETTES.find((p) => p.id === id) ?? DEFAULT_PALETTE;
  return [palette, choose];
}

function Swatches({ p }: { p: CalendarPalette }): React.ReactElement {
  const dot = (color: string): React.ReactElement => (
    <Box
      key={color}
      component='span'
      sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }}
    />
  );
  return (
    <Box
      aria-hidden
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
    >
      <Box
        component='span'
        sx={{
          width: 28,
          height: 12,
          borderRadius: '3px',
          border: '1px solid',
          borderColor: 'divider',
          backgroundImage: `linear-gradient(90deg, ${paletteShade(p, 0.05)}, ${paletteShade(p, 1)})`,
        }}
      />
      {Object.values(p.change).map((c) => (
        <Box
          key={c}
          component='span'
          sx={{
            width: 10,
            height: 10,
            borderRadius: '2px',
            border: '1.5px solid',
            borderColor: c,
          }}
        />
      ))}
      {Object.values(p.kinds).map(dot)}
    </Box>
  );
}

/** Dropdown of CALENDAR_PALETTES, each with a preview of its colours. */
export function CalendarPaletteSelect({
  value,
  onChange,
}: {
  value: CalendarPalette;
  onChange: (id: string) => void;
}): React.ReactElement {
  return (
    <TextField
      select
      size='small'
      label='Calendar colours'
      value={value.id}
      onChange={(e) => onChange(e.target.value)}
      sx={{ minWidth: 260 }}
      slotProps={{
        select: {
          renderValue: (id) => {
            const p =
              CALENDAR_PALETTES.find((x) => x.id === id) ?? DEFAULT_PALETTE;
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant='body2' sx={{ flex: 1 }} noWrap>
                  {p.label}
                </Typography>
                <Swatches p={p} />
              </Box>
            );
          },
        },
      }}
    >
      {CALENDAR_PALETTES.map((p) => (
        <MenuItem
          key={p.id}
          value={p.id}
          sx={{ display: 'flex', gap: 2, justifyContent: 'space-between' }}
        >
          <Typography variant='body2'>{p.label}</Typography>
          <Swatches p={p} />
        </MenuItem>
      ))}
    </TextField>
  );
}
