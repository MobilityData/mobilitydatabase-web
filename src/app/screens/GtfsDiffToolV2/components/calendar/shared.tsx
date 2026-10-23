'use client';

import { Box, Chip, Link, Tooltip, Typography } from '@mui/material';
import React from 'react';
import type { RouteInfo } from '../../lib/entity-diff-types';
import {
  CHANGE_COLORS,
  CHANGE_KINDS,
  CHANGE_LABELS,
  type DayCounts,
} from '../../lib/calendar-utils';
import { useDiffNav } from '../../lib/diff-nav';

export const MONO_FONT = 'var(--font-ibm-plex-mono)';

// ── Change count squares (green / red / orange) ────────────────────

interface ChangeSquaresProps {
  day: DayCounts | undefined;
  size?: number;
}

export function ChangeSquares({
  day,
  size = 22,
}: ChangeSquaresProps): React.ReactElement | null {
  if (day == null) return null;
  const counts = day;
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {CHANGE_KINDS.filter((k) => counts[k] > 0).map((k) => (
        <Tooltip
          key={k}
          title={`${counts[k]} ${CHANGE_LABELS[k].toLowerCase()} service${counts[k] === 1 ? '' : 's'}`}
        >
          <Box
            sx={{
              minWidth: size,
              height: size,
              px: 0.5,
              borderRadius: '4px',
              bgcolor: CHANGE_COLORS[k],
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: size * 0.55,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {counts[k]}
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}

/** Single square split into bands, one per change kind present (year view). */
export function changeBackground(
  day: DayCounts | undefined,
): string | undefined {
  if (day == null) return undefined;
  const colors = CHANGE_KINDS.filter((k) => day[k] > 0).map(
    (k) => CHANGE_COLORS[k],
  );
  if (colors.length === 0) return undefined;
  if (colors.length === 1) return colors[0];
  const step = 100 / colors.length;
  const stops = colors
    .map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`)
    .join(', ');
  return `linear-gradient(135deg, ${stops})`;
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

// ── Service id link ────────────────────────────────────────────────

interface ServiceIdLinkProps {
  serviceId: string;
  onClick: (serviceId: string) => void;
}

export function ServiceIdLink({
  serviceId,
  onClick,
}: ServiceIdLinkProps): React.ReactElement {
  return (
    <Tooltip title='Open service details'>
      <Link
        component='button'
        type='button'
        underline='hover'
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onClick(serviceId);
        }}
        sx={{
          fontFamily: MONO_FONT,
          fontWeight: 700,
          fontSize: '0.8rem',
          verticalAlign: 'baseline',
        }}
      >
        {serviceId}
      </Link>
    </Tooltip>
  );
}

export function serviceAnchorId(serviceId: string): string {
  return `service-${serviceId}`;
}
