'use client';

import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import React, { useMemo, useState } from 'react';
import type { RouteInfo } from '../../lib/entity-diff-types';
import type { RouteDayCount } from '../../lib/trips-shards';
import { CountChange, TripRouteChip } from './shared';

const headSx = {
  fontWeight: 700,
  fontSize: '0.72rem',
  whiteSpace: 'nowrap',
} as const;
const cellSx = { fontSize: '0.8rem', py: 0.75 } as const;
/** Rows rendered at once; the search narrows the rest. */
const MAX_ROWS = 300;

interface RouteDayListProps {
  counts: RouteDayCount[];
  routes: Record<string, RouteInfo>;
  selected: string | null;
  onSelect: (routeId: string) => void;
}

/**
 * The routes of a day with their trip counts, for feeds too large to diff a
 * whole day in the browser: the counts come from the index, and a route's
 * trips are loaded and compared when it is picked.
 */
export default function RouteDayList({
  counts,
  routes,
  selected,
  onSelect,
}: RouteDayListProps): React.ReactElement {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return counts;
    return counts.filter((c) => {
      const r = routes[c.route];
      return [c.route, r?.short_name, r?.long_name].some((s) =>
        s?.toLowerCase().includes(q),
      );
    });
  }, [counts, routes, query]);
  const changed = counts.filter((c) => c.base !== c.new).length;

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
          mb: 1.5,
        }}
      >
        <TextField
          size='small'
          label='Find a route'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ width: 260 }}
        />
        <Typography variant='caption' color='text.secondary'>
          {counts.length.toLocaleString()} routes run this day ·{' '}
          {changed.toLocaleString()} with a different number of trips. This
          dataset is too large to compare a whole day at once: pick a route to
          compare its timetable.
        </Typography>
      </Box>
      <TableContainer
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: '6px',
          maxHeight: 420,
        }}
      >
        <Table size='small' stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={headSx}>Route</TableCell>
              <TableCell sx={headSx}>Name</TableCell>
              <TableCell sx={headSx} align='right'>
                Trips this day
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography variant='body2' color='text.secondary'>
                    No route matches.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {rows.slice(0, MAX_ROWS).map((c) => (
              <TableRow
                key={c.route}
                hover
                selected={c.route === selected}
                onClick={() => onSelect(c.route)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell sx={cellSx}>
                  <TripRouteChip routeId={c.route} route={routes[c.route]} />
                </TableCell>
                <TableCell sx={cellSx}>
                  {routes[c.route]?.long_name ?? ''}
                </TableCell>
                <TableCell sx={cellSx} align='right'>
                  <CountChange base={c.base} next={c.new} />
                </TableCell>
              </TableRow>
            ))}
            {rows.length > MAX_ROWS && (
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography variant='caption' color='text.secondary'>
                    {(rows.length - MAX_ROWS).toLocaleString()} more; search to
                    narrow the list.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
