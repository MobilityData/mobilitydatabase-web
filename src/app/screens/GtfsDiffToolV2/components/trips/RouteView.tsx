'use client';

import {
  Box,
  Button,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import React, { useMemo, useState } from 'react';
import type { RouteInfo } from '../../lib/entity-diff-types';
import type { RouteDirDiff, TripPair } from '../../lib/trips-types';
import {
  TRIP_CLASSES,
  TRIP_CLASS_LABELS,
  directionLabel,
  inHourRange,
} from '../../lib/trips-utils';
import { useDiffNav } from '../../lib/diff-nav';
import ServiceProfile from './ServiceProfile';
import StopPatternDiagram from './StopPatternDiagram';
import TimetableView from './TimetableView';
import StringlineChart from './StringlineChart';
import { CountChange, TripRouteChip } from './shared';

type Detail = 'timetable' | 'stringline';

interface RouteViewProps {
  route: RouteDirDiff;
  info: RouteInfo | undefined;
  stopNames: Record<string, string>;
  onOpenTrip: (pair: TripPair) => void;
  onClose: () => void;
}

const cardSx = {
  bgcolor: 'background.paper',
  borderRadius: '6px',
  p: 2.5,
  mb: 2,
} as const;

/** Service profile → stop patterns → timetable / stringline, top to bottom. */
export default function RouteView({
  route,
  info,
  stopNames,
  onOpenTrip,
  onClose,
}: RouteViewProps): React.ReactElement {
  const nav = useDiffNav();
  const [range, setRange] = useState<[number, number] | null>(null);
  const [detail, setDetail] = useState<Detail>('timetable');
  const pairs = useMemo(
    () => route.pairs.filter((p) => inHourRange(p, range)),
    [route.pairs, range],
  );
  const counts = TRIP_CLASSES.map(
    (c) => [c, route.class_counts[c]] as const,
  ).filter(([c, n]) => n > 0 && c !== 'unchanged');

  return (
    <Box>
      <Box sx={cardSx}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            flexWrap: 'wrap',
            mb: 0.5,
          }}
        >
          <TripRouteChip routeId={route.route} route={info} />
          <Typography variant='h6' fontWeight={700}>
            {route.headsign || info?.long_name || route.route}
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            {directionLabel(route.dir)} ·{' '}
            <CountChange base={route.trips.base} next={route.trips.new} /> trips
          </Typography>
          <Box sx={{ flex: 1 }} />
          {nav && (
            <Button
              size='small'
              onClick={() =>
                nav.navigate({ tab: 'routes', kind: 'route', id: route.route })
              }
            >
              Open in Routes
            </Button>
          )}
          <IconButton size='small' aria-label='Close route' onClick={onClose}>
            <Close fontSize='small' />
          </IconButton>
        </Box>
        <Typography
          variant='caption'
          color='text.secondary'
          component='div'
          sx={{ mb: 2 }}
        >
          {counts.length === 0
            ? 'No trip-level changes on this day.'
            : counts
                .map(([c, n]) => `${n} ${TRIP_CLASS_LABELS[c].toLowerCase()}`)
                .join(' · ')}
          {route.minor_count > 0 && ` · ${route.minor_count} minor (dimmed)`}
        </Typography>
        <ServiceProfile route={route} range={range} onRangeChange={setRange} />
      </Box>

      <Box sx={cardSx}>
        <Typography variant='subtitle2' fontWeight={700} sx={{ mb: 1 }}>
          Stop patterns
        </Typography>
        <StopPatternDiagram
          route={route}
          pairs={pairs}
          stopNames={stopNames}
          onOpenTrip={onOpenTrip}
        />
      </Box>

      <Box sx={cardSx}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            mb: 1.5,
            flexWrap: 'wrap',
          }}
        >
          <Typography variant='subtitle2' fontWeight={700}>
            Trips
          </Typography>
          <ToggleButtonGroup
            size='small'
            exclusive
            value={detail}
            onChange={(_, v: Detail | null) => v && setDetail(v)}
          >
            <ToggleButton
              value='timetable'
              sx={{ py: 0.25, textTransform: 'none' }}
            >
              Timetable
            </ToggleButton>
            <ToggleButton
              value='stringline'
              sx={{ py: 0.25, textTransform: 'none' }}
            >
              Stringline
            </ToggleButton>
          </ToggleButtonGroup>
          <Typography variant='caption' color='text.secondary'>
            {pairs.length} trip{pairs.length === 1 ? '' : 's'}
            {range ? ' in the selected range' : ''} · click one for details
          </Typography>
        </Box>
        {detail === 'timetable' ? (
          <TimetableView
            route={route}
            pairs={pairs}
            stopNames={stopNames}
            onOpenTrip={onOpenTrip}
          />
        ) : (
          <StringlineChart
            route={route}
            pairs={pairs}
            stopNames={stopNames}
            range={range}
            onOpenTrip={onOpenTrip}
          />
        )}
      </Box>
    </Box>
  );
}
