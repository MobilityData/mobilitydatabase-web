'use client';

import { Box, Button, Typography } from '@mui/material';
import React, { useMemo, useState } from 'react';
import type { RouteDirDiff } from '../../lib/trips-types';
import { patternsCaption } from '../../lib/trips-v2-summary';
import { ADDED, REMOVED, SubHeading } from './shared';

const COL_W = 84;
const LABEL_W = 132;
const ROW_H = 26;
const MAX_PATTERNS = 6;

type Mark = 'none' | 'pass' | 'stop' | 'added' | 'skipped';

interface Line {
  key: string;
  status: 'both' | 'new' | 'removed';
  base: number;
  new: number;
  marks: Mark[];
  first: number;
  last: number;
}

/**
 * Each stop pattern as a horizontal line over the route's stops, all lines
 * on the same columns so they read against each other. A pattern only in
 * the after feed is compared with the before pattern its trips matched:
 * green stops are new, red crosses are stops it no longer serves.
 */
export default function StopPatternLines({
  route,
  stopNames,
}: {
  route: RouteDirDiff;
  stopNames: Record<string, string>;
}): React.ReactElement {
  const [showAll, setShowAll] = useState(false);
  const order = route.stop_order;

  const { lines, stopStatus } = useMemo(() => {
    const rowsOf = (stops: string[]): Set<number> => {
      const out = new Set<number>();
      let j = 0;
      for (let i = 0; i < order.length && j < stops.length; i++)
        if (order[i] === stops[j]) {
          out.add(i);
          j++;
        }
      return out;
    };
    const byKey = new Map(route.patterns.map((p) => [p.key, p]));
    const out: Line[] = route.patterns.map((p) => {
      const served = rowsOf(p.stops);
      const ref = p.base === 0 && p.ref ? byKey.get(p.ref) : undefined;
      const refRows = ref ? rowsOf(ref.stops) : null;
      const idx = [...served, ...(refRows ?? [])];
      const first = Math.min(...idx);
      const last = Math.max(...idx);
      return {
        key: p.key,
        status: p.base === 0 ? 'new' : p.new === 0 ? 'removed' : 'both',
        base: p.base,
        new: p.new,
        first,
        last,
        marks: order.map((_, i): Mark => {
          if (served.has(i))
            return refRows && !refRows.has(i) ? 'added' : 'stop';
          if (refRows?.has(i)) return 'skipped';
          return i > first && i < last ? 'pass' : 'none';
        }),
      };
    });
    // Unchanged patterns first, then each new one, then what it replaced.
    out.sort(
      (a, b) =>
        Number(a.status !== 'both') - Number(b.status !== 'both') ||
        b.base + b.new - (a.base + a.new),
    );
    const inBase = new Set<number>();
    const inNew = new Set<number>();
    for (const p of route.patterns) {
      const rows = rowsOf(p.stops);
      if (p.base > 0) rows.forEach((r) => inBase.add(r));
      if (p.new > 0) rows.forEach((r) => inNew.add(r));
    }
    return {
      lines: out,
      stopStatus: order.map((_, i) =>
        inBase.has(i) && !inNew.has(i)
          ? 'removed'
          : inNew.has(i) && !inBase.has(i)
            ? 'added'
            : 'kept',
      ),
    };
  }, [route, order]);

  const shown = showAll ? lines : lines.slice(0, MAX_PATTERNS);
  const gridCols = `${LABEL_W}px repeat(${order.length}, ${COL_W}px) 96px`;

  return (
    <Box>
      <SubHeading title='Stop patterns' caption={patternsCaption(route)} />
      <Box
        sx={{
          overflowX: 'auto',
          py: 1,
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: gridCols,
            width: 'max-content',
            rowGap: 0.5,
          }}
        >
          {shown.map((l) => (
            <React.Fragment key={l.key}>
              <Typography
                variant='caption'
                fontWeight={700}
                sx={{
                  alignSelf: 'center',
                  color:
                    l.status === 'new'
                      ? ADDED
                      : l.status === 'removed'
                        ? REMOVED
                        : 'text.primary',
                }}
              >
                {l.status === 'both'
                  ? 'Before and after'
                  : l.status === 'new'
                    ? 'After only'
                    : 'Before only'}
              </Typography>
              {l.marks.map((m, i) => (
                <Cell
                  key={i}
                  mark={m}
                  faded={l.status === 'removed'}
                  left={i > l.first && m !== 'none'}
                  right={i < l.last && m !== 'none'}
                />
              ))}
              <Typography
                variant='caption'
                sx={{ alignSelf: 'center', textAlign: 'right', pl: 1 }}
              >
                {l.base} → {l.new} trips
              </Typography>
            </React.Fragment>
          ))}
          <Box />
          {order.map((id, i) => (
            <Typography
              key={`${id}-${i}`}
              variant='caption'
              title={`${stopNames[id] ?? id} (${id})`}
              sx={{
                px: 0.5,
                textAlign: 'center',
                lineHeight: 1.2,
                fontSize: '0.68rem',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                color:
                  stopStatus[i] === 'added'
                    ? ADDED
                    : stopStatus[i] === 'removed'
                      ? REMOVED
                      : 'text.primary',
                fontWeight: stopStatus[i] === 'kept' ? 400 : 700,
                textDecoration:
                  stopStatus[i] === 'removed' ? 'line-through' : undefined,
              }}
            >
              {stopNames[id] ?? id}
            </Typography>
          ))}
          <Box />
        </Box>
      </Box>
      {lines.length > MAX_PATTERNS ? (
        <Button
          size='small'
          onClick={() => setShowAll((v) => !v)}
          sx={{ mt: 0.5 }}
        >
          {showAll
            ? 'Show fewer patterns'
            : `Show ${lines.length - MAX_PATTERNS} more patterns`}
        </Button>
      ) : null}
    </Box>
  );
}

function Cell({
  mark,
  faded,
  left,
  right,
}: {
  mark: Mark;
  faded: boolean;
  left: boolean;
  right: boolean;
}): React.ReactElement {
  const line = faded ? REMOVED : 'text.secondary';
  return (
    <Box sx={{ position: 'relative', height: ROW_H, opacity: faded ? 0.6 : 1 }}>
      {left ? (
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: '50%',
            borderTop: '2px solid',
            borderColor: line,
            transform: 'translateY(-1px)',
          }}
        />
      ) : null}
      {right ? (
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            right: 0,
            borderTop: '2px solid',
            borderColor: line,
            transform: 'translateY(-1px)',
          }}
        />
      ) : null}
      {mark === 'stop' || mark === 'added' ? (
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 11,
            height: 11,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            bgcolor: mark === 'added' ? ADDED : 'background.paper',
            border: '2px solid',
            borderColor:
              mark === 'added' ? ADDED : faded ? REMOVED : 'text.primary',
          }}
        />
      ) : null}
      {mark === 'skipped' ? (
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            color: REMOVED,
            bgcolor: 'background.paper',
            fontWeight: 700,
            fontSize: '0.85rem',
            lineHeight: 1,
          }}
        >
          ✕
        </Box>
      ) : null}
    </Box>
  );
}
