'use client';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  FormControlLabel,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import React, { useMemo, useState } from 'react';
import type { EntityTypeDiff, RouteInfo } from '../../lib/entity-diff-types';
import type { DayDiff, TripPair } from '../../lib/trips-types';
import { TRIP_CLASS_LABELS, formatFrequency } from '../../lib/trips-utils';
import GenericEntityPanel from '../GenericEntityPanel';
import { MONO_FONT, TripRouteChip } from './shared';

const MAX_ROWS = 300;
const cellSx = { fontSize: '0.72rem', py: 0.5 } as const;
const monoSx = { ...cellSx, fontFamily: MONO_FONT } as const;

interface TechnicalDrilldownProps {
  day: DayDiff;
  routes: Record<string, RouteInfo>;
  entityTypes: EntityTypeDiff[];
  onOpenTrip: (pair: TripPair) => void;
}

/** Collapsed by default: the IDs and raw rows behind the rider-level view. */
export default function TechnicalDrilldown({
  day,
  routes,
  entityTypes,
  onOpenTrip,
}: TechnicalDrilldownProps): React.ReactElement {
  const [idChangesOnly, setIdChangesOnly] = useState(true);
  const all = useMemo(() => day.routes.flatMap((r) => r.pairs), [day]);
  const mapping = useMemo(
    () =>
      all.filter(
        (p) =>
          !idChangesOnly || p.base == null || p.new == null || p.id_changed,
      ),
    [all, idChangesOnly],
  );
  const freqTrips = all.filter((p) => p.base?.freq || p.new?.freq);
  const rawChanged = all.filter((p) => p.raw_changes.length > 0);
  const restructuredRoutes = day.routes.filter((r) =>
    r.verdicts.includes('restructured'),
  ).length;

  return (
    <Accordion disableGutters variant='outlined' sx={{ mb: 3 }}>
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Box>
          <Typography variant='subtitle2' fontWeight={700}>
            Technical drill-down
          </Typography>
          <Typography variant='caption' color='text.secondary'>
            {day.class_counts.restructured} restructured-only trip
            {day.class_counts.restructured === 1 ? '' : 's'} (
            {restructuredRoutes} route
            {restructuredRoutes === 1 ? '' : 's'} with nothing else) · trip_id
            mapping · raw stop_times fields · frequencies.txt · trips.txt rows
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant='body2' fontWeight={700} sx={{ mb: 0.5 }}>
          trip_id mapping for this day
        </Typography>
        <FormControlLabel
          control={
            <Switch
              size='small'
              checked={idChangesOnly}
              onChange={(e) => setIdChangesOnly(e.target.checked)}
            />
          }
          label={
            <Typography variant='caption'>
              Changed, added and removed trip_ids only
            </Typography>
          }
        />
        <Box sx={{ maxHeight: 360, overflowY: 'auto', mb: 2 }}>
          <Table size='small' stickyHeader>
            <TableHead>
              <TableRow>
                {[
                  'Route',
                  'Dir',
                  'Base trip_id',
                  'New trip_id',
                  'Service',
                  'Class',
                ].map((h) => (
                  <TableCell key={h} sx={{ ...cellSx, fontWeight: 700 }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {mapping.slice(0, MAX_ROWS).map((p) => (
                <TableRow
                  key={p.key}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => onOpenTrip(p)}
                >
                  <TableCell sx={cellSx}>
                    <TripRouteChip routeId={p.route} route={routes[p.route]} />
                  </TableCell>
                  <TableCell sx={monoSx}>{p.dir}</TableCell>
                  <TableCell sx={monoSx}>{p.base?.id ?? '∅'}</TableCell>
                  <TableCell sx={monoSx}>{p.new?.id ?? '∅'}</TableCell>
                  <TableCell sx={monoSx}>
                    {p.service_changed
                      ? `${p.base?.service} → ${p.new?.service}`
                      : (p.new ?? p.base)?.service}
                  </TableCell>
                  <TableCell sx={cellSx}>{TRIP_CLASS_LABELS[p.cls]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {mapping.length > MAX_ROWS && (
            <Typography variant='caption' color='text.secondary'>
              Showing the first {MAX_ROWS} of {mapping.length}.
            </Typography>
          )}
          {mapping.length === 0 && (
            <Typography variant='caption' color='text.secondary'>
              Every matched trip kept its trip_id.
            </Typography>
          )}
        </Box>

        <Typography variant='body2' fontWeight={700} sx={{ mb: 0.5 }}>
          Raw stop_times field changes
        </Typography>
        <Typography
          variant='caption'
          color='text.secondary'
          component='div'
          sx={{ mb: 2 }}
        >
          {rawChanged.length === 0
            ? 'No timepoint, shape_dist_traveled or stop_headsign changes on matched trips.'
            : `${rawChanged.length} matched trip${rawChanged.length === 1 ? '' : 's'} with timepoint, shape_dist_traveled or stop_headsign changes (${rawChanged.reduce((s, p) => s + p.raw_changes.length, 0)} fields). Open a trip for the per-stop list.`}
        </Typography>

        <Typography variant='body2' fontWeight={700} sx={{ mb: 0.5 }}>
          frequencies.txt
        </Typography>
        <Box sx={{ mb: 2 }}>
          {freqTrips.length === 0 ? (
            <Typography variant='caption' color='text.secondary'>
              No frequency-based trips on this day.
            </Typography>
          ) : (
            freqTrips.slice(0, MAX_ROWS).map((p) => (
              <Box
                key={p.key}
                sx={{ fontFamily: MONO_FONT, fontSize: '0.72rem' }}
              >
                {p.route} {(p.new ?? p.base)?.id}:{' '}
                {(p.base?.freq ?? []).map(formatFrequency).join('; ') || '∅'} →{' '}
                {(p.new?.freq ?? []).map(formatFrequency).join('; ') || '∅'}
              </Box>
            ))
          )}
        </Box>

        <Typography variant='body2' fontWeight={700} sx={{ mb: 1 }}>
          trips.txt rows (whole feed, not day-specific)
        </Typography>
        <GenericEntityPanel entityTypes={entityTypes} />
      </AccordionDetails>
    </Accordion>
  );
}
