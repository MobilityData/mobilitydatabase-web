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
import React, { useState } from 'react';
import type {
  PatternOp,
  RouteDirectionDiff,
  RouteImpact,
  RouteStopInfo,
  RouteInfo,
} from '../../lib/entity-diff-types';
import {
  ROUTE_FLAGS,
  ROUTE_FLAG_LABELS,
  routeKind,
} from '../../lib/routes-utils';
import { formatDistance } from '../../lib/stops-utils';
import { DiffBadge } from '../../../GtfsDiffTool/components/EntityCard';
import { useDiffNav } from '../../lib/diff-nav';
import { MONO_FONT, RouteChip, ServiceIdLink } from '../calendar/shared';
import RouteShapes from './RouteShapes';

/** Unchanged runs longer than this are collapsed in the stop sequence diff. */
const COLLAPSE_RUN = 4;

const OP_STYLES: Record<
  PatternOp['op'],
  { sign: string; color: string; bg?: string }
> = {
  keep: { sign: ' ', color: 'text.primary' },
  add: { sign: '+', color: '#2e7d32', bg: 'rgba(46,125,50,.08)' },
  remove: { sign: '−', color: '#d32f2f', bg: 'rgba(211,47,47,.08)' },
};

type Row =
  | { type: 'op'; op: PatternOp; index: number }
  | { type: 'gap'; count: number; from: number };

/** Collapse long runs of unchanged stops, keeping one stop of context on each side. */
function collapse(ops: PatternOp[], expanded: boolean): Row[] {
  if (expanded) return ops.map((op, index) => ({ type: 'op', op, index }));
  const rows: Row[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].op !== 'keep') {
      rows.push({ type: 'op', op: ops[i], index: i });
      i++;
      continue;
    }
    let j = i;
    while (j < ops.length && ops[j].op === 'keep') j++;
    const run = j - i;
    if (run > COLLAPSE_RUN) {
      const head = i === 0 ? 0 : 1;
      const tail = j === ops.length ? 0 : 1;
      for (let k = i; k < i + head; k++)
        rows.push({ type: 'op', op: ops[k], index: k });
      rows.push({ type: 'gap', count: run - head - tail, from: i + head });
      for (let k = j - tail; k < j; k++)
        rows.push({ type: 'op', op: ops[k], index: k });
    } else {
      for (let k = i; k < j; k++)
        rows.push({ type: 'op', op: ops[k], index: k });
    }
    i = j;
  }
  return rows;
}

