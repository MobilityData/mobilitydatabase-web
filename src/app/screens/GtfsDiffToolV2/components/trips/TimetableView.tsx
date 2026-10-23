'use client';

import { Box, Tooltip, Typography } from '@mui/material';
import React, { useMemo, useState } from 'react';
import type { RouteDirDiff, TripPair } from '../../lib/trips-types';
import {
  QUIET_CLASSES,
  TRIP_CLASS_COLORS,
  pairRowTimes,
  pairSummary,
  timepointRows,
  timetableColumns,
} from '../../lib/trips-utils';
import { MONO_FONT, TimeText } from './shared';

const ADDED_BG = 'rgba(46, 125, 50, 0.12)';
const REMOVED_BG = 'rgba(211, 47, 47, 0.10)';
const CHANGED_BG = 'rgba(237, 108, 2, 0.16)';

interface TimetableViewProps {
  route: RouteDirDiff;
  pairs: TripPair[];
  stopNames: Record<string, string>;
  onOpenTrip: (pair: TripPair) => void;
}

/**
 * Printed-timetable layout: departures as columns, timepoint stops as rows.
 * Changed cells show the old time struck through; added and removed trips
 * are green and red columns; runs of unchanged trips fold.
 */
export default function TimetableView({
  route,
  pairs,
  stopNames,
  onOpenTrip,
}: TimetableViewProps): React.ReactElement {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const expand = (key: string): void =>
    setExpanded((s) => new Set([...s, key]));
  const rows = useMemo(() => timepointRows(route), [route]);
  const times = useMemo(
    () => new Map(pairs.map((p) => [p.key, pairRowTimes(p, route.stop_order)])),
    [pairs, route.stop_order],
  );
  const columns = useMemo(
    () => timetableColumns(pairs, expanded),
    [pairs, expanded],
  );

  if (pairs.length === 0)
    return (
      <Typography variant='body2' color='text.secondary'>
        No trips in the selected time range.
      </Typography>
    );

  const stickySx = {
    position: 'sticky',
    left: 0,
    zIndex: 2,
    bgcolor: 'background.paper',
    borderRight: '1px solid',
    borderColor: 'divider',
  } as const;
  const cellSx = {
    px: 0.75,
    py: 0.25,
    fontFamily: MONO_FONT,
    fontSize: '0.72rem',
    textAlign: 'center',
    borderBottom: '1px solid',
    borderColor: 'divider',
    whiteSpace: 'nowrap',
  } as const;

  return (
    <Box
      sx={{
        overflowX: 'auto',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '6px',
      }}
    >
      <Box
        component='table'
        sx={{ borderCollapse: 'separate', borderSpacing: 0 }}
      >
        <thead>
          <tr>
            <Box
              component='th'
              sx={{ ...stickySx, ...cellSx, textAlign: 'left', zIndex: 3 }}
            >
              <Typography variant='caption' fontWeight={700}>
                Stop ·{' '}
                {rows.length < route.stop_order.length
                  ? 'timepoints'
                  : 'all stops'}
              </Typography>
            </Box>
            {columns.map((c) =>
              c.kind === 'fold' ? (
                <Tooltip
                  key={c.key}
                  title='Unchanged or ID-only trips. Click to expand.'
                >
                  <Box
                    component='th'
                    onClick={() => expand(c.key)}
                    sx={{
                      ...cellSx,
                      cursor: 'pointer',
                      bgcolor: 'action.hover',
                      color: 'text.secondary',
                      fontWeight: 400,
                      lineHeight: 1.2,
                      '&:hover': { bgcolor: 'action.selected' },
                    }}
                  >
                    <Box sx={{ fontWeight: 700 }}>
                      {c.pairs.length} unchanged
                    </Box>
                    <Box sx={{ fontSize: '0.62rem' }}>
                      <TimeText sec={c.pairs[0].time} />–
                      <TimeText sec={c.pairs[c.pairs.length - 1].time} />
                    </Box>
                  </Box>
                </Tooltip>
              ) : (
                <HeaderCell
                  key={c.pair.key}
                  pair={c.pair}
                  sx={cellSx}
                  onClick={() => onOpenTrip(c.pair)}
                />
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const stopId = route.stop_order[row];
            return (
              <tr key={row}>
                <Box
                  component='td'
                  sx={{
                    ...stickySx,
                    ...cellSx,
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    maxWidth: 220,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={`${stopNames[stopId] ?? stopId} (${stopId})`}
                >
                  {stopNames[stopId] ?? stopId}
                </Box>
                {columns.map((c) =>
                  c.kind === 'fold' ? (
                    <Box
                      component='td'
                      key={c.key}
                      onClick={() => expand(c.key)}
                      sx={{
                        ...cellSx,
                        bgcolor: 'action.hover',
                        cursor: 'pointer',
                      }}
                    />
                  ) : (
                    <TimeCell
                      key={c.pair.key}
                      pair={c.pair}
                      t={times.get(c.pair.key)}
                      row={row}
                      sx={cellSx}
                      onClick={() => onOpenTrip(c.pair)}
                    />
                  ),
                )}
              </tr>
            );
          })}
        </tbody>
      </Box>
    </Box>
  );
}

function HeaderCell({
  pair,
  sx,
  onClick,
}: {
  pair: TripPair;
  sx: object;
  onClick: () => void;
}): React.ReactElement {
  const color = TRIP_CLASS_COLORS[pair.cls];
  return (
    <Tooltip
      title={`${pairSummary(pair)}${pair.minor ? ' (minor)' : ''} · click for details`}
    >
      <Box
        component='th'
        onClick={onClick}
        sx={{
          ...sx,
          cursor: 'pointer',
          borderTop: `3px ${pair.cls === 'removed' ? 'dashed' : 'solid'} ${QUIET_CLASSES.has(pair.cls) ? 'transparent' : color}`,
          bgcolor:
            pair.cls === 'added'
              ? ADDED_BG
              : pair.cls === 'removed'
                ? REMOVED_BG
                : undefined,
          opacity: pair.minor ? 0.55 : 1,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Box sx={{ fontWeight: 700 }}>
          <TimeText
            sec={pair.new_time ?? pair.base_time}
            strike={pair.cls === 'removed'}
          />
        </Box>
      </Box>
    </Tooltip>
  );
}

function TimeCell({
  pair,
  t,
  row,
  sx,
  onClick,
}: {
  pair: TripPair;
  t: ReturnType<typeof pairRowTimes> | undefined;
  row: number;
  sx: object;
  onClick: () => void;
}): React.ReactElement {
  const b = t?.base[row] ?? null;
  const n = t?.new[row] ?? null;
  const bServed = t?.baseServed[row] ?? false;
  const nServed = t?.newServed[row] ?? false;
  let content: React.ReactNode = (
    <Box component='span' sx={{ color: 'text.disabled' }}>
      ·
    </Box>
  );
  let bg: string | undefined;
  if (pair.cls === 'added') {
    bg = ADDED_BG;
    if (nServed) content = <TimeText sec={n} />;
  } else if (pair.cls === 'removed') {
    bg = REMOVED_BG;
    if (bServed)
      content = (
        <Box component='span' sx={{ color: '#d32f2f' }}>
          <TimeText sec={b} strike />
        </Box>
      );
  } else if (bServed && nServed) {
    if (b === n || b == null || n == null) content = <TimeText sec={n ?? b} />;
    else {
      bg = pair.minor ? undefined : CHANGED_BG;
      content = (
        <Box sx={{ lineHeight: 1.15 }}>
          <Box sx={{ color: 'text.secondary', fontSize: '0.62rem' }}>
            <TimeText sec={b} strike />
          </Box>
          <Box sx={{ fontWeight: 700 }}>
            <TimeText sec={n} />
          </Box>
        </Box>
      );
    }
  } else if (nServed) {
    bg = ADDED_BG;
    content = (
      <Tooltip title='Now stops here'>
        <Box component='span' sx={{ color: '#2e7d32', fontWeight: 700 }}>
          +<TimeText sec={n} />
        </Box>
      </Tooltip>
    );
  } else if (bServed) {
    bg = REMOVED_BG;
    content = (
      <Tooltip title='No longer stops here'>
        <Box component='span' sx={{ color: '#d32f2f' }}>
          <TimeText sec={b} strike />
        </Box>
      </Tooltip>
    );
  }
  return (
    <Box
      component='td'
      onClick={onClick}
      sx={{
        ...sx,
        bgcolor: bg,
        cursor: 'pointer',
        opacity: pair.minor ? 0.55 : QUIET_CLASSES.has(pair.cls) ? 0.8 : 1,
      }}
    >
      {content}
    </Box>
  );
}
