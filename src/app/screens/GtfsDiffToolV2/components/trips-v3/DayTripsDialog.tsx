'use client';

import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { ChevronLeft, ChevronRight, Close } from '@mui/icons-material';
import React, { useMemo, useState } from 'react';
import { useRouter } from '../../../../../i18n/navigation';
import type { GtfsDate } from '../../lib/entity-diff-types';
import type { RouteDirDiff } from '../../lib/trips-types';
import {
  type TripsIndexDoc,
  isByRoute,
  routeDayCounts,
} from '../../lib/trips-shards';
import { anchorDates } from '../../lib/trips-anchor';
import {
  computeDayDiff,
  formatTime,
  servicesForDate,
} from '../../lib/trips-utils';
import { type TripsCalendarDoc, changeCounts } from '../../lib/trips-calendar';
import {
  routeHasRiderChanges,
  routeRowSummary,
  signed,
} from '../../lib/trips-v2-summary';
import { tripsRouteHref } from '../../lib/trips-v2-routes';
import { formatGtfsDate, formatGtfsDateLong } from '../../lib/calendar-utils';
import { useTripsDay } from '../../lib/useTripsDay';
import { CountChange, MONO_FONT, TripRouteChip } from '../trips/shared';
import DrilldownButton from './DrilldownButton';
import { ChangeTriplet } from './shared';

const headSx = {
  fontWeight: 700,
  fontSize: '0.72rem',
  whiteSpace: 'nowrap',
  color: 'text.secondary',
} as const;
const cellSx = { fontSize: '0.8rem', py: 0.75, verticalAlign: 'top' } as const;

interface DayTripsDialogProps {
  datasetId: string;
  /** Trips index (trips-diff.json); undefined while loading. */
  index: TripsIndexDoc | undefined;
  calendar: TripsCalendarDoc;
  /** Date opened; null when closed. */
  date: GtfsDate | null;
  onClose: () => void;
  onNavigate: (date: GtfsDate) => void;
}

function spanText(s: [number, number] | null): string {
  return s == null ? '—' : `${formatTime(s[0])}–${formatTime(s[1])}`;
}

