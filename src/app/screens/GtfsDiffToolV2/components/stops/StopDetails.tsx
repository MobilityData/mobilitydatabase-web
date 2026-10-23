'use client';

import {
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import React from 'react';
import type { RouteInfo, StopChange } from '../../lib/entity-diff-types';
import {
  STOP_KIND_COLORS,
  STOP_KIND_LABELS,
  bearing,
  formatDistance,
  stopKind,
} from '../../lib/stops-utils';
import { MONO_FONT, RouteChips } from '../calendar/shared';

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function compass(deg: number): string {
  return COMPASS[Math.round(deg / 45) % 8];
}

const cellSx = {
  fontFamily: MONO_FONT,
  fontSize: '0.75rem',
  py: 0.5,
  px: 1,
  maxWidth: 260,
  wordBreak: 'break-word' as const,
};

interface StopDetailsProps {
  stop: StopChange;
  columns: string[];
  routes: Record<string, RouteInfo>;
  minMoveM: number;
}

export function StopDetails({
  stop,
  columns,
  routes,
  minMoveM,
}: StopDetailsProps): React.ReactElement {
  const kind = stopKind(stop, minMoveM);
  const changed = new Set(stop.field_changes.map((c) => c.field));
  const routeIds = [
    ...new Set([...stop.route_ids.base, ...stop.route_ids.new]),
  ].sort();
  // Skip columns empty in both versions to keep the popup compact.
  const rows = columns.filter(
    (c) => (stop.base?.[c] ?? '') !== '' || (stop.new?.[c] ?? '') !== '',
  );
  const showBase = stop.base != null;
  const showNew = stop.new != null;

  return (
    <Box
      sx={{
        p: 2,
        minWidth: { xs: 260, sm: 420 },
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Chip
          label={STOP_KIND_LABELS[kind].toUpperCase()}
          size='small'
          sx={{
            bgcolor: STOP_KIND_COLORS[kind],
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.62rem',
            height: 18,
          }}
        />
        <Typography
          sx={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: '0.8rem' }}
        >
          {stop.stop_id}
        </Typography>
      </Box>
      <Typography variant='body2' fontWeight={700} sx={{ mb: 0.5 }}>
        {stop.name || 'Unnamed stop'}
      </Typography>
      {stop.moved_m != null &&
        stop.moved_m > 0 &&
        stop.base_coord &&
        stop.new_coord && (
          <Typography
            variant='caption'
            component='div'
            sx={{
              color:
                kind === 'moved' ? STOP_KIND_COLORS.moved : 'text.secondary',
              mb: 0.5,
            }}
          >
            {kind === 'moved' ? 'Moved' : 'Coordinates shifted'}{' '}
            {formatDistance(stop.moved_m)}{' '}
            {compass(bearing(stop.base_coord, stop.new_coord))}
          </Typography>
        )}
      <Box sx={{ mb: 1 }}>
        <RouteChips routeIds={routeIds} routes={routes} />
      </Box>
      {/* Only the table scrolls; the header lines above stay in place. */}
      <Box sx={{ overflowY: 'auto', minHeight: 0 }}>
        <Table size='small' stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell
                sx={{ ...cellSx, fontFamily: 'inherit', fontWeight: 700 }}
              >
                Field
              </TableCell>
              {showBase && (
                <TableCell
                  sx={{ ...cellSx, fontFamily: 'inherit', fontWeight: 700 }}
                >
                  Before
                </TableCell>
              )}
              {showNew && (
                <TableCell
                  sx={{ ...cellSx, fontFamily: 'inherit', fontWeight: 700 }}
                >
                  After
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((c) => {
              const isChanged = changed.has(c);
              return (
                <TableRow
                  key={c}
                  sx={{
                    bgcolor: isChanged ? 'rgba(237,108,2,.10)' : undefined,
                  }}
                >
                  <TableCell
                    sx={{
                      ...cellSx,
                      color: 'text.secondary',
                      fontWeight: isChanged ? 700 : 400,
                    }}
                  >
                    {c}
                  </TableCell>
                  {showBase && (
                    <TableCell
                      sx={{
                        ...cellSx,
                        color: isChanged ? '#d32f2f' : undefined,
                        textDecoration: isChanged ? 'line-through' : undefined,
                      }}
                    >
                      {stop.base?.[c] || '—'}
                    </TableCell>
                  )}
                  {showNew && (
                    <TableCell
                      sx={{
                        ...cellSx,
                        color: isChanged ? '#2e7d32' : undefined,
                        fontWeight: isChanged ? 700 : 400,
                      }}
                    >
                      {stop.new?.[c] || '—'}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}

interface UnchangedStopDetailsProps {
  stopId: string;
  name: string;
  feed: 'base' | 'new';
}

/** Popup for an overlay stop that has no change. */
export function UnchangedStopDetails({
  stopId,
  name,
  feed,
}: UnchangedStopDetailsProps): React.ReactElement {
  return (
    <Box sx={{ p: 1.25, minWidth: 200 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Chip
          label='UNCHANGED'
          size='small'
          sx={{
            bgcolor: '#757575',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.62rem',
            height: 18,
          }}
        />
        <Typography
          sx={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: '0.8rem' }}
        >
          {stopId}
        </Typography>
      </Box>
      <Typography variant='body2' fontWeight={700}>
        {name || 'Unnamed stop'}
      </Typography>
      <Typography variant='caption' color='text.secondary'>
        From the {feed === 'base' ? 'original' : 'new'} feed overlay
      </Typography>
    </Box>
  );
}
