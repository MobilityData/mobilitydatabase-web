'use client';

import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import React from 'react';
import type {
  GtfsDate,
  RawTable,
  RouteInfo,
} from '../../lib/entity-diff-types';
import { Link } from '../../../../../i18n/navigation';
import {
  type HighlightEntities,
  allHighlights,
} from '../../lib/trips-v2-highlights';
import { tripsRouteHref } from '../../lib/trips-v2-routes';
import RawDiffTable from '../raw/RawDiffTable';
import FileStatsTable from '../overview/FileStatsTable';
import NotableHighlights from '../overview/NotableHighlights';
import { rawTableRow } from '../../lib/file-stats';
import { formatGtfsDate } from '../../lib/calendar-utils';
import { useRawOverview } from '../../lib/useRawOverview';
import { MONO_FONT } from '../trips/shared';
import { ALL_DATES, V2Card } from './shared';

interface OverviewCardProps {
  datasetId: string;
  rawTables: RawTable[];
  coverage: {
    base: { min: GtfsDate | null; max: GtfsDate | null };
    new: { min: GtfsDate | null; max: GtfsDate | null };
  } | null;
  /** Route names for the highlights (route_id when missing). */
  routes?: Record<string, RouteInfo>;
  /**
   * False for feeds loaded route by route: their Parquet tables run to GBs,
   * so no whole-table scan (column stats, highlights, highlight rows) runs.
   */
  wholeFeedQueries?: boolean;
}

function n(v: number): string {
  return v.toLocaleString();
}

/**
 * What changed in trips.txt and stop_times.txt across the whole feed, before
 * any day is picked: row counts from the raw diff, the columns they touch
 * (DuckDB over the Parquet tables) and the most concerning changes.
 */
export default function OverviewCard({
  datasetId,
  rawTables,
  coverage,
  routes,
  wholeFeedQueries = true,
}: OverviewCardProps): React.ReactElement {
  const files = rawTables
    .filter((t) => t.file === 'trips.txt' || t.file === 'stop_times.txt')
    .map((t) => t.file);
  const overview = useRawOverview(
    datasetId,
    wholeFeedQueries && files.length > 0 ? files : null,
  );
  const trips = rawTables.find((t) => t.file === 'trips.txt');
  const stopTimes = rawTables.find((t) => t.file === 'stop_times.txt');
  const frequencies = rawTables.find((t) => t.file === 'frequencies.txt');
  const tables = [trips, stopTimes, frequencies].filter(
    (t): t is RawTable => t != null,
  );
  // Cheap rules over loaded numbers; the React Compiler memoizes this.
  const highlights = !wholeFeedQueries
    ? []
    : overview.data
      ? allHighlights({
          trips,
          stopTimes,
          stopTimeColumns: overview.data.files.find(
            (f) => f.file === 'stop_times.txt',
          )?.columns,
          signals: overview.data.signals,
          coverage,
          routeName: (id) => routes?.[id]?.short_name || id,
        })
      : null;

  return (
    <V2Card title='Overview of trip changes' scope={ALL_DATES}>
      {rawTables.length === 0 ? (
        <Typography variant='body2' color='text.secondary'>
          This dataset was built without the raw tables: rebuild it to see the
          whole-feed counts.
        </Typography>
      ) : (
        <FileStatsTable rows={tables.map(rawTableRow)} />
      )}

      {files.length > 0 ? (
        <NotableHighlights
          highlights={highlights}
          error={overview.error?.message}
          emptyText={
            wholeFeedQueries
              ? 'Nothing concerning stood out: no route loses its trips, no trips lose accessibility or boarding, and no large cuts.'
              : 'Highlights aren’t computed for feeds this large (loaded route by route): open a route to see its changes.'
          }
          renderDetails={(h) =>
            wholeFeedQueries && h.entities ? (
              <HighlightDetails
                entities={h.entities}
                datasetId={datasetId}
                routes={routes}
              />
            ) : null
          }
        />
      ) : null}
    </V2Card>
  );
}

/** Height of a highlight's expanded entity list, px. */
const ENTITY_LIST_H = 500;

