'use client';

import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Clear, Search } from '@mui/icons-material';
import React, { useMemo, useState } from 'react';
import type { RouteInfo } from '../../lib/entity-diff-types';
import type { RouteDirDiff, RouteVerdict } from '../../lib/trips-types';
import {
  VERDICT_COLORS,
  VERDICT_LABELS,
  formatTime,
} from '../../lib/trips-utils';
import {
  FILTER_VERDICTS,
  type RouteRowFilters,
  filterRouteRows,
  verdictCounts,
} from '../../lib/trips-v2-routes';
import { routeRowSummary, signed } from '../../lib/trips-v2-summary';
import { CountChange, MONO_FONT, TripRouteChip } from '../trips/shared';
import { V2Card } from './shared';

const headSx = {
  fontWeight: 700,
  fontSize: '0.72rem',
  whiteSpace: 'nowrap',
  color: 'text.secondary',
} as const;
const cellSx = { fontSize: '0.8rem', py: 1, verticalAlign: 'top' } as const;

interface RouteChangesTableProps {
  changed: RouteDirDiff[];
  quiet: RouteDirDiff[];
  routes: Record<string, RouteInfo>;
  stopNames: Record<string, string>;
  filters: RouteRowFilters;
  onFiltersChange: (filters: RouteRowFilters) => void;
  /** Open the route's own page. */
  onOpen: (row: RouteDirDiff) => void;
  /** The day compared, for the scope tag: "Weekday · Tue 8 Sep". */
  scope: string;
}

function spanText(s: [number, number] | null): string {
  return s == null ? '—' : `${formatTime(s[0])}–${formatTime(s[1])}`;
}

