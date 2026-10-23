'use client';

import { Box, Chip, Tooltip } from '@mui/material';
import React, { useEffect, useRef, useState } from 'react';
import type { RouteInfo } from '../../lib/entity-diff-types';
import type { TripClass, TripPair } from '../../lib/trips-types';
import {
  TRIP_CLASS_COLORS,
  TRIP_CLASS_LABELS,
  formatTime,
  isNextDay,
} from '../../lib/trips-utils';
import { MONO_FONT, RouteChip } from '../calendar/shared';

export { MONO_FONT };

export const OLD_COLOR = '#9e9e9e';
export const NEW_COLOR = '#1565c0';

/** Measured content width of an element, for SVG charts. */
export function useElementWidth<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  number,
] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** "07:05", with a "+1" marker for times past midnight. */
export function TimeText({
  sec,
  strike = false,
}: {
  sec: number | null | undefined;
  strike?: boolean;
}): React.ReactElement {
  return (
    <Box
      component='span'
      sx={{
        fontFamily: MONO_FONT,
        textDecoration: strike ? 'line-through' : undefined,
        whiteSpace: 'nowrap',
      }}
    >
      {formatTime(sec)}
      {isNextDay(sec) && (
        <Box
          component='sup'
          sx={{ fontSize: '0.6em', ml: 0.25, color: 'text.secondary' }}
        >
          +1
        </Box>
      )}
    </Box>
  );
}

export function ClassChip({
  cls,
  minor = false,
  size = 'small',
}: {
  cls: TripClass;
  minor?: boolean;
  size?: 'small' | 'medium';
}): React.ReactElement {
  const color = TRIP_CLASS_COLORS[cls];
  return (
    <Chip
      size={size}
      label={`${TRIP_CLASS_LABELS[cls]}${minor ? ' (minor)' : ''}`}
      variant='outlined'
      sx={{
        height: 20,
        fontSize: '0.68rem',
        fontWeight: 700,
        color,
        borderColor: color,
        opacity: minor ? 0.6 : 1,
        borderStyle: cls === 'removed' ? 'dashed' : 'solid',
      }}
    />
  );
}

export function TripRouteChip({
  routeId,
  route,
}: {
  routeId: string;
  route: RouteInfo | undefined;
}): React.ReactElement {
  return <RouteChip routeId={routeId} route={route} linked={false} />;
}

/** "07:05 → 07:08", "07:20 (removed)", "07:30 (added)". */
export function PairTimes({ pair }: { pair: TripPair }): React.ReactElement {
  if (pair.new == null) return <TimeText sec={pair.base_time} strike />;
  if (pair.base == null || pair.new_time === pair.base_time)
    return <TimeText sec={pair.new_time} />;
  return (
    <Box component='span' sx={{ whiteSpace: 'nowrap' }}>
      <Box component='span' sx={{ color: 'text.secondary' }}>
        <TimeText sec={pair.base_time} strike />
      </Box>
      {' → '}
      <TimeText sec={pair.new_time} />
    </Box>
  );
}

/** Old (dashed gray) vs new (blue) trips per hour, as a tiny line chart. */
export function Sparkline({
  base,
  next,
  width = 96,
  height = 22,
}: {
  base: number[];
  next: number[];
  width?: number;
  height?: number;
}): React.ReactElement {
  const max = Math.max(1, ...base, ...next);
  // Trim leading/trailing empty hours shared by both series.
  let lo = 0;
  let hi = base.length - 1;
  while (lo < hi && base[lo] === 0 && next[lo] === 0) lo++;
  while (hi > lo && base[hi] === 0 && next[hi] === 0) hi--;
  const n = Math.max(1, hi - lo);
  const path = (v: number[]): string =>
    v
      .slice(lo, hi + 1)
      .map(
        (y, i) =>
          `${i === 0 ? 'M' : 'L'}${((i / n) * (width - 2) + 1).toFixed(1)},${(height - 1 - (y / max) * (height - 3)).toFixed(1)}`,
      )
      .join('');
  return (
    <Tooltip
      title={`Trips per hour ${String(lo).padStart(2, '0')}:00–${String(hi + 1).padStart(2, '0')}:00 · gray dashed = base, blue = new`}
    >
      <svg
        width={width}
        height={height}
        role='img'
        aria-label='Trips per hour, base vs new'
      >
        <path
          d={path(base)}
          fill='none'
          stroke={OLD_COLOR}
          strokeWidth={1.5}
          strokeDasharray='3 2'
        />
        <path d={path(next)} fill='none' stroke={NEW_COLOR} strokeWidth={1.5} />
      </svg>
    </Tooltip>
  );
}

/** "142 → 128 (−14)" */
export function CountChange({
  base,
  next,
}: {
  base: number;
  next: number;
}): React.ReactElement {
  const d = next - base;
  return (
    <Box component='span' sx={{ whiteSpace: 'nowrap' }}>
      {base === next ? (
        next
      ) : (
        <>
          {base} → {next}{' '}
          <Box
            component='span'
            sx={{ color: d < 0 ? '#d32f2f' : '#2e7d32', fontWeight: 700 }}
          >
            ({d > 0 ? '+' : '−'}
            {Math.abs(d)})
          </Box>
        </>
      )}
    </Box>
  );
}
