'use client';

import {
  Box,
  Chip,
  FormControlLabel,
  IconButton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { TableRows } from '@mui/icons-material';
import React, { useMemo, useState } from 'react';
import type {
  RouteImpact,
  RouteInfo,
  RouteShapeDiff,
  ShapeStatus,
} from '../../lib/entity-diff-types';
import {
  MINOR_SHAPE_STATUSES,
  SHAPE_STATUSES,
  SHAPE_STATUS_COLORS,
  SHAPE_STATUS_LABELS,
  isPathChangingShape,
  shapeDeviationText,
  shapeStatusHelp,
} from '../../lib/routes-utils';
import { MONO_FONT, RouteChips } from '../calendar/shared';

const cellSx = { fontSize: '0.75rem', py: 0.5, verticalAlign: 'top' };

export function ShapeStatusChip({
  status,
  help,
}: {
  status: ShapeStatus;
  help?: string;
}): React.ReactElement {
  const chip = (
    <Chip
      size='small'
      label={SHAPE_STATUS_LABELS[status]}
      sx={{
        height: 20,
        fontSize: '0.68rem',
        fontWeight: 700,
        bgcolor: SHAPE_STATUS_COLORS[status],
        color: '#fff',
      }}
    />
  );
  return help ? <Tooltip title={help}>{chip}</Tooltip> : chip;
}

function countLabel(b: number, n: number): string {
  return b === n
    ? n.toLocaleString()
    : `${b.toLocaleString()} → ${n.toLocaleString()}`;
}

function ShapeNotes({
  shape,
  routeInfo,
}: {
  shape: RouteShapeDiff;
  routeInfo: Record<string, RouteInfo>;
}): React.ReactElement {
  const notes: React.ReactNode[] = [];
  if (shape.renamed_from) {
    notes.push(
      <span key='renamed'>
        was{' '}
        <Box component='span' sx={{ fontFamily: MONO_FONT }}>
          {shape.renamed_from}
        </Box>
      </span>,
    );
  }
  if (shape.unused.new)
    notes.push(<span key='unused-new'>no trip uses it in the new feed</span>);
  if (shape.unused.base)
    notes.push(
      <span key='unused-base'>no trip used it in the original feed</span>,
    );
  const shared = [
    ...new Set([...shape.other_routes.base, ...shape.other_routes.new]),
  ].sort();
  if (shared.length > 0) {
    notes.push(
      <Box
        key='shared'
        component='span'
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
      >
        shared with <RouteChips routeIds={shared} routes={routeInfo} />
      </Box>,
    );
  }
  if (
    shape.trips.base === 0 &&
    shape.trips.new > 0 &&
    shape.status !== 'added' &&
    shape.other_routes.base.length > 0
  ) {
    notes.push(<span key='moved'>used by other routes before</span>);
  }
  if (notes.length === 0) return <>—</>;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
      {notes}
    </Box>
  );
}

interface RouteShapesProps {
  route: RouteImpact;
  shapes: RouteShapeDiff[];
  routeInfo: Record<string, RouteInfo>;
  thresholdM: number;
  sameM: number;
  selectedShapeId: string | null;
  onSelectShape: (shapeId: string | null) => void;
  /** Open the shape's rows in the raw shapes.txt table. */
  onViewRows?: (shapeId: string) => void;
  /**
   * Narrow layout (a side panel): the table only, with every shape (no
   * title, status filters or minor-changes switch; the caller titles it
   * with shapesPathSummary), and shape, change and trips columns.
   */
  compact?: boolean;
}

/** One line on how the route's shapes change, e.g. "2 shapes change where 14 runs". */
export function shapesPathSummary(
  route: Pick<RouteImpact, 'short_name' | 'route_id'>,
  shapes: RouteShapeDiff[],
  thresholdM: number,
): string {
  const pathChanging = shapes.filter((sh) =>
    isPathChangingShape(sh, thresholdM),
  ).length;
  const routeName = route.short_name || route.route_id;
  return pathChanging > 0
    ? `${pathChanging} ${pathChanging === 1 ? 'shape changes' : 'shapes change'} where ${routeName} runs`
    : `No shape changes where ${routeName} runs`;
}