function Row({
  r,
  route,
  stopNames,
  onOpen,
}: {
  r: RouteDirDiff;
  route: RouteInfo | undefined;
  stopNames: Record<string, string>;
  onOpen: () => void;
}): React.ReactElement {
  const s = routeRowSummary(r, stopNames);
  const spanChanged =
    r.span.base?.[0] !== r.span.new?.[0] ||
    r.span.base?.[1] !== r.span.new?.[1];
  return (
    <TableRow
      hover
      role='link'
      tabIndex={0}
      aria-label={`Open route ${route?.short_name || r.route}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      sx={{
        cursor: 'pointer',
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: -2,
        },
      }}
    >
      <TableCell sx={cellSx}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <TripRouteChip routeId={r.route} route={route} />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant='body2'
              fontWeight={700}
              sx={{ fontSize: '0.8rem' }}
            >
              {r.headsign || route?.long_name || r.route}
            </Typography>
            <Typography
              variant='caption'
              color='text.secondary'
              sx={{ fontFamily: MONO_FONT }}
            >
              direction_id {r.dir === '' ? '(none)' : r.dir}
            </Typography>
          </Box>
        </Box>
      </TableCell>
      <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>
        <CountChange base={r.trips.base} next={r.trips.new} />
      </TableCell>
      <TableCell
        sx={{ ...cellSx, fontFamily: MONO_FONT, whiteSpace: 'nowrap' }}
      >
        {spanChanged ? (
          // Old span struck through above the new one, as in the raw diff.
          <>
            {r.span.base ? (
              <Box
                aria-label={`Before ${spanText(r.span.base)}`}
                sx={{
                  color: 'text.secondary',
                  textDecoration: 'line-through',
                  fontSize: '0.72rem',
                }}
              >
                {spanText(r.span.base)}
              </Box>
            ) : null}
            {r.span.new ? <Box>{spanText(r.span.new)}</Box> : null}
          </>
        ) : (
          <>
            {spanText(r.span.new ?? r.span.base)}
            <Typography
              variant='caption'
              color='text.secondary'
              component='div'
              sx={{ fontFamily: 'inherit' }}
            >
              No change
            </Typography>
          </>
        )}
      </TableCell>
      <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>
        {s.runningMax == null ? (
          <Box component='span' sx={{ color: 'text.secondary' }}>
            No change
          </Box>
        ) : (
          <b>{signed(s.runningMax)} max</b>
        )}
      </TableCell>
      <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>
        {s.changedTrips} of {s.totalTrips}
      </TableCell>
      <TableCell sx={{ ...cellSx, minWidth: 220 }}>{s.mainChange}</TableCell>
    </TableRow>
  );
}

/** Route + direction rows with rider-facing trip changes, by impact. */
export default function RouteChangesTable({
  changed,
  quiet,
  routes,
  stopNames,
  filters,
  onFiltersChange,
  onOpen,
  scope,
}: RouteChangesTableProps): React.ReactElement {
  const [showQuiet, setShowQuiet] = useState(false);
  const counts = useMemo(
    () => verdictCounts(changed, filters.search, routes),
    [changed, filters.search, routes],
  );
  const shownChanged = filterRouteRows(changed, filters, routes);
  // Quiet rows have no rider-facing verdict: only the search applies to them,
  // and only while no verdict is selected.
  const shownQuiet =
    filters.verdicts.length === 0
      ? filterRouteRows(quiet, { ...filters, verdicts: [] }, routes)
      : [];
  const rows = showQuiet ? [...shownChanged, ...shownQuiet] : shownChanged;
  const filtered = filters.verdicts.length > 0 || filters.search !== '';

  const toggle = (v: RouteVerdict): void =>
    onFiltersChange({
      ...filters,
      verdicts: filters.verdicts.includes(v)
        ? filters.verdicts.filter((x) => x !== v)
        : FILTER_VERDICTS.filter(
            (x) => x === v || filters.verdicts.includes(x),
          ),
    });

  return (
    <V2Card
      title='Routes with trip changes'
      scope={scope}
      caption='Sorted by impact. Filter by kind of change, then open a route to see when and how its trips changed.'
    >
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          alignItems: 'center',
          mb: 1.5,
        }}
      >
        {FILTER_VERDICTS.filter(
          (v) => counts[v] > 0 || filters.verdicts.includes(v),
        ).map((v) => {
          const active = filters.verdicts.includes(v);
          const color = VERDICT_COLORS[v];
          return (
            <Chip
              key={v}
              label={`${VERDICT_LABELS[v]} · ${counts[v].toLocaleString()}`}
              onClick={() => toggle(v)}
              aria-pressed={active}
              sx={{
                fontWeight: 700,
                border: `1px solid ${color}`,
                bgcolor: active ? color : 'transparent',
                color: active ? '#fff' : color,
                '&:hover': {
                  bgcolor: active ? color : 'transparent',
                  opacity: 0.85,
                },
                // Keep the state colours when focused (MUI greys it out).
                '&.Mui-focusVisible': {
                  bgcolor: active ? color : 'transparent',
                  outline: `2px solid ${color}`,
                  outlineOffset: 2,
                },
              }}
            />
          );
        })}
        <TextField
          size='small'
          placeholder='Search routes…'
          value={filters.search}
          onChange={(e) =>
            onFiltersChange({ ...filters, search: e.target.value })
          }
          sx={{ flex: '1 1 220px', minWidth: 200, maxWidth: 360, ml: 'auto' }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position='start'>
                  <Search fontSize='small' />
                </InputAdornment>
              ),
              endAdornment: filters.search ? (
                <InputAdornment position='end'>
                  <IconButton
                    size='small'
                    aria-label='Clear search'
                    onClick={() => onFiltersChange({ ...filters, search: '' })}
                  >
                    <Clear fontSize='small' />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
        {filtered ? (
          <Button
            size='small'
            onClick={() => onFiltersChange({ verdicts: [], search: '' })}
          >
            Clear filters
          </Button>
        ) : null}
      </Box>
      <TableContainer sx={{ maxHeight: 560 }}>
        <Table size='small' stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={headSx}>Route</TableCell>
              <TableCell sx={headSx}>Trips per day</TableCell>
              <TableCell sx={headSx}>Service span</TableCell>
              <TableCell sx={headSx}>Running time</TableCell>
              <TableCell sx={headSx}>Changed trips</TableCell>
              <TableCell sx={headSx}>Main change</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant='body2' color='text.secondary'>
                    {filtered
                      ? 'No route matches these filters on this day.'
                      : 'No route has trip changes on this day.'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((r) => (
              <Row
                key={r.key}
                r={r}
                route={routes[r.route]}
                stopNames={stopNames}
                onOpen={() => onOpen(r)}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {shownQuiet.length > 0 ? (
        <Box
          sx={{
            mt: 1.5,
            px: 1.5,
            py: 1,
            bgcolor: 'action.hover',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Typography variant='body2' color='text.secondary' sx={{ flex: 1 }}>
            {shownQuiet.length} other route
            {shownQuiet.length === 1 ? ' has' : 's have'} no trip changes on
            this day.
          </Typography>
          <Button size='small' onClick={() => setShowQuiet((v) => !v)}>
            {showQuiet ? 'Hide them' : 'Show them'}
          </Button>
        </Box>
      ) : null}
    </V2Card>
  );
}
