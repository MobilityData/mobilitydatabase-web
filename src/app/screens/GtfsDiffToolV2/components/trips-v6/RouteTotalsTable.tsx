'use client';

import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import React, { useState } from 'react';
import type { RouteInfo } from '../../lib/entity-diff-types';
import { emptyCounts } from '../../lib/trips-calendar';
import type { MainChangeCategory } from '../../lib/trips-v2-summary';
import type { RouteListRow } from '../../lib/trips-v6-routes';
import { TripRouteChip } from '../trips/shared';
import { ChangeTriplet } from '../trips-v3/shared';
import { MainChangeChips } from '../trips-v5/MainChangeChips';

const headSx = {
  fontWeight: 700,
  fontSize: '0.72rem',
  whiteSpace: 'nowrap',
  color: 'text.secondary',
} as const;
const cellSx = { fontSize: '0.8rem', py: 0.75, verticalAlign: 'top' } as const;

function pick(r: RouteListRow): {
  added: number;
  removed: number;
  modified: number;
} {
  return { added: r.added, removed: r.removed, modified: r.modified };
}

/** Rows shown at first, and added by "Show more". */
const PAGE = 100;

/** Routes with their trip changes over the calendar; a row opens the route. */
export default function RouteTotalsTable({
  rows,
  routeInfo,
  selected,
  onOpen,
}: {
  rows: RouteListRow[];
  routeInfo: Record<string, RouteInfo>;
  /** Categories filtered on: their chips are filled. */
  selected: MainChangeCategory[];
  onOpen: (route: string) => void;
}): React.ReactElement {
  const [limit, setLimit] = useState(PAGE);
  return (
    <>
      <Table size='small'>
        <TableHead>
          <TableRow>
            <TableCell sx={headSx}>Route</TableCell>
            <TableCell sx={headSx}>Trip changes, all dates</TableCell>
            <TableCell sx={headSx}>Dates with changes</TableCell>
            <TableCell sx={headSx}>Main changes</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.slice(0, limit).map((r) => {
            const info = routeInfo[r.route];
            return (
              <TableRow
                key={r.route}
                hover
                onClick={() => onOpen(r.route)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell sx={cellSx}>
                  <Box
                    sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}
                  >
                    <TripRouteChip routeId={r.route} route={info} />
                    <Typography
                      variant='body2'
                      fontWeight={700}
                      sx={{ fontSize: '0.8rem' }}
                    >
                      {info?.long_name || info?.short_name || r.route}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>
                  <ChangeTriplet counts={{ ...emptyCounts(), ...pick(r) }} />
                </TableCell>
                <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>
                  {r.days.toLocaleString()} of {r.serviceDays.toLocaleString()}
                </TableCell>
                <TableCell sx={{ ...cellSx, minWidth: 220 }}>
                  {r.categories.length > 0 ? (
                    <MainChangeChips
                      categories={r.categories}
                      selected={selected}
                    />
                  ) : (
                    '—'
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {rows.length > limit ? (
        <Button
          size='small'
          onClick={() => setLimit((l) => l + PAGE)}
          sx={{ mt: 1, textTransform: 'none' }}
        >
          Show {Math.min(PAGE, rows.length - limit)} more of{' '}
          {(rows.length - limit).toLocaleString()}
        </Button>
      ) : null}
    </>
  );
}