function DirectionCard({
  direction,
  stops,
  onStopClick,
}: {
  direction: RouteDirectionDiff;
  stops: Record<string, RouteStopInfo>;
  onStopClick: (stopId: string) => void;
}): React.ReactElement {
  const nav = useDiffNav();
  const [expanded, setExpanded] = useState(false);
  const d = direction;
  const changed = d.pattern_diff.some((o) => o.op !== 'keep');
  const headsign = d.headsign.new ?? d.headsign.base;
  const rows = collapse(d.pattern_diff, expanded);

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
        <Typography variant='caption'>
          Trips{' '}
          <b
            style={{
              color: d.trips.base !== d.trips.new ? '#ed6c02' : undefined,
            }}
          >
            {d.trips.base} → {d.trips.new}
          </b>
        </Typography>
        <Typography variant='caption'>
          Stop patterns{' '}
          <b>
            {d.pattern_count.base} → {d.pattern_count.new}
          </b>
        </Typography>
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
        Main stop sequence {changed ? '(base → new)' : '(unchanged)'}
      </Typography>
      <Box sx={{ maxHeight: 360, overflowY: 'auto' }}>
        {rows.map((row) =>
          row.type === 'gap' ? (
            <Box key={`gap-${row.from}`} sx={{ pl: 3, py: 0.25 }}>
              <Link
                component='button'
                type='button'
                variant='caption'
                onClick={() => setExpanded(true)}
              >
                ⋯ {row.count} unchanged stops
              </Link>
            </Box>
          ) : (
            <Box
              key={`${row.index}-${row.op.stop_id}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                px: 0.5,
                py: 0.1,
                bgcolor: OP_STYLES[row.op.op].bg,
                borderRadius: '3px',
              }}
            >
              <Box
                sx={{
                  width: 12,
                  fontFamily: MONO_FONT,
                  fontWeight: 700,
                  color: OP_STYLES[row.op.op].color,
                  textAlign: 'center',
                }}
              >
                {OP_STYLES[row.op.op].sign}
              </Box>
              <Link
                component='button'
                type='button'
                underline='hover'
                color='inherit'
                onClick={() => onStopClick(row.op.stop_id)}
                sx={{
                  fontSize: '0.78rem',
                  textAlign: 'left',
                  color: OP_STYLES[row.op.op].color,
                  textDecoration:
                    row.op.op === 'remove' ? 'line-through' : undefined,
                }}
              >
                {stops[row.op.stop_id]?.name || row.op.stop_id}
              </Link>
              <Typography
                component='span'
                sx={{
                  fontFamily: MONO_FONT,
                  fontSize: '0.65rem',
                  color: 'text.secondary',
                }}
              >
                {row.op.stop_id}
              </Typography>
              {nav && (
                <Tooltip title='Open in Stops tab'>
                  <IconButton
                    size='small'
                    sx={{ p: 0.25, ml: 'auto' }}
                    onClick={() =>
                      nav.navigate({
                        tab: 'stops',
                        kind: 'stop',
                        id: row.op.stop_id,
                      })
                    }
                  >
                    <OpenInNew sx={{ fontSize: '0.8rem' }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          ),
        )}
      </Box>
      {expanded && (
        <Button
          size='small'
          onClick={() => setExpanded(false)}
          sx={{ mt: 0.5 }}
        >
          Collapse unchanged stops
        </Button>
      )}
    </Box>
  );
}

function ServiceList({ route }: { route: RouteImpact }): React.ReactElement {
  const nav = useDiffNav();
  const base = new Set(route.services.base);
  const next = new Set(route.services.new);
  const all = [
    ...new Set([...route.services.base, ...route.services.new]),
  ].sort();
  return (
    <Box
      sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}
    >
      {all.map((id) => {
        const color = !base.has(id)
          ? '#2e7d32'
          : !next.has(id)
            ? '#d32f2f'
            : undefined;
        return (
          <Box
            key={id}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.25,
              px: 0.5,
              borderRadius: '4px',
              border: '1px solid',
              borderColor: color ?? 'divider',
            }}
          >
            {color && (
              <Typography sx={{ color, fontWeight: 700, fontSize: '0.75rem' }}>
                {color === '#2e7d32' ? '+' : '−'}
              </Typography>
            )}
            <ServiceIdLink
              serviceId={id}
              onClick={(sid) =>
                nav?.navigate({ tab: 'calendar', kind: 'service', id: sid })
              }
            />
          </Box>
        );
      })}
    </Box>
  );
}

/** Stops added/removed on the route but not in any direction's main pattern. */
function OtherPatternStops({
  route,
  stops,
  onStopClick,
}: {
  route: RouteImpact;
  stops: Record<string, RouteStopInfo>;
  onStopClick: (stopId: string) => void;
}): React.ReactElement | null {
  const inMain = new Set(
    route.directions.flatMap((d) => d.pattern_diff.map((o) => o.stop_id)),
  );
  const groups = [
    {
      label: 'Also added on other trip patterns',
      ids: route.stops.added.filter((s) => !inMain.has(s)),
      color: '#2e7d32',
    },
    {
      label: 'Also removed from other trip patterns',
      ids: route.stops.removed.filter((s) => !inMain.has(s)),
      color: '#d32f2f',
    },
  ].filter((g) => g.ids.length > 0);
  if (groups.length === 0) return null;
  return (
    <Box sx={{ mb: 2 }}>
      {groups.map((g) => (
        <Box key={g.label} sx={{ mb: 1 }}>
          <Typography
            variant='caption'
            color='text.secondary'
            component='div'
            sx={{ mb: 0.5 }}
          >
            {g.label} ({g.ids.length})
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {g.ids.map((id) => (
              <Chip
                key={id}
                size='small'
                variant='outlined'
                label={`${stops[id]?.name || id} · ${id}`}
                onClick={() => onStopClick(id)}
                sx={{
                  height: 22,
                  fontSize: '0.7rem',
                  color: g.color,
                  borderColor: g.color,
                }}
              />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

interface RouteDetailsProps {
  route: RouteImpact;
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
              Show on service calendar
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
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 2,
          mb: 2,
        }}
      >
        <Box>
          <Typography variant='caption' color='text.secondary' component='div'>
            Trips
          </Typography>
          <Typography variant='body2'>
            {r.trips.base} → {r.trips.new}
          </Typography>
        </Box>
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

      <Box sx={{ mb: 2 }}>
        <Typography
          variant='caption'
          color='text.secondary'
          component='div'
          sx={{ mb: 0.5 }}
        >
          Services used by this route&apos;s trips (open in Service calendar)
        </Typography>
        <ServiceList route={r} />
      </Box>

      <OtherPatternStops route={r} stops={stops} onStopClick={onStopClick} />

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