/** The trips of one date, route by route; a route opens its page. */
export default function DayTripsDialog({
  datasetId,
  index,
  calendar,
  date,
  onClose,
  onNavigate,
}: DayTripsDialogProps): React.ReactElement {
  const router = useRouter();
  const [showQuiet, setShowQuiet] = useState(false);
  const entry = date ? calendar.days[date] : undefined;
  const key = entry?.key ?? null;
  const counts = entry ? calendar.counts[entry.s] : undefined;
  const byRoute = index != null && isByRoute(index);

  const loaded = useTripsDay(datasetId, index, key);
  const day = useMemo(
    () =>
      !byRoute && loaded.doc && loaded.date === key && key
        ? computeDayDiff(loaded.doc, key)
        : null,
    [byRoute, loaded.doc, loaded.date, key],
  );
  const routeCounts = useMemo(
    () =>
      byRoute && index && key
        ? routeDayCounts(index, servicesForDate(index, key))
        : null,
    [byRoute, index, key],
  );
  const changed = day?.routes.filter(routeHasRiderChanges) ?? [];
  const quiet = day?.routes.filter((r) => !routeHasRiderChanges(r)) ?? [];
  const rows = showQuiet ? [...changed, ...quiet] : changed;

  // Previous / next compared date.
  const dates = useMemo(() => Object.keys(calendar.days).sort(), [calendar]);
  const at = date ? dates.indexOf(date) : -1;
  const prev = at > 0 ? dates[at - 1] : null;
  const next = at >= 0 && at < dates.length - 1 ? dates[at + 1] : null;

  const pair = key ? anchorDates(key) : null;
  const openRoute = (route: string, dir?: string): void =>
    router.push(
      tripsRouteHref(datasetId, route, { day: key, dir, view: 'trips-v3' }),
    );
  const shortDay = date ? formatGtfsDate(date).replace(/ \d{4}$/, '') : '';

  return (
    <Dialog
      open={date != null}
      onClose={onClose}
      maxWidth='lg'
      fullWidth
      scroll='paper'
    >
      <DialogTitle
        sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}
      >
        <Tooltip title={prev ? formatGtfsDate(prev) : ''}>
          <span>
            <IconButton
              size='small'
              disabled={prev == null}
              onClick={() => prev && onNavigate(prev)}
              aria-label='Previous day'
            >
              <ChevronLeft />
            </IconButton>
          </span>
        </Tooltip>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant='h6' component='div' fontWeight={700}>
            {date ? formatGtfsDateLong(date) : ''}
          </Typography>
          {pair && pair.base !== pair.new ? (
            <Typography variant='caption' color='text.secondary'>
              vs {formatGtfsDate(pair.base)}
            </Typography>
          ) : null}
        </Box>
        <Tooltip title={next ? formatGtfsDate(next) : ''}>
          <span>
            <IconButton
              size='small'
              disabled={next == null}
              onClick={() => next && onNavigate(next)}
              aria-label='Next day'
            >
              <ChevronRight />
            </IconButton>
          </span>
        </Tooltip>
        {day ? (
          <DrilldownButton
            pairs={day.routes.flatMap((r) => r.pairs)}
            scope={shortDay}
            subject='Every route'
          />
        ) : null}
        <IconButton size='small' onClick={onClose} aria-label='Close'>
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
            mb: 2,
          }}
        >
          <ChangeTriplet counts={counts} size='1rem' />
          {counts ? (
            <Typography variant='body2' color='text.secondary'>
              Trips <CountChange base={counts.base} next={counts.new} />
            </Typography>
          ) : null}
        </Box>
        {loaded.error ? (
          <Alert severity='error'>{loaded.error.message}</Alert>
        ) : null}
        {routeCounts ? (
          <RouteCountsTable
            rows={routeCounts}
            index={index as TripsIndexDoc}
            onOpen={(r) => openRoute(r)}
          />
        ) : day == null ? (
          <LinearProgress />
        ) : (
          <>
            <Table size='small' stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={headSx}>Route</TableCell>
                  <TableCell sx={headSx}>Changes</TableCell>
                  <TableCell sx={headSx}>Trips</TableCell>
                  <TableCell sx={headSx}>Service span</TableCell>
                  <TableCell sx={headSx}>Running time</TableCell>
                  <TableCell sx={headSx}>Main change</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <RouteRow
                    key={r.key}
                    r={r}
                    index={index as TripsIndexDoc}
                    onOpen={() => openRoute(r.route, r.dir)}
                  />
                ))}
              </TableBody>
            </Table>
            {quiet.length > 0 ? (
              <Button
                size='small'
                onClick={() => setShowQuiet((v) => !v)}
                sx={{ mt: 1, textTransform: 'none' }}
              >
                {showQuiet
                  ? 'Hide routes without changes'
                  : `Show ${quiet.length} route${quiet.length === 1 ? '' : 's'} without changes`}
              </Button>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RouteRow({
  r,
  index,
  onOpen,
}: {
  r: RouteDirDiff;
  index: TripsIndexDoc;
  onOpen: () => void;
}): React.ReactElement {
  const info = index.routes[r.route];
  const s = routeRowSummary(r, index.stops);
  return (
    <TableRow hover onClick={onOpen} sx={{ cursor: 'pointer' }}>
      <TableCell sx={cellSx}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <TripRouteChip routeId={r.route} route={info} />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant='body2'
              fontWeight={700}
              sx={{ fontSize: '0.8rem' }}
            >
              {r.headsign || info?.long_name || r.route}
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
      <TableCell sx={cellSx}>
        <ChangeTriplet counts={changeCounts(r.class_counts, r.trips)} />
      </TableCell>
      <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>
        <CountChange base={r.trips.base} next={r.trips.new} />
      </TableCell>
      <TableCell
        sx={{ ...cellSx, fontFamily: MONO_FONT, whiteSpace: 'nowrap' }}
      >
        {spanText(r.span.new ?? r.span.base)}
      </TableCell>
      <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>
        {s.runningMax == null ? '—' : signed(s.runningMax)}
      </TableCell>
      <TableCell sx={{ ...cellSx, minWidth: 220 }}>{s.mainChange}</TableCell>
    </TableRow>
  );
}

/** Feeds too large to compare a day in the browser: trips per route. */
function RouteCountsTable({
  rows,
  index,
  onOpen,
}: {
  rows: Array<{ route: string; base: number; new: number }>;
  index: TripsIndexDoc;
  onOpen: (route: string) => void;
}): React.ReactElement {
  const [limit, setLimit] = useState(50);
  return (
    <>
      <Table size='small' stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={headSx}>Route</TableCell>
            <TableCell sx={headSx}>Trips</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.slice(0, limit).map((r) => (
            <TableRow
              key={r.route}
              hover
              onClick={() => onOpen(r.route)}
              sx={{ cursor: 'pointer' }}
            >
              <TableCell sx={cellSx}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TripRouteChip
                    routeId={r.route}
                    route={index.routes[r.route]}
                  />
                  <Typography
                    variant='body2'
                    noWrap
                    sx={{ fontSize: '0.8rem' }}
                  >
                    {index.routes[r.route]?.long_name || r.route}
                  </Typography>
                </Box>
              </TableCell>
              <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>
                <CountChange base={r.base} next={r.new} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > limit ? (
        <Button
          size='small'
          onClick={() => setLimit((l) => l + 50)}
          sx={{ mt: 1, textTransform: 'none' }}
        >
          Show {Math.min(50, rows.length - limit)} more
        </Button>
      ) : null}
    </>
  );
}
