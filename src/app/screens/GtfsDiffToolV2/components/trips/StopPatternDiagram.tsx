'use client';

import { Box, Tooltip, Typography } from '@mui/material';
import React, { useMemo } from 'react';
import type { RouteDirDiff, TripPair } from '../../lib/trips-types';
import { QUIET_CLASSES, patternKey } from '../../lib/trips-utils';

const ADDED = '#2e7d32';
const REMOVED = '#d32f2f';
const ROW_H = 22;
const COL_W = 64;

type CellMark = 'none' | 'line' | 'stop' | 'added' | 'skipped';

interface Column {
  key: string;
  status: 'both' | 'new' | 'removed';
  base: number;
  new: number;
  marks: CellMark[];
  example: TripPair | null;
}

interface StopPatternDiagramProps {
  route: RouteDirDiff;
  /** Pairs in the brushed time range. */
  pairs: TripPair[];
  stopNames: Record<string, string>;
  onOpenTrip: (pair: TripPair) => void;
}

/**
 * One vertical strip per unique stop sequence, with how many trips use it
 * in each feed. Patterns only in the new feed are compared with the base
 * pattern their trips were matched to: added stops are green, stops it no
 * longer serves are red crosses.
 */
export default function StopPatternDiagram({
  route,
  pairs,
  stopNames,
  onOpenTrip,
}: StopPatternDiagramProps): React.ReactElement {
  const order = route.stop_order;

  const { columns, rowStatus } = useMemo(() => {
    const counts = new Map<string, { base: number; new: number }>();
    const example = new Map<string, TripPair>();
    for (const p of pairs) {
      for (const side of ['base', 'new'] as const) {
        const t = p[side];
        if (!t) continue;
        const k = patternKey(t);
        const c = counts.get(k) ?? { base: 0, new: 0 };
        c[side]++;
        counts.set(k, c);
        // Prefer a changed trip as the pattern's example.
        const prev = example.get(k);
        if (!prev || (QUIET_CLASSES.has(prev.cls) && !QUIET_CLASSES.has(p.cls)))
          example.set(k, p);
      }
    }
    const byKey = new Map(route.patterns.map((p) => [p.key, p]));
    const rowsOf = (stops: string[]): Set<number> => {
      // Patterns are subsequences of the stop order; walk it once.
      const out = new Set<number>();
      let j = 0;
      for (let i = 0; i < order.length && j < stops.length; i++)
        if (order[i] === stops[j]) {
          out.add(i);
          j++;
        }
      return out;
    };

    const cols: Column[] = [];
    for (const p of route.patterns) {
      const c = counts.get(p.key);
      if (!c) continue;
      const status = p.base === 0 ? 'new' : p.new === 0 ? 'removed' : 'both';
      const served = rowsOf(p.stops);
      const ref = p.ref ? byKey.get(p.ref) : undefined;
      const refRows = ref ? rowsOf(ref.stops) : null;
      const idx = [...served, ...(refRows ?? [])];
      const first = Math.min(...idx);
      const last = Math.max(...idx);
      const marks = order.map((_, i): CellMark => {
        if (served.has(i)) return refRows && !refRows.has(i) ? 'added' : 'stop';
        if (refRows?.has(i)) return 'skipped';
        return i > first && i < last ? 'line' : 'none';
      });
      cols.push({
        key: p.key,
        status,
        base: c.base,
        new: c.new,
        marks,
        example: example.get(p.key) ?? null,
      });
    }
    cols.sort(
      (a, b) =>
        Number(a.status === 'both') - Number(b.status === 'both') ||
        b.base + b.new - (a.base + a.new),
    );

    // Stop rows served only by base (removed) or only by new (added) patterns.
    const inBase = new Set<number>();
    const inNew = new Set<number>();
    for (const p of route.patterns) {
      const rows = rowsOf(p.stops);
      if (p.base > 0) rows.forEach((r) => inBase.add(r));
      if (p.new > 0) rows.forEach((r) => inNew.add(r));
    }
    const status = order.map((_, i) =>
      inBase.has(i) && !inNew.has(i)
        ? 'removed'
        : inNew.has(i) && !inBase.has(i)
          ? 'added'
          : 'kept',
    );
    return { columns: cols, rowStatus: status };
  }, [route, pairs, order]);

  if (columns.length === 0)
    return (
      <Typography variant='body2' color='text.secondary'>
        No trips in the selected time range.
      </Typography>
    );

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `minmax(160px, 240px) repeat(${columns.length}, ${COL_W}px)`,
          width: 'max-content',
          minWidth: '100%',
        }}
      >
        {/* Header */}
        <Box />
        {columns.map((c) => (
          <Tooltip
            key={c.key}
            title={
              c.example
                ? 'Open an example trip using this pattern'
                : 'No trip in range'
            }
          >
            <Box
              role='button'
              onClick={() => c.example && onOpenTrip(c.example)}
              sx={{
                textAlign: 'center',
                cursor: c.example ? 'pointer' : 'default',
                px: 0.5,
                pb: 0.5,
                borderBottom: '3px solid',
                borderColor:
                  c.status === 'new'
                    ? ADDED
                    : c.status === 'removed'
                      ? REMOVED
                      : 'divider',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Typography
                variant='caption'
                component='div'
                fontWeight={700}
                sx={{
                  color:
                    c.status === 'new'
                      ? ADDED
                      : c.status === 'removed'
                        ? REMOVED
                        : 'text.secondary',
                  fontSize: '0.62rem',
                  textTransform: 'uppercase',
                }}
              >
                {c.status === 'both'
                  ? 'Kept'
                  : c.status === 'new'
                    ? 'New'
                    : 'Removed'}
              </Typography>
              <Typography
                variant='caption'
                component='div'
                sx={{ whiteSpace: 'nowrap', fontSize: '0.68rem' }}
              >
                {c.base} → {c.new}
              </Typography>
            </Box>
          </Tooltip>
        ))}

        {/* Rows */}
        {order.map((stopId, i) => (
          <React.Fragment key={`${stopId}-${i}`}>
            <Box
              sx={{
                height: ROW_H,
                display: 'flex',
                alignItems: 'center',
                pr: 1,
                fontSize: '0.75rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color:
                  rowStatus[i] === 'added'
                    ? ADDED
                    : rowStatus[i] === 'removed'
                      ? REMOVED
                      : 'text.primary',
                textDecoration:
                  rowStatus[i] === 'removed' ? 'line-through' : undefined,
                fontWeight: rowStatus[i] === 'kept' ? 400 : 700,
              }}
              title={`${stopNames[stopId] ?? stopId} (${stopId})`}
            >
              {stopNames[stopId] ?? stopId}
            </Box>
            {columns.map((c) => (
              <PatternCell
                key={c.key}
                mark={c.marks[i]}
                faded={c.status === 'removed'}
                above={i > 0 && c.marks[i - 1] !== 'none'}
                below={i < order.length - 1 && c.marks[i + 1] !== 'none'}
              />
            ))}
          </React.Fragment>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
        <Typography variant='caption' color='text.secondary'>
          Column header: trips using the pattern, base → new. Click to open an
          example trip.
        </Typography>
        <Typography variant='caption' sx={{ color: ADDED }}>
          ● stop added
        </Typography>
        <Typography variant='caption' sx={{ color: REMOVED }}>
          ✕ newly skipped
        </Typography>
        <Typography
          variant='caption'
          sx={{ color: REMOVED, textDecoration: 'line-through' }}
        >
          stop removed from route
        </Typography>
      </Box>
    </Box>
  );
}

function PatternCell({
  mark,
  faded,
  above,
  below,
}: {
  mark: CellMark;
  faded: boolean;
  above: boolean;
  below: boolean;
}): React.ReactElement {
  const lineColor = faded ? REMOVED : '#757575';
  const isStop = mark === 'stop' || mark === 'added';
  return (
    <Box
      sx={{
        height: ROW_H,
        position: 'relative',
        opacity: faded ? 0.55 : 1,
      }}
    >
      {mark !== 'none' && (
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: above ? 0 : '50%',
            bottom: below ? 0 : '50%',
            borderLeft: `2px ${mark === 'skipped' ? 'dotted' : 'solid'} ${lineColor}`,
            transform: 'translateX(-1px)',
          }}
        />
      )}
      {isStop && (
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 10,
            height: 10,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            bgcolor: mark === 'added' ? ADDED : 'background.paper',
            border: `2px solid ${mark === 'added' ? ADDED : faded ? REMOVED : '#424242'}`,
          }}
        />
      )}
      {mark === 'skipped' && (
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -52%)',
            color: REMOVED,
            fontWeight: 700,
            fontSize: '0.8rem',
            lineHeight: 1,
            bgcolor: 'background.paper',
          }}
        >
          ✕
        </Box>
      )}
    </Box>
  );
}
