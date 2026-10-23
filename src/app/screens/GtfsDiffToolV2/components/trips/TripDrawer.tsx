'use client';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Drawer,
  IconButton,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Close, ExpandMore } from '@mui/icons-material';
import React from 'react';
import type { RouteInfo } from '../../lib/entity-diff-types';
import type {
  CompactTrip,
  StopAlignment,
  TripPair,
} from '../../lib/trips-types';
import {
  arrAt,
  depAt,
  directionLabel,
  formatDelta,
  formatFrequency,
  matchProvenance,
  ruleChangeText,
  segmentsText,
} from '../../lib/trips-utils';
import { useDiffNav } from '../../lib/diff-nav';
import {
  ClassChip,
  MONO_FONT,
  PairTimes,
  TimeText,
  TripRouteChip,
} from './shared';

const ADDED_BG = 'rgba(46, 125, 50, 0.10)';
const REMOVED_BG = 'rgba(211, 47, 47, 0.08)';

interface TripDrawerProps {
  pair: TripPair | null;
  route: RouteInfo | undefined;
  stopNames: Record<string, string>;
  onClose: () => void;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant='subtitle2' fontWeight={700} sx={{ mb: 0.75 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function timeOf(t: CompactTrip | null, i: number | null): number | null {
  return t == null || i == null ? null : depAt(t, i);
}

/** Removed + added stop pairs that share a name: the stop_id was swapped. */
function swappedNames(
  align: StopAlignment[],
  names: Record<string, string>,
): Set<string> {
  const removed = new Set(
    align.filter((o) => o.op === 'remove').map((o) => names[o.stop_id]),
  );
  return new Set(
    align
      .filter((o) => o.op === 'add' && removed.has(names[o.stop_id]))
      .map((o) => names[o.stop_id]),
  );
}

export default function TripDrawer({
  pair,
  route,
  stopNames,
  onClose,
}: TripDrawerProps): React.ReactElement {
  return (
    <Drawer
      anchor='right'
      open={pair != null}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100vw', sm: 540 }, p: 2.5 } } }}
    >
      {pair && (
        <TripDetails
          pair={pair}
          route={route}
          stopNames={stopNames}
          onClose={onClose}
        />
      )}
    </Drawer>
  );
}

function TripDetails({
  pair,
  route,
  stopNames,
  onClose,
}: {
  pair: TripPair;
  route: RouteInfo | undefined;
  stopNames: Record<string, string>;
  onClose: () => void;
}): React.ReactElement {
  const nav = useDiffNav();
  const name = (id: string): string => stopNames[id] ?? id;
  const b = pair.base;
  const n = pair.new;
  const trip = n ?? b;
  const segmentAfter = new Map(pair.segments.map((s) => [s.to, s]));
  const swapped = swappedNames(pair.align, stopNames);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <TripRouteChip routeId={pair.route} route={route} />
            <Typography variant='body2' color='text.secondary'>
              {trip?.headsign || route?.long_name} · {directionLabel(pair.dir)}
            </Typography>
          </Box>
          <Typography variant='h6' fontWeight={700}>
            <PairTimes pair={pair} />
          </Typography>
        </Box>
        <IconButton aria-label='Close' onClick={onClose} size='small'>
          <Close />
        </IconButton>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
        <ClassChip cls={pair.cls} minor={pair.minor} />
        {pair.flags.map((f) => (
          <ClassChip key={f} cls={f} />
        ))}
        {pair.shift != null && pair.shift !== 0 && (
          <Typography variant='body2' fontWeight={700} sx={{ ml: 0.5 }}>
            {formatDelta(pair.shift)} at every stop
          </Typography>
        )}
      </Box>
      <Alert
        severity='info'
        icon={false}
        sx={{ mb: 2, py: 0, fontSize: '0.8rem' }}
      >
        {matchProvenance(pair)}
      </Alert>

      <Section title='Stops'>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Stop</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Base</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>New</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Δ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pair.align.map((o, i) => {
              const bt = timeOf(b, o.bi);
              const nt = timeOf(n, o.ni);
              const seg =
                o.op === 'keep' ? segmentAfter.get(o.stop_id) : undefined;
              const delta = bt != null && nt != null ? nt - bt : null;
              const isAdded = o.op === 'add' && b != null;
              const isRemoved = o.op === 'remove' && n != null;
              return (
                <React.Fragment key={`${o.stop_id}-${i}`}>
                  {seg && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        sx={{
                          py: 0,
                          fontSize: '0.7rem',
                          color: '#ed6c02',
                          borderBottom: 'none',
                        }}
                      >
                        ↕ segment running time {segmentsText(seg)}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow
                    sx={{
                      bgcolor: isAdded
                        ? ADDED_BG
                        : isRemoved
                          ? REMOVED_BG
                          : undefined,
                    }}
                  >
                    <TableCell
                      sx={{
                        fontSize: '0.78rem',
                        textDecoration: isRemoved ? 'line-through' : undefined,
                        color: isAdded
                          ? '#2e7d32'
                          : isRemoved
                            ? '#d32f2f'
                            : undefined,
                      }}
                    >
                      {name(o.stop_id)}
                      <Box
                        component='span'
                        sx={{
                          ml: 0.75,
                          fontFamily: MONO_FONT,
                          fontSize: '0.65rem',
                          color: 'text.secondary',
                        }}
                      >
                        {o.stop_id}
                      </Box>
                      {(isAdded || isRemoved) &&
                        swapped.has(name(o.stop_id)) && (
                          <Box
                            component='div'
                            sx={{
                              fontSize: '0.65rem',
                              color: 'text.secondary',
                              textDecoration: 'none',
                            }}
                          >
                            stop_id swapped, same stop name
                          </Box>
                        )}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>
                      {o.bi != null && b ? (
                        <TimeText sec={bt} strike={isRemoved} />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>
                      {o.ni != null && n ? <TimeText sec={nt} /> : '—'}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: delta
                          ? delta > 0
                            ? '#ed6c02'
                            : '#1565c0'
                          : 'text.disabled',
                      }}
                    >
                      {/* A uniform shift is stated once, in the header. */}
                      {delta == null || pair.shift != null
                        ? ''
                        : delta === 0
                          ? '·'
                          : formatDelta(delta)}
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Section>

      {pair.rules.length > 0 && (
        <Section title='Pickup and drop-off'>
          {pair.rules.map((r) => (
            <Typography
              key={`${r.stop_id}-${r.kind}`}
              variant='body2'
              sx={{ mb: 0.25 }}
            >
              • {ruleChangeText(r, name(r.stop_id))}
            </Typography>
          ))}
        </Section>
      )}

      {pair.attr_changes.length > 0 && (
        <Section title='Attributes'>
          {pair.attr_changes.map((c) => (
            <Box key={c.field} sx={{ fontSize: '0.8rem', mb: 0.5 }}>
              <Box component='span' sx={{ color: 'text.secondary' }}>
                {c.field}:{' '}
              </Box>
              <Box
                component='span'
                sx={{ color: '#d32f2f', fontFamily: MONO_FONT }}
              >
                {c.base_value || '∅'}
              </Box>
              {' → '}
              <Box
                component='span'
                sx={{ color: '#2e7d32', fontFamily: MONO_FONT }}
              >
                {c.new_value || '∅'}
              </Box>
              {c.field === 'shape_id' && nav && (
                <Link
                  component='button'
                  type='button'
                  sx={{ ml: 1, fontSize: '0.75rem', verticalAlign: 'baseline' }}
                  onClick={() =>
                    nav.navigate({
                      tab: 'routes',
                      kind: 'shape',
                      id: c.new_value || c.base_value,
                    })
                  }
                >
                  Open shape in Routes
                </Link>
              )}
            </Box>
          ))}
        </Section>
      )}

      <Accordion disableGutters variant='outlined' sx={{ mt: 1 }}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant='body2' fontWeight={700}>
            Technical details
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant='caption' fontWeight={700} component='div'>
            trip_id mapping
          </Typography>
          <Box sx={{ fontFamily: MONO_FONT, fontSize: '0.75rem', mb: 1.5 }}>
            {b?.id ?? '∅'} ({b?.service ?? '—'}) → {n?.id ?? '∅'} (
            {n?.service ?? '—'})
            {/* Identifier attributes: renumbered, not a service change. */}
            {pair.id_attr_changes.map((c) => (
              <Box key={c.field}>
                {c.field}: {c.base_value || '∅'} → {c.new_value || '∅'}
              </Box>
            ))}
          </Box>
          <Typography variant='caption' fontWeight={700} component='div'>
            Raw stop_times field changes
          </Typography>
          {pair.raw_changes.length === 0 ? (
            <Typography
              variant='caption'
              color='text.secondary'
              component='div'
              sx={{ mb: 1.5 }}
            >
              None on stops served by both trips.
            </Typography>
          ) : (
            <Box sx={{ mb: 1.5 }}>
              {pair.raw_changes.map((c, i) => (
                <Box
                  key={i}
                  sx={{ fontFamily: MONO_FONT, fontSize: '0.72rem' }}
                >
                  {c.stop_id} {c.field}: {c.base || '∅'} → {c.new || '∅'}
                </Box>
              ))}
            </Box>
          )}
          <Typography variant='caption' fontWeight={700} component='div'>
            Arrival / departure
          </Typography>
          <Box sx={{ fontFamily: MONO_FONT, fontSize: '0.72rem', mb: 1.5 }}>
            {pair.align.map((o, i) => {
              const fmt = (
                t: CompactTrip | null,
                idx: number | null,
              ): string =>
                t && idx != null
                  ? `${formatRaw(arrAt(t, idx))}/${formatRaw(depAt(t, idx))}`
                  : '—';
              return (
                <Box key={i}>
                  {o.stop_id}: {fmt(b, o.bi)} → {fmt(n, o.ni)}
                </Box>
              );
            })}
          </Box>
          <Typography variant='caption' fontWeight={700} component='div'>
            frequencies.txt
          </Typography>
          <Box sx={{ fontFamily: MONO_FONT, fontSize: '0.72rem' }}>
            {(b?.freq ?? []).length + (n?.freq ?? []).length === 0
              ? 'Not frequency-based.'
              : `${(b?.freq ?? []).map(formatFrequency).join('; ') || '∅'} → ${(n?.freq ?? []).map(formatFrequency).join('; ') || '∅'}`}
          </Box>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}

function formatRaw(sec: number | null): string {
  if (sec == null) return '∅';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}
