'use client';

import {
  Box,
  Button,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import React, { useMemo, useState } from 'react';
import type { RouteInfo } from '../../lib/entity-diff-types';
import type { RouteDayCount } from '../../lib/trips-shards';
import { normalizeText } from '../../lib/stops-utils';
import { CountChange, TripRouteChip } from '../trips/shared';
import { V2Card } from './shared';

const PAGE = 50;

interface RouteDayCountsCardProps {
  rows: RouteDayCount[];
  routes: Record<string, RouteInfo>;
  /** The day compared, for the scope tag. */
  scope: string;
  onOpen: (routeId: string) => void;
}

/**
 * For feeds too large to diff a whole day in the browser: each route's trip
 * count on the day, before → after, read from the index. The full diff of a
 * route is on its own page.
 */
export default function RouteDayCountsCard({
  rows,
  routes,
  scope,
  onOpen,
}: RouteDayCountsCardProps): React.ReactElement {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const shown = useMemo(() => {
    const q = normalizeText(query);
    if (q === '') return rows;
    return rows.filter((r) => {
      const info = routes[r.route];
      return [r.route, info?.short_name ?? '', info?.long_name ?? ''].some(
        (s) => normalizeText(s).includes(q),
      );
    });
  }, [rows, routes, query]);
  const changed = rows.filter((r) => r.base !== r.new).length;

  return (
    <V2Card
      title='Routes running this day'
      scope={scope}
      caption={`This feed is too large to compare a whole day in the browser, so only trip counts are shown here: ${changed} of ${rows.length} routes run a different number of trips. Open a route to see how its trips changed.`}
      actions={
        <TextField
          size='small'
          placeholder='Search routes…'
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position='start'>
                  <Search fontSize='small' />
                </InputAdornment>
              ),
            },
          }}
          sx={{ width: { xs: '100%', sm: 260 } }}
        />
      }
    >
      <Table size='small'>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Route</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Trips this day</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {shown.slice(0, limit).map((r) => {
            const info = routes[r.route];
            return (
              <TableRow
                key={r.route}
                hover
                onClick={() => onOpen(r.route)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TripRouteChip routeId={r.route} route={info} />
                    <Typography variant='body2' noWrap sx={{ maxWidth: 360 }}>
                      {info?.long_name || r.route}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <CountChange base={r.base} next={r.new} />
                </TableCell>
                <TableCell align='right'>
                  <Typography variant='body2' color='primary' fontWeight={600}>
                    Open →
                  </Typography>
                </TableCell>
              </TableRow>
            );
          })}
          {shown.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3}>
                <Typography variant='body2' color='text.secondary'>
                  No route matches.
                </Typography>
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      {shown.length > limit ? (
        <Button
          size='small'
          onClick={() => setLimit((l) => l + PAGE)}
          sx={{ mt: 1 }}
        >
          Show {Math.min(PAGE, shown.length - limit)} more of{' '}
          {shown.length - limit}
        </Button>
      ) : null}
    </V2Card>
  );
}
