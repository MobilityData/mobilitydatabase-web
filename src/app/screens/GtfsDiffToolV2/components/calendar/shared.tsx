'use client';

import { Box, Chip, Tooltip, Typography } from '@mui/material';
import React from 'react';
import type {
  DiffType,
  GtfsDate,
  RouteInfo,
} from '../../lib/entity-diff-types';
import {
  CHANGE_KINDS,
  CHANGE_LABELS,
  type DayCounts,
  countsTotal,
  formatGtfsDate,
} from '../../lib/calendar-utils';
import { useDiffNav } from '../../lib/diff-nav';
import { routePreview } from '../../lib/service-detail';
import { useCalendarPalette } from '../trips-v5/palette';

export const MONO_FONT = 'var(--font-ibm-plex-mono)';

// ── Day tooltip ────────────────────────────────────────────────────

/** Tooltip of a calendar day: its date, active services and changes. */
export function ServiceDayTip({
  date,
  day,
  active: [base, next],
}: {
  date: GtfsDate;
  day: DayCounts | undefined;
  active: [number, number];
}): React.ReactElement {
  const total = countsTotal(day);
  return (
    <Box sx={{ py: 0.25 }}>
      <Typography variant='caption' fontWeight={700} component='div'>
        {formatGtfsDate(date)}
      </Typography>
      <Typography variant='caption' component='div'>
        {base + next === 0
          ? 'No service in either feed'
          : base === next
            ? `${next} active service${next === 1 ? '' : 's'}`
            : `${base} → ${next} active services`}
      </Typography>
      {day && total > 0 ? (
        <Typography variant='caption' component='div'>
          {CHANGE_KINDS.filter((k) => day[k] > 0)
            .map((k) => `${day[k]} ${CHANGE_LABELS[k].toLowerCase()}`)
            .join(' · ')}
          . Click for details.
        </Typography>
      ) : null}
    </Box>
  );
}

// ── Route chip ─────────────────────────────────────────────────────

interface RouteChipProps {
  routeId: string;
  route: RouteInfo | undefined;
  /** Link to the Routes tab when rendered inside the v2 page (default true). */
  linked?: boolean;
}

export function RouteChip({
  routeId,
  route,
  linked = true,
}: RouteChipProps): React.ReactElement {
  const nav = useDiffNav();
  const bg = route?.color ? `#${route.color}` : undefined;
  const fg = route?.text_color ? `#${route.text_color}` : undefined;
  const label = route?.short_name || routeId;
  const name = route
    ? `${route.short_name} ${route.long_name}`.trim()
    : routeId;
  const onClick =
    linked && nav
      ? (e: React.MouseEvent) => {
          e.stopPropagation();
          nav.navigate({ tab: 'routes', kind: 'route', id: routeId });
        }
      : undefined;
  return (
    <Tooltip title={onClick ? `${name} — open in Routes` : name}>
      <Chip
        label={label}
        size='small'
        onClick={onClick}
        sx={{
          height: 20,
          fontSize: '0.68rem',
          fontWeight: 700,
          bgcolor: bg,
          color: fg,
          '&:hover': bg
            ? { bgcolor: bg, filter: 'brightness(1.15)' }
            : undefined,
          textDecoration:
            route?.presence === 'base' ? 'line-through' : undefined,
        }}
      />
    </Tooltip>
  );
}

export function RouteChips({
  routeIds,
  routes,
}: {
  routeIds: string[];
  routes: Record<string, RouteInfo>;
}): React.ReactElement {
  return (
    <Box sx={{ display: 'inline-flex', gap: 0.5, flexWrap: 'wrap' }}>
      {routeIds.length === 0 ? (
        <Typography variant='caption' color='text.secondary'>
          No trips
        </Typography>
      ) : (
        routeIds.map((r) => <RouteChip key={r} routeId={r} route={routes[r]} />)
      )}
    </Box>
  );
}

// ── Services ───────────────────────────────────────────────────────

/** The change colour of a service's status (unchanged: none). */
export function statusColor(
  change: Record<'added' | 'removed' | 'modified', string>,
  status: DiffType,
): string | null {
  if (status === 'added') return change.added;
  if (status === 'deleted') return change.removed;
  if (status === 'modified') return change.modified;
  return null;
}

export const STATUS_LABELS: Record<DiffType, string> = {
  added: 'Added',
  deleted: 'Removed',
  modified: 'Modified',
  unchanged: 'Unchanged',
};

/** Round dot in a service's status colour; unchanged is hollow. */
export function StatusDot({
  status,
  size = 10,
}: {
  status: DiffType;
  size?: number;
}): React.ReactElement {
  const color = statusColor(useCalendarPalette().change, status);
  return (
    <Box
      component='span'
      aria-hidden
      sx={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        boxSizing: 'border-box',
        ...(color
          ? { bgcolor: color }
          : { border: '1.5px solid', borderColor: 'text.disabled' }),
      }}
    />
  );
}

/** A row's routes: the first few as chips, then "and +N". */
export function RoutePreviewChips({
  routeIds,
  routes,
}: {
  routeIds: string[];
  routes: Record<string, RouteInfo>;
}): React.ReactElement {
  const { shown, more } = routePreview(routeIds);
  if (routeIds.length === 0)
    return (
      <Typography variant='caption' color='text.secondary'>
        No trips
      </Typography>
    );
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        flexWrap: 'wrap',
      }}
    >
      {shown.map((r) => (
        <RouteChip key={r} routeId={r} route={routes[r]} linked={false} />
      ))}
      {more > 0 ? (
        <Typography
          variant='caption'
          color='text.secondary'
          sx={{ whiteSpace: 'nowrap' }}
        >
          and +{more}
        </Typography>
      ) : null}
    </Box>
  );
}
