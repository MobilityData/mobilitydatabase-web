'use client';

import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import React, { useMemo } from 'react';
import type { RouteDirDiff } from '../../lib/trips-types';
import { DAY_PERIODS, periodFor } from '../../lib/trips-v2-summary';
import { NEW_COLOR, OLD_COLOR, useElementWidth } from '../trips/shared';
import { SubHeading, segmentedSx } from './shared';

const HEIGHT = 150;
const M = { top: 20, right: 4, bottom: 22, left: 4 };

interface ServiceProfileBarsProps {
  route: RouteDirDiff;
  range: [number, number] | null;
  onRangeChange: (range: [number, number] | null) => void;
}

function hh(h: number): string {
  return String(h % 24).padStart(2, '0');
}

/**
 * Trips starting each hour, before vs after, with the difference written
 * over every hour that changed. A period button or a click on an hour
 * focuses the patterns and trips below.
 */
export default function ServiceProfileBars({
  route,
  range,
  onRangeChange,
}: ServiceProfileBarsProps): React.ReactElement {
  const theme = useTheme();
  const [boxRef, width] = useElementWidth<HTMLDivElement>();
  const { base, new: next } = route.profile;

  const [h0, h1] = useMemo(() => {
    let lo = base.findIndex((v, i) => v > 0 || next[i] > 0);
    let hi = base.length - 1;
    while (hi > 0 && base[hi] === 0 && next[hi] === 0) hi--;
    if (lo < 0) lo = 6;
    return [lo, Math.max(hi + 1, lo + 6)];
  }, [base, next]);
  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
  const max = Math.max(1, ...hours.map((h) => Math.max(base[h], next[h])));

  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const band = hours.length > 0 ? plotW / hours.length : 0;
  const barW = Math.max(1, Math.min(14, (band - 6) / 2));
  const y = (v: number): number => M.top + plotH - (v / max) * plotH;
  const period = periodFor(range);
  const inRange = (h: number): boolean =>
    range == null || (h >= range[0] && h < range[1]);
  const ink = theme.palette.text.secondary;

  return (
    <Box>
      <SubHeading
        title='Service profile'
        caption='Trips starting each hour, before and after. Select an hour or a period to focus the trips below.'
        actions={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Legend color={OLD_COLOR} label='Before' />
            <Legend color={NEW_COLOR} label='After' />
          </Box>
        }
      />
      <ToggleButtonGroup
        size='small'
        exclusive
        value={period?.id ?? null}
        onChange={(_, id: string | null) => {
          if (id == null) return;
          onRangeChange(DAY_PERIODS.find((p) => p.id === id)?.range ?? null);
        }}
        aria-label='Period of the day'
        sx={{ flexWrap: 'wrap', mb: 1.5 }}
      >
        {DAY_PERIODS.map((p) => (
          <ToggleButton
            key={p.id}
            value={p.id}
            sx={{ ...segmentedSx, flexDirection: 'column', lineHeight: 1.2 }}
          >
            <Box component='span' sx={{ fontWeight: 700 }}>
              {p.label}
            </Box>
            {p.hint ? (
              <Box component='span' sx={{ fontSize: '0.62rem', opacity: 0.8 }}>
                {p.hint}
              </Box>
            ) : null}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {range != null && period == null ? (
        <Typography variant='caption' sx={{ display: 'block', mb: 1 }}>
          Showing {hh(range[0])}:00–{hh(range[1])}:00.{' '}
          <Box
            component='button'
            type='button'
            onClick={() => onRangeChange(null)}
            sx={{
              border: 0,
              bgcolor: 'transparent',
              color: 'primary.main',
              cursor: 'pointer',
              p: 0,
              font: 'inherit',
              textDecoration: 'underline',
            }}
          >
            Show all day
          </Box>
        </Typography>
      ) : null}
      <Box ref={boxRef} sx={{ width: '100%' }}>
        {width > 0 ? (
          <svg
            width={width}
            height={HEIGHT}
            role='img'
            aria-label='Trips starting each hour, before vs after'
          >
            <line
              x1={M.left}
              x2={M.left + plotW}
              y1={M.top + plotH}
              y2={M.top + plotH}
              stroke={theme.palette.divider}
            />
            {hours.map((h, i) => {
              const x0 = M.left + i * band;
              const cx = x0 + band / 2;
              const d = next[h] - base[h];
              const faded = !inRange(h);
              const bar = (
                v: number,
                x: number,
                color: string,
              ): React.ReactNode =>
                v > 0 ? (
                  <rect
                    x={x}
                    y={y(v)}
                    width={barW}
                    height={M.top + plotH - y(v)}
                    fill={color}
                    rx={1}
                  />
                ) : null;
              return (
                <g
                  key={h}
                  opacity={faded ? 0.3 : 1}
                  style={{ cursor: 'pointer' }}
                  onClick={() =>
                    onRangeChange(
                      range?.[0] === h && range[1] === h + 1
                        ? null
                        : [h, h + 1],
                    )
                  }
                >
                  <Tooltip
                    followCursor
                    title={`${hh(h)}:00–${hh(h + 1)}:00 · ${base[h]} → ${next[h]} trips. Click to focus this hour.`}
                  >
                    <rect
                      x={x0}
                      y={0}
                      width={band}
                      height={HEIGHT}
                      fill='transparent'
                    />
                  </Tooltip>
                  {bar(base[h], cx - barW - 1, OLD_COLOR)}
                  {bar(next[h], cx + 1, NEW_COLOR)}
                  {d !== 0 ? (
                    <text
                      x={cx}
                      y={y(Math.max(base[h], next[h])) - 5}
                      textAnchor='middle'
                      fontSize={10}
                      fontWeight={700}
                      fill={theme.palette.text.primary}
                      pointerEvents='none'
                    >
                      {d > 0 ? `+${d}` : `−${-d}`}
                    </text>
                  ) : null}
                  {hours.length <= 20 || h % 2 === 0 ? (
                    <text
                      x={cx}
                      y={HEIGHT - 6}
                      textAnchor='middle'
                      fontSize={10}
                      fill={ink}
                      pointerEvents='none'
                    >
                      {hh(h)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : null}
      </Box>
    </Box>
  );
}

function Legend({
  color,
  label,
}: {
  color: string;
  label: string;
}): React.ReactElement {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box
        sx={{ width: 10, height: 10, bgcolor: color, borderRadius: '2px' }}
      />
      <Typography variant='caption'>{label}</Typography>
    </Box>
  );
}
