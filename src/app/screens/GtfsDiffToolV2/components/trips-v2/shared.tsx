'use client';

import { Box, Typography } from '@mui/material';
import React from 'react';
import type { TripPair } from '../../lib/trips-types';
import {
  type ChipTone,
  type SummaryChip,
  isRiderChange,
} from '../../lib/trips-v2-summary';

export const ADDED = '#2e7d32';
export const REMOVED = '#d32f2f';
export const CHANGED = '#b26a00';
export const CHANGED_BG = 'rgba(237, 170, 2, 0.16)';
export const ADDED_BG = 'rgba(46, 125, 50, 0.10)';
export const REMOVED_BG = 'rgba(211, 47, 47, 0.08)';

/** Selected state of the black segmented buttons (day type, view, period). */
export const segmentedSx = {
  textTransform: 'none',
  py: 0.4,
  px: 1.25,
  fontSize: '0.78rem',
  borderColor: 'divider',
  color: 'text.primary',
  '&.Mui-selected, &.Mui-selected:hover': {
    bgcolor: 'text.primary',
    color: 'background.paper',
  },
} as const;

/** `scope` of cards about the whole feed rather than one day. */
export const ALL_DATES = 'all';

interface CardProps {
  title: React.ReactNode;
  caption?: React.ReactNode;
  /** Right-aligned controls next to the title. */
  actions?: React.ReactNode;
  id?: string;
  /** What the card covers: "All dates", "Weekday · Tue 8 Sep". */
  scope?: string;
}

/** Small label naming the dates a card's numbers belong to. */
export function ScopeTag({
  label,
  allDates = false,
}: {
  label: string;
  allDates?: boolean;
}): React.ReactElement {
  return (
    <Box
      component='span'
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.25,
        borderRadius: '999px',
        border: '1px solid',
        borderColor: allDates ? 'divider' : 'primary.main',
        bgcolor: allDates ? 'action.hover' : 'transparent',
        color: allDates ? 'text.secondary' : 'primary.main',
        fontSize: '0.72rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
      }}
    >
      {allDates ? 'All dates' : `On ${label}`}
    </Box>
  );
}

/** Bordered section card with a primary-coloured title. */
export function V2Card({
  title,
  caption,
  actions,
  id,
  scope,
  children,
}: React.PropsWithChildren<CardProps>): React.ReactElement {
  return (
    <Box
      id={id}
      component='section'
      sx={{
        bgcolor: 'background.paper',
        borderRadius: '6px',
        p: { xs: 2, sm: 2.5 },
        mb: 3,
        scrollMarginTop: 96,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 2,
          flexWrap: 'wrap',
          mb: 1.5,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Typography
            variant='h6'
            component='h2'
            color='primary'
            fontWeight={700}
            sx={{ lineHeight: 1.3 }}
          >
            {title}
            {scope ? (
              <>
                {' '}
                <ScopeTag label={scope} allDates={scope === ALL_DATES} />
              </>
            ) : null}
          </Typography>
          {caption ? (
            <Typography variant='body2' color='text.secondary'>
              {caption}
            </Typography>
          ) : null}
        </Box>
        {actions}
      </Box>
      {children}
    </Box>
  );
}

export function SubHeading({
  title,
  caption,
  actions,
}: CardProps): React.ReactElement {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2,
        flexWrap: 'wrap',
        mb: 1.5,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 200 }}>
        <Typography variant='subtitle1' component='h3' fontWeight={700}>
          {title}
        </Typography>
        {caption ? (
          <Typography variant='caption' color='text.secondary'>
            {caption}
          </Typography>
        ) : null}
      </Box>
      {actions}
    </Box>
  );
}

const TONES: Record<
  ChipTone,
  { color: string; bg: string; border: string; weight: number }
> = {
  neutral: {
    color: 'text.primary',
    bg: 'transparent',
    border: 'primary.main',
    weight: 600,
  },
  added: { color: ADDED, bg: ADDED_BG, border: ADDED, weight: 600 },
  removed: { color: REMOVED, bg: REMOVED_BG, border: REMOVED, weight: 600 },
  changed: { color: CHANGED, bg: CHANGED_BG, border: CHANGED, weight: 600 },
  quiet: {
    color: 'text.secondary',
    bg: 'action.hover',
    border: 'transparent',
    weight: 400,
  },
};

export function ToneChip({ chip }: { chip: SummaryChip }): React.ReactElement {
  const t = TONES[chip.tone];
  return (
    <Box
      component='span'
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: 1.25,
        py: 0.5,
        borderRadius: '4px',
        border: '1px solid',
        borderColor: t.border,
        bgcolor: t.bg,
        color: t.color,
        fontSize: '0.78rem',
        fontWeight: t.weight,
        whiteSpace: 'nowrap',
      }}
    >
      {chip.label}
    </Box>
  );
}

export function ChipRow({
  chips,
}: {
  chips: SummaryChip[];
}): React.ReactElement {
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      {chips.map((c) => (
        <ToneChip key={c.label} chip={c} />
      ))}
    </Box>
  );
}

export function pairTone(
  p: TripPair,
): 'removed' | 'added' | 'changed' | 'quiet' {
  if (p.cls === 'removed') return 'removed';
  if (p.cls === 'added') return 'added';
  return isRiderChange(p) ? 'changed' : 'quiet';
}

/** Small filled badge under a trip time: "Removed", "+2 min". */
export function TripBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'removed' | 'added' | 'changed' | 'quiet';
}): React.ReactElement {
  const bg =
    tone === 'removed'
      ? REMOVED
      : tone === 'added'
        ? ADDED
        : tone === 'changed'
          ? '#3e2a00'
          : 'action.selected';
  return (
    <Box
      component='span'
      sx={{
        display: 'inline-block',
        px: 0.6,
        borderRadius: '3px',
        bgcolor: bg,
        color: tone === 'quiet' ? 'text.secondary' : '#fff',
        fontSize: '0.6rem',
        fontWeight: 700,
        lineHeight: '15px',
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </Box>
  );
}
