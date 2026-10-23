'use client';

import {
  Box,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import React, { useMemo, useRef, useState } from 'react';
import type { RouteDirDiff } from '../../lib/trips-types';
import { NEW_COLOR, OLD_COLOR, useElementWidth } from './shared';

type Metric = 'trips' | 'headway';

const HEIGHT = 170;
const M = { top: 12, right: 8, bottom: 24, left: 34 };

interface ServiceProfileProps {
  route: RouteDirDiff;
  range: [number, number] | null;
  onRangeChange: (range: [number, number] | null) => void;
}

function hourLabel(h: number): string {
  return `${String(h % 24).padStart(2, '0')}:00`;
}

/**
 * Trips (or average headway) per hour, base vs new. Dragging across the
 * chart selects an hour range that filters the patterns, timetable and
 * stringline below.
 */
export default function ServiceProfile({
  route,
  range,
  onRangeChange,
}: ServiceProfileProps): React.ReactElement {
  const theme = useTheme();
  const [boxRef, width] = useElementWidth<HTMLDivElement>();
  const [metric, setMetric] = useState<Metric>('trips');
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const dragStart = useRef<number | null>(null);
  // Mirrors `drag` so pointerup sees the latest range without a re-render.
  const dragRange = useRef<[number, number] | null>(null);
  const updateDrag = (r: [number, number] | null): void => {
    dragRange.current = r;
    setDrag(r);
  };

  const { base, new: next } = route.profile;
  const [h0, h1] = useMemo(() => {
    let lo = base.findIndex((v, i) => v > 0 || next[i] > 0);
    let hi = base.length - 1;
    while (hi > 0 && base[hi] === 0 && next[hi] === 0) hi--;
    if (lo < 0) lo = 6;
    return [lo, Math.max(hi + 1, lo + 4)];
  }, [base, next]);
  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);

  const value = (v: number): number | null =>
    metric === 'trips' ? v : v > 0 ? 60 / v : null;
  const values = hours.map((h) => [value(base[h]), value(next[h])]);
  const max = Math.max(1, ...values.flat().map((v) => v ?? 0));
  const step = max <= 5 ? 1 : max <= 12 ? 2 : max <= 30 ? 5 : 10;
  const ticks = Array.from(
    { length: Math.floor(max / step) + 1 },
    (_, i) => i * step,
  );

  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const band = hours.length > 0 ? plotW / hours.length : 0;
  const barW = Math.max(1, (band - 6) / 2);
  const y = (v: number): number => M.top + plotH - (v / max) * plotH;
  const hourAt = (clientX: number, rect: DOMRect): number => {
    const x = clientX - rect.left - M.left;
    return Math.max(
      h0,
      Math.min(h1 - 1, h0 + Math.floor(x / Math.max(1, band))),
    );
  };

  const shown = drag ?? range;
  const ink = theme.palette.text.secondary;
  const grid = theme.palette.divider;

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
          mb: 1,
        }}
      >
        <Typography variant='subtitle2' fontWeight={700}>
          Service profile
        </Typography>
        <ToggleButtonGroup
          size='small'
          exclusive
          value={metric}
          onChange={(_, v: Metric | null) => v && setMetric(v)}
        >
          <ToggleButton value='trips' sx={{ py: 0.25, textTransform: 'none' }}>
            Trips per hour
          </ToggleButton>
          <ToggleButton
            value='headway'
            sx={{ py: 0.25, textTransform: 'none' }}
          >
            Avg. headway (min)
          </ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <LegendSwatch color={OLD_COLOR} label='Base' />
          <LegendSwatch color={NEW_COLOR} label='New' />
          {route.freq_hours.some(Boolean) && (
            <LegendSwatch color={grid} label='Frequency-based' hatched />
          )}
        </Box>
        <Box sx={{ flex: 1 }} />
        {range ? (
          <>
            <Typography variant='caption'>
              Showing {hourLabel(range[0])}–{hourLabel(range[1])}
            </Typography>
            <Button size='small' onClick={() => onRangeChange(null)}>
              Clear selection
            </Button>
          </>
        ) : (
          <Typography variant='caption' color='text.secondary'>
            Drag across the chart to focus a time range
          </Typography>
        )}
      </Box>
      <Box ref={boxRef} sx={{ width: '100%', userSelect: 'none' }}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role='img'
            aria-label={`${metric === 'trips' ? 'Trips per hour' : 'Average headway per hour'}, base vs new`}
            style={{ cursor: 'col-resize', touchAction: 'none' }}
            onPointerDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const h = hourAt(e.clientX, rect);
              dragStart.current = h;
              updateDrag([h, h + 1]);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (dragStart.current == null) return;
              const h = hourAt(
                e.clientX,
                e.currentTarget.getBoundingClientRect(),
              );
              const s = dragStart.current;
              updateDrag([Math.min(s, h), Math.max(s, h) + 1]);
            }}
            onPointerUp={() => {
              const r = dragRange.current;
              if (r) onRangeChange(r[0] === h0 && r[1] === h1 ? null : r);
              dragStart.current = null;
              updateDrag(null);
            }}
          >
            <defs>
              <pattern
                id='freq-hatch'
                width='6'
                height='6'
                patternUnits='userSpaceOnUse'
                patternTransform='rotate(45)'
              >
                <line
                  x1='0'
                  y1='0'
                  x2='0'
                  y2='6'
                  stroke={grid}
                  strokeWidth='3'
                />
              </pattern>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={M.left}
                  x2={M.left + plotW}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={grid}
                />
                <text
                  x={M.left - 6}
                  y={y(t)}
                  dy='0.32em'
                  textAnchor='end'
                  fontSize={10}
                  fill={ink}
                >
                  {t}
                </text>
              </g>
            ))}
            {hours.map((h, i) => {
              const x0 = M.left + i * band;
              const [bv, nv] = values[i];
              const bar = (
                v: number | null,
                dx: number,
                color: string,
              ): React.ReactElement | null =>
                v == null || v === 0 ? null : (
                  <rect
                    x={x0 + 2 + dx}
                    y={y(v)}
                    width={barW}
                    height={Math.max(0, M.top + plotH - y(v))}
                    rx={Math.min(2, barW / 2)}
                    fill={color}
                  />
                );
              const label =
                metric === 'trips'
                  ? `${base[h]} → ${next[h]} trips`
                  : `avg. headway ${bv == null ? '—' : `${Math.round(bv)} min`} → ${nv == null ? '—' : `${Math.round(nv)} min`}`;
              return (
                <g key={h}>
                  {route.freq_hours[h] && (
                    <rect
                      x={x0}
                      y={M.top}
                      width={band}
                      height={6}
                      fill='url(#freq-hatch)'
                    />
                  )}
                  {bar(bv, 0, OLD_COLOR)}
                  {bar(nv, barW + 2, NEW_COLOR)}
                  <Tooltip
                    followCursor
                    title={`${hourLabel(h)}–${hourLabel(h + 1)} · ${label}`}
                  >
                    <rect
                      x={x0}
                      y={M.top}
                      width={band}
                      height={plotH}
                      fill='transparent'
                    />
                  </Tooltip>
                  {(hours.length <= 16 || h % 2 === 0) && (
                    <text
                      x={x0 + band / 2}
                      y={HEIGHT - 8}
                      textAnchor='middle'
                      fontSize={10}
                      fill={ink}
                    >
                      {String(h % 24).padStart(2, '0')}
                    </text>
                  )}
                </g>
              );
            })}
            {shown && (
              <rect
                x={M.left + (shown[0] - h0) * band}
                y={M.top}
                width={(shown[1] - shown[0]) * band}
                height={plotH}
                fill={NEW_COLOR}
                fillOpacity={0.1}
                stroke={NEW_COLOR}
                strokeOpacity={0.5}
                pointerEvents='none'
              />
            )}
          </svg>
        )}
      </Box>
    </Box>
  );
}

function LegendSwatch({
  color,
  label,
  hatched = false,
}: {
  color: string;
  label: string;
  hatched?: boolean;
}): React.ReactElement {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box
        sx={{
          width: 12,
          height: 12,
          borderRadius: '2px',
          bgcolor: hatched ? undefined : color,
          background: hatched
            ? `repeating-linear-gradient(45deg, ${color} 0 3px, transparent 3px 6px)`
            : undefined,
        }}
      />
      <Typography variant='caption'>{label}</Typography>
    </Box>
  );
}
