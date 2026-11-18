'use client';

import {
  Box,
  Button,
  Chip,
  IconButton,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { Close, OpenInNew } from '@mui/icons-material';
import React from 'react';
import type {
  PatternOp,
  RouteDetail,
  RouteDirectionDiff,
  RouteStopInfo,
  RouteInfo,
} from '../../lib/entity-diff-types';
import type { DirectionStops } from '../../lib/route-tables';
import {
  ROUTE_FLAGS,
  ROUTE_FLAG_LABELS,
  routeKind,
} from '../../lib/routes-utils';
import { formatDistance } from '../../lib/stops-utils';
import { DiffBadge } from '../../../GtfsDiffTool/components/EntityCard';
import { useDiffNav } from '../../lib/diff-nav';
import { MONO_FONT, RouteChip } from '../calendar/shared';
import RouteShapes from './RouteShapes';

const OP_STYLES: Record<
  PatternOp['op'],
  { sign: string; color: string; bg?: string }
> = {
  keep: { sign: '↔', color: '#ed6c02' },
  add: { sign: '+', color: '#2e7d32', bg: 'rgba(46,125,50,.08)' },
  remove: { sign: '−', color: '#d32f2f', bg: 'rgba(211,47,47,.08)' },
};

/** A direction's changed stops as rows: added, removed, then moved (keep). */
function changedStops(changes: DirectionStops | undefined): PatternOp[] {
  if (changes == null) return [];
  return [
    ...changes.added.map((id): PatternOp => ({ op: 'add', stop_id: id })),
    ...changes.removed.map((id): PatternOp => ({ op: 'remove', stop_id: id })),
    ...changes.moved.map((id): PatternOp => ({ op: 'keep', stop_id: id })),
  ];
}

function DirectionCard({
  direction,
  changes,
  stops,
  onStopClick,
}: {
  direction: RouteDirectionDiff;
  /** The direction's added, removed and moved stops. */
  changes: DirectionStops | undefined;
  stops: Record<string, RouteStopInfo>;
  onStopClick: (stopId: string) => void;
}): React.ReactElement {
  const nav = useDiffNav();
  const d = direction;
  const headsign = d.headsign.new ?? d.headsign.base;
  const rows = changedStops(changes);

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '6px',
        p: 1.5,
        minWidth: 0,
      }}
    >
      <Typography variant='subtitle2' fontWeight={700}>
        Direction {d.direction_id || '—'}
        {headsign && (
          <Typography component='span' variant='body2' color='text.secondary'>
            {' '}
            → {headsign}
            {d.headsign.base &&
              d.headsign.new &&
              d.headsign.base !== d.headsign.new &&
              ` (was ${d.headsign.base})`}
          </Typography>
        )}
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', my: 1 }}>
        {d.path_change_m != null && (
          <Typography variant='caption'>
            Path deviation{' '}
            <b
              style={{
                color:
                  d.diverge.added.length + d.diverge.removed.length > 0
                    ? '#ed6c02'
                    : undefined,
              }}
            >
              {formatDistance(d.path_change_m)}
            </b>
          </Typography>
        )}
      </Box>
      <Typography
        variant='caption'
        color='text.secondary'
        component='div'
        sx={{ mb: 0.5 }}
      >
        {rows.length > 0
          ? 'Stops added, removed or moved in this direction'
          : 'No stop added, removed or moved in this direction'}
      </Typography>
      <Box sx={{ maxHeight: 360, overflowY: 'auto' }}>
        {rows.map((op) => (
          <Box
            key={`${op.op}-${op.stop_id}`}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 0.5,
              py: 0.1,
              bgcolor: OP_STYLES[op.op].bg,
              borderRadius: '3px',
            }}
          >
            <Box
              sx={{
                width: 12,
                fontFamily: MONO_FONT,
                fontWeight: 700,
                color: OP_STYLES[op.op].color,
                textAlign: 'center',
              }}
            >
              {OP_STYLES[op.op].sign}
            </Box>
            <Link
              component='button'
              type='button'
              underline='hover'
              color='inherit'
              onClick={() => onStopClick(op.stop_id)}
              sx={{
                fontSize: '0.78rem',
                textAlign: 'left',
                color: OP_STYLES[op.op].color,
                textDecoration: op.op === 'remove' ? 'line-through' : undefined,
              }}
            >
              {stops[op.stop_id]?.name || op.stop_id}
            </Link>
            <Typography
              component='span'
              sx={{
                fontFamily: MONO_FONT,
                fontSize: '0.65rem',
                color: 'text.secondary',
              }}
            >
              {op.stop_id}
            </Typography>
            {op.op === 'keep' && (
              <Typography
                component='span'
                sx={{ fontSize: '0.65rem', color: OP_STYLES.keep.color }}
              >
                moved {formatDistance(stops[op.stop_id]?.moved_m ?? null)}
              </Typography>
            )}
            {nav && (
              <Tooltip title='Open in Stops tab'>
                <IconButton
                  size='small'
                  sx={{ p: 0.25, ml: 'auto' }}
                  onClick={() =>
                    nav.navigate({
                      tab: 'stops',
                      kind: 'stop',
                      id: op.stop_id,
                    })
                  }
                >
                  <OpenInNew sx={{ fontSize: '0.8rem' }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

interface RouteDetailsProps {
  route: RouteDetail;
  stops: Record<string, RouteStopInfo>;
  onClose: () => void;
  onStopClick: (stopId: string) => void;
  /** Route chips for shapes shared with other routes. */
  routeInfo: Record<string, RouteInfo>;
  thresholdM: number;
  sameM: number;
  selectedShapeId: string | null;
  onSelectShape: (shapeId: string | null) => void;
  onViewShapeRows?: (shapeId: string) => void;
}

export default function RouteDetails({
  route,
  stops,
  onClose,
  onStopClick,
  routeInfo,
  thresholdM,
  sameM,
  selectedShapeId,
  onSelectShape,
  onViewShapeRows,
}: RouteDetailsProps): React.ReactElement {
  const nav = useDiffNav();
  const r = route;
  const kind = routeKind(r);

  return (
    <Box
      sx={{ bgcolor: 'background.paper', borderRadius: '6px', p: 2.5, mb: 3 }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
          mb: 1.5,
        }}
      >
        <RouteChip
          routeId={r.route_id}
          route={{
            short_name: r.short_name,
            long_name: r.long_name,
            color: r.color,
            text_color: r.text_color,
            presence: kind === 'removed' ? 'base' : 'both',
          }}
          linked={false}
        />
        <Typography variant='subtitle1' fontWeight={700}>
          {r.long_name || r.route_id}
        </Typography>
        <DiffBadge type={r.status} />
        {ROUTE_FLAGS.filter((f) => r.flags[f]).map((f) => (
          <Chip
            key={f}
            size='small'
            variant='outlined'
            label={`${ROUTE_FLAG_LABELS[f]} changed`}
            sx={{ height: 20, fontSize: '0.68rem' }}
          />
        ))}
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          {nav && (
            <Button
              size='small'
              variant='outlined'
              onClick={() =>
                nav.navigate({ tab: 'calendar', kind: 'route', id: r.route_id })
              }
            >
              Show on Service Dates
            </Button>
          )}
          <Tooltip title='Back to all routes'>
            <IconButton
              size='small'
              onClick={onClose}
              aria-label='Close route details'
            >
              <Close fontSize='small' />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
          gap: 2,
          mb: 2,
        }}
      >
        <Box>
          <Typography variant='caption' color='text.secondary' component='div'>
            Stops served
          </Typography>
          <Typography variant='body2'>
            {r.stops.base_count} → {r.stops.new_count}
            {r.stops.added.length > 0 && (
              <span style={{ color: '#2e7d32', fontWeight: 700 }}>
                {' '}
                +{r.stops.added.length}
              </span>
            )}
            {r.stops.removed.length > 0 && (
              <span style={{ color: '#d32f2f', fontWeight: 700 }}>
                {' '}
                −{r.stops.removed.length}
              </span>
            )}
          </Typography>
        </Box>
        <Box>
          <Typography variant='caption' color='text.secondary' component='div'>
            Network
          </Typography>
          <Typography variant='body2'>
            {r.networks.base === r.networks.new
              ? (r.networks.new ?? '—')
              : `${r.networks.base ?? '—'} → ${r.networks.new ?? '—'}`}
          </Typography>
        </Box>
      </Box>

      {r.field_changes.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant='caption'
            fontWeight={700}
            component='div'
            sx={{ mb: 0.5 }}
          >
            routes.txt changes
          </Typography>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Field</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Before</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>After</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {r.field_changes.map((c) => (
                <TableRow key={c.field}>
                  <TableCell
                    sx={{ fontFamily: MONO_FONT, fontSize: '0.72rem' }}
                  >
                    {c.field}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontFamily: MONO_FONT,
                      fontSize: '0.72rem',
                      color: '#d32f2f',
                    }}
                  >
                    {c.base_value || '—'}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontFamily: MONO_FONT,
                      fontSize: '0.72rem',
                      color: '#2e7d32',
                    }}
                  >
                    {c.new_value || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: `repeat(${Math.min(r.directions.length, 2) || 1}, minmax(0, 1fr))`,
          },
          gap: 2,
        }}
      >
        {r.directions.map((d) => (
          <DirectionCard
            key={d.direction_id}
            direction={d}
            changes={r.direction_stops[d.direction_id]}
            stops={stops}
            onStopClick={onStopClick}
          />
        ))}
      </Box>

      {r.shapes && (
        <Box sx={{ mt: 2 }}>
          <RouteShapes
            route={r}
            shapes={r.shapes}
            routeInfo={routeInfo}
            thresholdM={thresholdM}
            sameM={sameM}
            selectedShapeId={selectedShapeId}
            onSelectShape={onSelectShape}
            onViewRows={onViewShapeRows}
          />
        </Box>
      )}
    </Box>
  );
}
