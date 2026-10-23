'use client';

import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import React, { useState } from 'react';
import type { RouteInfo } from '../../lib/entity-diff-types';
import type { RouteDirDiff } from '../../lib/trips-types';
import {
  VERDICT_COLORS,
  VERDICT_LABELS,
  formatDelta,
  formatMinutes,
} from '../../lib/trips-utils';
import { CountChange, Sparkline, TimeText, TripRouteChip } from './shared';

const headSx = {
  fontWeight: 700,
  fontSize: '0.72rem',
  whiteSpace: 'nowrap',
} as const;
const cellSx = { fontSize: '0.8rem', py: 0.75 } as const;

function Span({ r }: { r: RouteDirDiff }): React.ReactElement {
  const fmt = (s: [number, number] | null): React.ReactElement =>
    s == null ? (
      <span>—</span>
    ) : (
      <>
        <TimeText sec={s[0]} />–<TimeText sec={s[1]} />
      </>
    );
  const same =
    r.span.base?.[0] === r.span.new?.[0] &&
    r.span.base?.[1] === r.span.new?.[1];
  if (same) return fmt(r.span.new);
  return (
    <Box component='span' sx={{ whiteSpace: 'nowrap' }}>
      <Box component='span' sx={{ color: 'text.secondary' }}>
        {fmt(r.span.base)}
      </Box>
      {' → '}
      <Box component='span' sx={{ fontWeight: 700 }}>
        {fmt(r.span.new)}
      </Box>
    </Box>
  );
}

function Headway({ r }: { r: RouteDirDiff }): React.ReactElement {
  const { base, new: next } = r.peak_headway;
  if (base === next) return <span>{formatMinutes(next)}</span>;
  return (
    <Box component='span' sx={{ whiteSpace: 'nowrap' }}>
      {base == null ? '—' : Math.round(base * 10) / 10} →{' '}
      <b>{formatMinutes(next)}</b>
    </Box>
  );
}

function Row({
  r,
  route,
  selected,
  onSelect,
}: {
  r: RouteDirDiff;
  route: RouteInfo | undefined;
  selected: boolean;
  onSelect: () => void;
}): React.ReactElement {
  const dim = r.verdicts.length === 0;
  return (
    <TableRow
      hover
      selected={selected}
      onClick={onSelect}
      sx={{ cursor: 'pointer', opacity: dim ? 0.6 : 1 }}
    >
      <TableCell sx={cellSx}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <TripRouteChip routeId={r.route} route={route} />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant='body2'
              noWrap
              sx={{ maxWidth: 200, fontSize: '0.8rem' }}
            >
              {r.headsign || route?.long_name || r.route}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {r.verdicts.map((v) => (
                <Box
                  key={v}
                  component='span'
                  sx={{
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    color: VERDICT_COLORS[v],
                  }}
                >
                  {VERDICT_LABELS[v]}
                </Box>
              ))}
              {r.minor_only && (
                <Box
                  component='span'
                  sx={{ fontSize: '0.62rem', color: 'text.secondary' }}
                >
                  Minor time changes only
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </TableCell>
      <TableCell sx={cellSx}>
        <CountChange base={r.trips.base} next={r.trips.new} />
      </TableCell>
      <TableCell sx={cellSx}>
        <Span r={r} />
      </TableCell>
      <TableCell sx={cellSx}>
        <Headway r={r} />
      </TableCell>
      <TableCell sx={cellSx}>
        {r.running ? (
          <Box component='span' sx={{ whiteSpace: 'nowrap' }}>
            {formatDelta(Math.round(r.running.delta))} median,{' '}
            {r.running.period}
          </Box>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell sx={cellSx}>
        {r.patterns_changed > 0 ? `${r.patterns_changed} changed` : '—'}
      </TableCell>
      <TableCell sx={cellSx}>
        <Sparkline base={r.profile.base} next={r.profile.new} />
      </TableCell>
    </TableRow>
  );
}

interface RouteOverviewTableProps {
  changed: RouteDirDiff[];
  unchanged: RouteDirDiff[];
  routes: Record<string, RouteInfo>;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export default function RouteOverviewTable({
  changed,
  unchanged,
  routes,
  selectedKey,
  onSelect,
}: RouteOverviewTableProps): React.ReactElement {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const selectedIsUnchanged = unchanged.some((r) => r.key === selectedKey);
  const rows =
    showUnchanged || selectedIsUnchanged ? [...changed, ...unchanged] : changed;
  return (
    <TableContainer
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '6px',
        maxHeight: 520,
      }}
    >
      <Table size='small' stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={headSx}>Route · direction</TableCell>
            <TableCell sx={headSx}>Trips per day</TableCell>
            <TableCell sx={headSx}>Service span</TableCell>
            <TableCell sx={headSx}>
              <Tooltip title='Median gap between departures in the busiest hour'>
                <span>Peak headway</span>
              </Tooltip>
            </TableCell>
            <TableCell sx={headSx}>
              <Tooltip title='Largest median change in end-to-end running time, by time of day (trips with a changed stop pattern excluded)'>
                <span>Running time</span>
              </Tooltip>
            </TableCell>
            <TableCell sx={headSx}>Stop patterns</TableCell>
            <TableCell sx={headSx}>Profile</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}>
                <Typography variant='body2' color='text.secondary'>
                  No route matches the selected verdicts on this day.
                </Typography>
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <Row
              key={r.key}
              r={r}
              route={routes[r.route]}
              selected={r.key === selectedKey}
              onSelect={() => onSelect(r.key)}
            />
          ))}
          {unchanged.length > 0 && !selectedIsUnchanged && (
            <TableRow>
              <TableCell colSpan={7} sx={{ py: 0.5 }}>
                <Button
                  size='small'
                  onClick={() => setShowUnchanged((v) => !v)}
                >
                  {showUnchanged
                    ? 'Hide unchanged routes'
                    : `${unchanged.length} unchanged route${unchanged.length === 1 ? '' : 's'}`}
                </Button>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
