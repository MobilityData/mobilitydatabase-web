'use client';

import {
  Autocomplete,
  Box,
  Chip,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import React, { useMemo, useState } from 'react';
import type { RouteInfo } from '../../lib/entity-diff-types';
import type { DayDiff, TripPair } from '../../lib/trips-types';
import {
  type BoardEntry,
  type BoardStatus,
  QUIET_CLASSES,
  boardStops,
  stopBoard,
} from '../../lib/trips-utils';
import { TimeText, TripRouteChip } from './shared';

const STATUS_TEXT: Partial<Record<BoardStatus, string>> = {
  added: 'added',
  removed: 'removed',
  now_stops: 'now stops here',
  no_longer_stops: 'no longer stops here',
};

const STATUS_COLOR: Partial<Record<BoardStatus, string>> = {
  added: '#2e7d32',
  now_stops: '#2e7d32',
  removed: '#d32f2f',
  no_longer_stops: '#d32f2f',
  retimed: '#ed6c02',
};

interface StopBoardProps {
  day: DayDiff;
  stopId: string | null;
  onStopChange: (id: string | null) => void;
  stopNames: Record<string, string>;
  routes: Record<string, RouteInfo>;
  minorThreshold: number;
  onOpenTrip: (pair: TripPair) => void;
}

/**
 * The rider lens: one stop's departures for the selected day, old vs new,
 * grouped by hour ("07:05 → 07:08", "07:20 removed").
 */
export default function StopBoard({
  day,
  stopId,
  onStopChange,
  stopNames,
  routes,
  minorThreshold,
  onOpenTrip,
}: StopBoardProps): React.ReactElement {
  const [changesOnly, setChangesOnly] = useState(false);

  const options = useMemo(() => {
    const ids = boardStops(day);
    return ids.sort((a, b) =>
      (stopNames[a] ?? a).localeCompare(stopNames[b] ?? b),
    );
  }, [day, stopNames]);

  // Stops touched by the most changed trips, as quick picks.
  const suggestions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of day.routes)
      for (const p of r.pairs) {
        if (QUIET_CLASSES.has(p.cls) || p.minor) continue;
        const seen = new Set([
          ...(p.base?.stops ?? []),
          ...(p.new?.stops ?? []),
        ]);
        for (const s of seen) counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([s]) => s);
  }, [day]);

  const entries = useMemo(
    () => (stopId ? stopBoard(day, stopId, minorThreshold) : []),
    [day, stopId, minorThreshold],
  );
  const shown = changesOnly
    ? entries.filter((e) => e.status !== 'unchanged' && e.status !== 'minor')
    : entries;
  const byHour = new Map<number, BoardEntry[]>();
  for (const e of shown) {
    const h = Math.floor(e.time / 3600);
    const list = byHour.get(h);
    if (list) list.push(e);
    else byHour.set(h, [e]);
  }
  const changed = entries.filter(
    (e) => e.status !== 'unchanged' && e.status !== 'minor',
  ).length;

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          flexWrap: 'wrap',
          mb: 1.5,
        }}
      >
        <Autocomplete
          size='small'
          options={options}
          value={stopId}
          onChange={(_, v) => onStopChange(v)}
          getOptionLabel={(id) => `${stopNames[id] ?? id} (${id})`}
          renderInput={(params) => (
            <TextField {...params} label='Stop' placeholder='Search a stop' />
          )}
          sx={{ width: 360 }}
        />
        <FormControlLabel
          control={
            <Switch
              size='small'
              checked={changesOnly}
              onChange={(e) => setChangesOnly(e.target.checked)}
            />
          }
          label={<Typography variant='body2'>Changes only</Typography>}
        />
        {stopId && (
          <Typography variant='caption' color='text.secondary'>
            {entries.length} departures · {changed} changed
          </Typography>
        )}
      </Box>
      {suggestions.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            gap: 0.75,
            flexWrap: 'wrap',
            mb: 2,
            alignItems: 'center',
          }}
        >
          <Typography variant='caption' color='text.secondary'>
            Most affected:
          </Typography>
          {suggestions.map((s) => (
            <Chip
              key={s}
              size='small'
              label={
                suggestions.some(
                  (o) => o !== s && stopNames[o] === stopNames[s],
                )
                  ? `${stopNames[s]} (${s})`
                  : (stopNames[s] ?? s)
              }
              variant={s === stopId ? 'filled' : 'outlined'}
              color={s === stopId ? 'primary' : 'default'}
              onClick={() => onStopChange(s)}
            />
          ))}
        </Box>
      )}

      {!stopId ? (
        <Typography variant='body2' color='text.secondary'>
          Pick a stop to see what changes there on this day.
        </Typography>
      ) : shown.length === 0 ? (
        <Typography variant='body2' color='text.secondary'>
          {changesOnly
            ? 'No changed departures at this stop.'
            : 'No departures at this stop on this day.'}
        </Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: 2,
          }}
        >
          {[...byHour.entries()].map(([h, list]) => (
            <Box key={h} sx={{ breakInside: 'avoid' }}>
              <Typography
                variant='caption'
                fontWeight={700}
                color='text.secondary'
                component='div'
                sx={{
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  mb: 0.5,
                }}
              >
                {String(h % 24).padStart(2, '0')}:00
              </Typography>
              {list.map((e, i) => (
                <BoardRow
                  key={`${e.pair.key}-${i}`}
                  e={e}
                  route={routes[e.pair.route]}
                  onClick={() => onOpenTrip(e.pair)}
                />
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function BoardRow({
  e,
  route,
  onClick,
}: {
  e: BoardEntry;
  route: RouteInfo | undefined;
  onClick: () => void;
}): React.ReactElement {
  const color = STATUS_COLOR[e.status];
  const struck = e.status === 'removed' || e.status === 'no_longer_stops';
  const trip = e.pair.new ?? e.pair.base;
  return (
    <Box
      role='button'
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 0.25,
        px: 0.5,
        borderRadius: '4px',
        cursor: 'pointer',
        opacity: e.status === 'minor' ? 0.6 : 1,
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Box sx={{ width: 120, flexShrink: 0, fontSize: '0.85rem', color }}>
        {e.status === 'retimed' || e.status === 'minor' ? (
          <>
            <Box component='span' sx={{ color: 'text.secondary' }}>
              <TimeText sec={e.base} strike />
            </Box>
            {' → '}
            <b>
              <TimeText sec={e.new} />
            </b>
          </>
        ) : (
          <TimeText sec={e.new ?? e.base} strike={struck} />
        )}
      </Box>
      <TripRouteChip routeId={e.pair.route} route={route} />
      <Typography
        variant='body2'
        noWrap
        sx={{ flex: 1, minWidth: 0, fontSize: '0.8rem' }}
      >
        {trip?.headsign}
      </Typography>
      {STATUS_TEXT[e.status] && (
        <Typography
          variant='caption'
          sx={{ color, fontWeight: 700, whiteSpace: 'nowrap' }}
        >
          {STATUS_TEXT[e.status]}
        </Typography>
      )}
    </Box>
  );
}
