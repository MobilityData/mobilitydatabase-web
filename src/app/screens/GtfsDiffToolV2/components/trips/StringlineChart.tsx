'use client';

import {
  Box,
  Chip,
  FormControlLabel,
  Switch,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import React, { useMemo, useState } from 'react';
import type { RouteDirDiff, TripClass, TripPair } from '../../lib/trips-types';
import {
  QUIET_CLASSES,
  TRIP_CLASSES,
  TRIP_CLASS_COLORS,
  TRIP_CLASS_LABELS,
  formatTime,
  pairRowTimes,
  pairSummary,
} from '../../lib/trips-utils';
import { OLD_COLOR, useElementWidth } from './shared';

const ROW_H = 26;
const M = { top: 22, right: 16, bottom: 10, left: 170 };

interface StringlineChartProps {
  route: RouteDirDiff;
  pairs: TripPair[];
  stopNames: Record<string, string>;
  /** Brushed hour range, sets the x domain. */
  range: [number, number] | null;
  onOpenTrip: (pair: TripPair) => void;
}

type Pt = [number, number];

/**
 * Marey chart: time runs horizontally, stops vertically in route order.
 * Old trips are faint dashed lines, new trips solid lines colored by change
 * class. Uniform shifts read as parallel offsets, running-time changes as
 * changed slopes, skipped stops as lines jumping a row.
 */
export default function StringlineChart({
  route,
  pairs,
  stopNames,
  range,
  onOpenTrip,
}: StringlineChartProps): React.ReactElement {
  const theme = useTheme();
  const [boxRef, width] = useElementWidth<HTMLDivElement>();
  const [hidden, setHidden] = useState<ReadonlySet<TripClass>>(new Set());
  const [showOld, setShowOld] = useState(true);
  const [hover, setHover] = useState<string | null>(null);

  const order = route.stop_order;
  const lines = useMemo(
    () =>
      pairs.map((p) => {
        const t = pairRowTimes(p, order);
        const pts = (v: Array<number | null>): Pt[] =>
          v.flatMap((s, row) => (s == null ? [] : [[s, row] as Pt]));
        return { pair: p, base: pts(t.base), new: pts(t.new) };
      }),
    [pairs, order],
  );

  const [t0, t1] = useMemo(() => {
    if (range) return [range[0] * 3600, range[1] * 3600];
    let lo = Infinity;
    let hi = -Infinity;
    for (const l of lines)
      for (const [s] of [...l.base, ...l.new]) {
        lo = Math.min(lo, s);
        hi = Math.max(hi, s);
      }
    if (!Number.isFinite(lo)) return [6 * 3600, 22 * 3600];
    return [Math.floor(lo / 3600) * 3600, Math.ceil((hi + 60) / 3600) * 3600];
  }, [lines, range]);

  const presentClasses = useMemo(
    () => TRIP_CLASSES.filter((c) => pairs.some((p) => p.cls === c)),
    [pairs],
  );

  const plotW = Math.max(0, width - M.left - M.right);
  const height = M.top + M.bottom + Math.max(1, order.length - 1) * ROW_H;
  const x = (s: number): number => M.left + ((s - t0) / (t1 - t0)) * plotW;
  const y = (row: number): number => M.top + row * ROW_H;
  const d = (pts: Pt[]): string =>
    pts
      .map(([s, r], i) => `${i === 0 ? 'M' : 'L'}${x(s).toFixed(1)},${y(r)}`)
      .join('');
  const hours: number[] = [];
  for (let h = Math.ceil(t0 / 3600); h * 3600 <= t1; h++) hours.push(h);
  const hourStep = Math.max(
    1,
    Math.ceil(hours.length / Math.max(1, plotW / 60)),
  );

  const visible = lines.filter((l) => !hidden.has(l.pair.cls));
  const ink = theme.palette.text.secondary;
  const grid = theme.palette.divider;

  const toggle = (c: TripClass): void =>
    setHidden((s) => {
      const next = new Set(s);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
          alignItems: 'center',
          mb: 1,
        }}
      >
        {presentClasses.map((c) => {
          const off = hidden.has(c);
          const color = TRIP_CLASS_COLORS[c];
          return (
            <Chip
              key={c}
              size='small'
              onClick={() => toggle(c)}
              label={`${TRIP_CLASS_LABELS[c]} · ${pairs.filter((p) => p.cls === c).length}`}
              icon={
                <svg width={18} height={8} aria-hidden>
                  <line
                    x1={1}
                    x2={17}
                    y1={4}
                    y2={4}
                    stroke={color}
                    strokeWidth={c === 'added' ? 3 : 2}
                    strokeDasharray={c === 'removed' ? '4 3' : undefined}
                  />
                </svg>
              }
              variant='outlined'
              sx={{
                opacity: off ? 0.4 : 1,
                textDecoration: off ? 'line-through' : undefined,
                pl: 0.5,
              }}
            />
          );
        })}
        <FormControlLabel
          sx={{ ml: 1 }}
          control={
            <Switch
              size='small'
              checked={showOld}
              onChange={(e) => setShowOld(e.target.checked)}
            />
          }
          label={
            <Typography variant='caption'>Show old trips (dashed)</Typography>
          }
        />
      </Box>
      <Box ref={boxRef} sx={{ width: '100%', overflowX: 'hidden' }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role='img'
            aria-label='Stringline chart of trips, old vs new'
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <clipPath id='stringline-clip'>
                <rect x={M.left} y={0} width={plotW} height={height} />
              </clipPath>
            </defs>
            {order.map((s, row) => (
              <g key={`${s}-${row}`}>
                <line
                  x1={M.left}
                  x2={M.left + plotW}
                  y1={y(row)}
                  y2={y(row)}
                  stroke={grid}
                />
                <text
                  x={M.left - 8}
                  y={y(row)}
                  dy='0.32em'
                  textAnchor='end'
                  fontSize={10}
                  fill={theme.palette.text.primary}
                >
                  {truncate(stopNames[s] ?? s, 26)}
                </text>
              </g>
            ))}
            {hours
              .filter((_, i) => i % hourStep === 0)
              .map((h) => (
                <g key={h}>
                  <line
                    x1={x(h * 3600)}
                    x2={x(h * 3600)}
                    y1={M.top - 6}
                    y2={height - M.bottom}
                    stroke={grid}
                    strokeDasharray='2 3'
                  />
                  <text
                    x={x(h * 3600)}
                    y={12}
                    textAnchor='middle'
                    fontSize={10}
                    fill={ink}
                  >
                    {formatTime(h * 3600)}
                  </text>
                </g>
              ))}
            <g clipPath='url(#stringline-clip)'>
              {/* Old trips beneath */}
              {showOld &&
                visible.map((l) =>
                  l.base.length > 1 && l.pair.cls !== 'removed' ? (
                    <path
                      key={`b-${l.pair.key}`}
                      d={d(l.base)}
                      fill='none'
                      stroke={OLD_COLOR}
                      strokeWidth={1.25}
                      strokeDasharray='4 3'
                      opacity={hover && hover !== l.pair.key ? 0.15 : 0.7}
                    />
                  ) : null,
                )}
              {visible.map((l) => {
                const p = l.pair;
                const quiet = QUIET_CLASSES.has(p.cls);
                const pts = p.cls === 'removed' ? l.base : l.new;
                if (pts.length < 2) return null;
                const dim = hover != null && hover !== p.key;
                return (
                  <g key={p.key}>
                    <path
                      d={d(pts)}
                      fill='none'
                      stroke={TRIP_CLASS_COLORS[p.cls]}
                      strokeWidth={p.cls === 'added' ? 2.75 : quiet ? 1.25 : 2}
                      strokeDasharray={p.cls === 'removed' ? '5 3' : undefined}
                      opacity={dim ? 0.15 : quiet || p.minor ? 0.55 : 1}
                    />
                    <Tooltip
                      followCursor
                      title={`${formatTime(p.new_time ?? p.base_time)} · ${pairSummary(p)}${p.minor ? ' (minor)' : ''}`}
                    >
                      <path
                        d={d(pts)}
                        fill='none'
                        stroke='transparent'
                        strokeWidth={10}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHover(p.key)}
                        onClick={() => onOpenTrip(p)}
                      />
                    </Tooltip>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </Box>
      <Typography variant='caption' color='text.secondary'>
        Parallel offsets are uniform shifts; changed slopes are running-time
        changes; a line jumping a row skips that stop. Click a line to open the
        trip.
      </Typography>
    </Box>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