/** The routes behind a route highlight, each opening its Trips v2 page. */
function RouteEntities({
  rows,
  datasetId,
  routes,
}: {
  rows: Extract<HighlightEntities, { kind: 'routes' }>['routes'];
  datasetId: string;
  routes?: Record<string, RouteInfo>;
}): React.ReactElement {
  const head = {
    fontWeight: 700,
    fontSize: '0.75rem',
    bgcolor: 'background.paper',
  };
  return (
    <Box sx={{ maxHeight: ENTITY_LIST_H, overflowY: 'auto' }}>
      <Table size='small' stickyHeader aria-label='Routes in this highlight'>
        <TableHead>
          <TableRow>
            <TableCell sx={head}>Route</TableCell>
            <TableCell sx={head} align='right'>
              Trips before
            </TableCell>
            <TableCell sx={head} align='right'>
              Trips after
            </TableCell>
            <TableCell sx={head} align='right'>
              Change
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => {
            const info = routes?.[r.route];
            const change = r.base > 0 ? (r.new - r.base) / r.base : 0;
            return (
              <TableRow key={r.route} hover>
                <TableCell sx={{ fontSize: '0.8rem' }}>
                  <Link href={tripsRouteHref(datasetId, r.route)}>
                    <Box
                      component='span'
                      sx={{ fontFamily: MONO_FONT, fontWeight: 700 }}
                    >
                      {info?.short_name || r.route}
                    </Box>
                  </Link>
                  {info?.long_name ? (
                    <Box
                      component='span'
                      sx={{ color: 'text.secondary', ml: 1 }}
                    >
                      {info.long_name}
                    </Box>
                  ) : null}
                </TableCell>
                <TableCell align='right' sx={{ fontSize: '0.8rem' }}>
                  {n(r.base)}
                </TableCell>
                <TableCell align='right' sx={{ fontSize: '0.8rem' }}>
                  {n(r.new)}
                </TableCell>
                <TableCell
                  align='right'
                  sx={{ fontSize: '0.8rem', color: '#d32f2f', fontWeight: 700 }}
                >
                  {Math.round(change * 100)}%
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
}

function HighlightDetails({
  entities,
  datasetId,
  routes,
}: {
  entities: HighlightEntities;
  datasetId: string;
  routes?: Record<string, RouteInfo>;
}): React.ReactElement {
  if (entities.kind === 'routes')
    return (
      <RouteEntities
        rows={entities.routes}
        datasetId={datasetId}
        routes={routes}
      />
    );
  if (entities.kind === 'dates')
    return (
      <Table
        size='small'
        sx={{ maxWidth: 520 }}
        aria-label='Service dates of each feed'
      >
        <TableBody>
          {(['base', 'new'] as const).map((side) => (
            <TableRow key={side}>
              <TableCell
                component='th'
                scope='row'
                sx={{ fontSize: '0.8rem', color: 'text.secondary' }}
              >
                {side === 'base' ? 'Original feed' : 'New feed'}
              </TableCell>
              <TableCell sx={{ fontSize: '0.8rem' }}>
                {formatRange(entities[side])}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  // Same Parquet table as the raw file diff, scoped to the highlight's rows:
  // segments load as you scroll and far-away rows leave the DOM.
  return (
    <Box>
      <Typography
        variant='caption'
        color='text.secondary'
        component='div'
        sx={{ mb: 1 }}
      >
        {n(entities.count)} rows of{' '}
        <Box component='span' sx={{ fontFamily: MONO_FONT }}>
          {entities.file}
        </Box>
        . Scroll to load more.
      </Typography>
      <RawDiffTable
        datasetId={datasetId}
        file={entities.file}
        initialFilters={entities.filters}
        compact
        maxHeight={ENTITY_LIST_H}
      />
    </Box>
  );
}

function formatRange(r: {
  min: GtfsDate | null;
  max: GtfsDate | null;
}): string {
  return r.min && r.max
    ? `${formatGtfsDate(r.min)} – ${formatGtfsDate(r.max)}`
    : 'no service';
}
