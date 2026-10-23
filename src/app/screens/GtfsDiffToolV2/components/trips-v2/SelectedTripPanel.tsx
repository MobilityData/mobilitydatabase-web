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
import { RAW_ACTIONS } from '../../lib/raw-diff-query';
import type { TripPair } from '../../lib/trips-types';
import { formatTime, matchProvenance } from '../../lib/trips-utils';
import {
  isWeakMatch,
  tripBadge,
  tripExplanation,
  tripStopRows,
} from '../../lib/trips-v2-summary';
import RawDiffTable from '../raw/RawDiffTable';
import { MONO_FONT, TimeText } from '../trips/shared';
import {
  ADDED_BG,
  CHANGED_BG,
  REMOVED_BG,
  TripBadge,
  pairTone,
} from './shared';

const cellSx = { fontSize: '0.8rem', py: 0.6 } as const;

interface SelectedTripPanelProps {
  pair: TripPair;
  stopNames: Record<string, string>;
  /** Opens the full trip drawer (segments, rules, raw fields). */
  onOpenDetails: () => void;
  /** Set when the dataset has a stop_times Parquet table to query. */
  rawDatasetId: string | null;
}

/** The trip picked in the timetable: what changed, stop by stop. */
export default function SelectedTripPanel({
  pair,
  stopNames,
  onOpenDetails,
  rawDatasetId,
}: SelectedTripPanelProps): React.ReactElement {
  const [showRaw, setShowRaw] = useState(false);
  const name = (id: string): string => stopNames[id] ?? id;
  const trip = pair.new ?? pair.base;
  const tone = pairTone(pair);
  const badge = tripBadge(pair);
  const rows = tripStopRows(pair);
  const banner =
    tone === 'added'
      ? { bg: ADDED_BG }
      : tone === 'removed'
        ? { bg: REMOVED_BG }
        : tone === 'changed'
          ? { bg: CHANGED_BG }
          : { bg: 'action.hover' };

  return (
    <Box
      sx={{
        mt: 2.5,
        p: { xs: 1.5, sm: 2 },
        borderRadius: '6px',
        bgcolor: 'action.hover',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant='caption' color='text.secondary'>
            Selected trip
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant='h6' fontWeight={700}>
              {trip ? name(trip.stops[0]) : '—'},{' '}
              {formatTime(pair.new_time ?? pair.base_time)}
            </Typography>
            {badge ? <TripBadge label={badge} tone={tone} /> : null}
            {isWeakMatch(pair) ? (
              <TripBadge label='Matched only by trip_id' tone='quiet' />
            ) : null}
          </Box>
        </Box>
        <Button size='small' variant='outlined' onClick={onOpenDetails}>
          All trip details
        </Button>
      </Box>

      <Box
        sx={{
          px: 1.5,
          py: 1,
          mb: 2,
          borderRadius: '4px',
          bgcolor: banner.bg,
        }}
      >
        <Typography variant='body2'>
          {tripExplanation(pair, stopNames)}
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'minmax(0, 3fr) minmax(0, 2fr)',
          },
          gap: 2,
        }}
      >
        <Box
          sx={{
            bgcolor: 'background.paper',
            borderRadius: '6px',
            maxHeight: 420,
            overflowY: 'auto',
          }}
        >
          <Table size='small' stickyHeader>
            <TableHead>
              <TableRow>
                {['Stop', 'Before', 'After', 'Change'].map((h) => (
                  <TableCell key={h} sx={{ ...cellSx, fontWeight: 700 }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow
                  key={`${r.stopId}-${i}`}
                  sx={{ bgcolor: r.changed ? CHANGED_BG : undefined }}
                >
                  <TableCell sx={cellSx} title={r.stopId}>
                    {name(r.stopId)}
                  </TableCell>
                  <TableCell sx={{ ...cellSx, fontFamily: MONO_FONT }}>
                    <TimeText sec={r.before} />
                  </TableCell>
                  <TableCell sx={{ ...cellSx, fontFamily: MONO_FONT }}>
                    <TimeText sec={r.after} />
                  </TableCell>
                  <TableCell
                    sx={{
                      ...cellSx,
                      fontWeight: r.changed ? 700 : 400,
                      color: r.changed ? 'text.primary' : 'text.secondary',
                    }}
                  >
                    {r.change}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <InfoBox title='How this trip was matched'>
            {matchProvenance(pair)}
          </InfoBox>
          <InfoBox title='Trip attributes'>
            <TripAttributes pair={pair} />
          </InfoBox>
        </Box>
      </Box>

      {rawDatasetId != null && trip != null ? (
        <Box sx={{ mt: 2 }}>
          <Button
            size='small'
            onClick={() => setShowRaw((v) => !v)}
            sx={{ textTransform: 'none' }}
          >
            {showRaw
              ? 'Hide the raw stop_times.txt rows'
              : 'Show this trip’s raw stop_times.txt rows'}
          </Button>
          {showRaw ? (
            <Box
              sx={{
                mt: 1,
                bgcolor: 'background.paper',
                borderRadius: '6px',
                p: 1.5,
              }}
            >
              <RawDiffTable
                // A new trip needs new initial filters.
                key={pair.key}
                datasetId={rawDatasetId}
                file='stop_times.txt'
                // The trip_id filter matches the base or the new id.
                initialFilters={{ actions: RAW_ACTIONS, tripId: trip.id }}
              />
            </Box>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}

function InfoBox({
  title,
  children,
}: React.PropsWithChildren<{ title: string }>): React.ReactElement {
  return (
    <Box
      sx={{
        p: 1.5,
        bgcolor: 'background.paper',
        borderRadius: '6px',
      }}
    >
      <Typography variant='body2' fontWeight={700} sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      <Typography variant='body2' component='div' color='text.secondary'>
        {children}
      </Typography>
    </Box>
  );
}

function TripAttributes({ pair }: { pair: TripPair }): React.ReactElement {
  const trip = pair.new ?? pair.base;
  if (!trip) return <>—</>;
  const attrs = [
    ['trip_headsign', trip.headsign],
    ...Object.entries(trip.attrs),
  ].filter(([, v]) => v !== '');
  return (
    <>
      <Box component='span' sx={{ fontFamily: MONO_FONT, fontSize: '0.75rem' }}>
        {attrs.map(([k, v]) => `${k} "${v}"`).join(', ') || 'No attributes set'}
        .
      </Box>{' '}
      {pair.attr_changes.length === 0 ? (
        'No attribute changes.'
      ) : (
        <Box component='ul' sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
          {pair.attr_changes.map((c) => (
            <li key={c.field}>
              <Box component='span' sx={{ fontFamily: MONO_FONT }}>
                {c.field}
              </Box>
              : {c.base_value || '∅'} → <b>{c.new_value || '∅'}</b>
            </li>
          ))}
        </Box>
      )}
    </>
  );
}