/** Every shape the route's trips use, how it changed, and where it runs. */
export default function RouteShapes({
  route,
  shapes,
  routeInfo,
  thresholdM,
  sameM,
  selectedShapeId,
  onSelectShape,
  onViewRows,
  compact = false,
}: RouteShapesProps): React.ReactElement {
  const [statusFilter, setStatusFilter] = useState<ShapeStatus | null>(null);
  const [showMinor, setShowMinor] = useState(false);

  const counts = useMemo(() => {
    const c = Object.fromEntries(SHAPE_STATUSES.map((s) => [s, 0])) as Record<
      ShapeStatus,
      number
    >;
    for (const sh of shapes) c[sh.status]++;
    return c;
  }, [shapes]);
  const minorCount = MINOR_SHAPE_STATUSES.reduce((n, s) => n + counts[s], 0);
  const pathSummary = shapesPathSummary(route, shapes, thresholdM);

  const visible = shapes.filter(
    (sh) =>
      compact ||
      ((statusFilter == null || sh.status === statusFilter) &&
        (showMinor ||
          statusFilter != null ||
          !MINOR_SHAPE_STATUSES.includes(sh.status) ||
          sh.shape_id === selectedShapeId)),
  );

  return (
    <Box sx={{ mb: compact ? 0 : 2 }}>
      {compact ? null : (
        <>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 1.5,
              flexWrap: 'wrap',
              mb: 1,
            }}
          >
            <Typography variant='subtitle2' fontWeight={700}>
              Shapes ({shapes.length})
            </Typography>
            <Typography variant='caption' color='text.secondary'>
              {pathSummary} · select a shape to draw it on the map
            </Typography>
          </Box>

          <Box
            sx={{
              display: 'flex',
              gap: 0.75,
              flexWrap: 'wrap',
              alignItems: 'center',
              mb: 1,
            }}
          >
            {SHAPE_STATUSES.filter((s) => counts[s] > 0).map((s) => {
              const active = statusFilter === s;
              return (
                <Tooltip key={s} title={shapeStatusHelp(s, sameM, thresholdM)}>
                  <Chip
                    size='small'
                    label={`${SHAPE_STATUS_LABELS[s]} · ${counts[s]}`}
                    onClick={() => setStatusFilter(active ? null : s)}
                    sx={{
                      height: 22,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      border: `1px solid ${SHAPE_STATUS_COLORS[s]}`,
                      bgcolor: active ? SHAPE_STATUS_COLORS[s] : 'transparent',
                      color: active ? '#fff' : SHAPE_STATUS_COLORS[s],
                      '&:hover': {
                        bgcolor: active
                          ? SHAPE_STATUS_COLORS[s]
                          : 'transparent',
                        opacity: 0.85,
                      },
                    }}
                  />
                </Tooltip>
              );
            })}
            {minorCount > 0 && statusFilter == null && (
              <FormControlLabel
                sx={{ ml: 0.5 }}
                control={
                  <Switch
                    size='small'
                    checked={showMinor}
                    onChange={(e) => setShowMinor(e.target.checked)}
                  />
                }
                label={
                  <Typography variant='caption'>
                    Show minor changes ({minorCount})
                  </Typography>
                }
              />
            )}
          </Box>
        </>
      )}

      {visible.length === 0 &&
      compact &&
      shapes.length > 0 ? null : visible.length === 0 ? (
        <Typography variant='body2' color='text.secondary'>
          {shapes.length === 0
            ? 'No trip of this route has a shape_id.'
            : `Only minor changes (${minorCount}): turn on “Show minor changes” to list them.`}
        </Typography>
      ) : (
        <Box
          sx={{
            maxHeight: compact ? 168 : 360,
            overflowY: 'auto',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '6px',
          }}
        >
          <Table size='small' stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>shape_id</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Change</TableCell>
                {compact ? null : (
                  <TableCell sx={{ fontWeight: 700 }}>Path</TableCell>
                )}
                <TableCell sx={{ fontWeight: 700 }} align='right'>
                  Trips
                </TableCell>
                {compact ? null : (
                  <>
                    <TableCell sx={{ fontWeight: 700 }} align='right'>
                      Points
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Dir.</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Notes</TableCell>
                  </>
                )}
                {onViewRows && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((sh) => {
                const selected = sh.shape_id === selectedShapeId;
                const changesPath = isPathChangingShape(sh, thresholdM);
                return (
                  <TableRow
                    key={sh.shape_id}
                    hover
                    selected={selected}
                    onClick={() => onSelectShape(selected ? null : sh.shape_id)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell
                      sx={{
                        ...cellSx,
                        fontFamily: MONO_FONT,
                        fontWeight: 700,
                        wordBreak: compact ? 'break-all' : undefined,
                      }}
                    >
                      {sh.shape_id}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <ShapeStatusChip
                        status={sh.status}
                        help={
                          compact
                            ? `${shapeDeviationText(sh, thresholdM)}. ${shapeStatusHelp(sh.status, sameM, thresholdM)}`
                            : shapeStatusHelp(sh.status, sameM, thresholdM)
                        }
                      />
                    </TableCell>
                    {compact ? null : (
                      <TableCell
                        sx={{
                          ...cellSx,
                          color: changesPath
                            ? SHAPE_STATUS_COLORS.rerouted
                            : 'text.secondary',
                          fontWeight: changesPath ? 700 : 400,
                        }}
                      >
                        {shapeDeviationText(sh, thresholdM)}
                      </TableCell>
                    )}
                    <TableCell
                      sx={{ ...cellSx, whiteSpace: 'nowrap' }}
                      align='right'
                    >
                      {countLabel(sh.trips.base, sh.trips.new)}
                    </TableCell>
                    {compact ? null : (
                      <>
                        <TableCell sx={cellSx} align='right'>
                          {countLabel(sh.points.base, sh.points.new)}
                        </TableCell>
                        <TableCell sx={cellSx}>
                          {sh.directions.join(', ') || '—'}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>
                          <ShapeNotes shape={sh} routeInfo={routeInfo} />
                        </TableCell>
                      </>
                    )}
                    {onViewRows && (
                      <TableCell sx={cellSx} align='right'>
                        <Tooltip title='View rows in the raw shapes.txt diff'>
                          <IconButton
                            size='small'
                            aria-label={`View shapes.txt rows of ${sh.shape_id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewRows(sh.shape_id);
                            }}
                            sx={{ p: 0.25 }}
                          >
                            <TableRows sx={{ fontSize: '1rem' }} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
}
