'use client';

import {
  Alert,
  Autocomplete,
  Box,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Clear, Search } from '@mui/icons-material';
import React, { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_ACTIONS,
  RAW_ACTIONS,
  type RawAction,
  type RawDiffFilters,
  type RawDiffRow,
  type RawDiffSort,
} from '../../lib/raw-diff-query';
import { useRawDiffRows } from '../../lib/useRawDiffRows';
import { useSegmentedRawRows } from '../../lib/useSegmentedRawRows';
import { useSegmentWindow } from '../../lib/useSegmentWindow';
import ColumnIntensityBar from '../../../GtfsDiffTool/components/ColumnIntensityBar';
import { RAW_COLORS } from './raw-colors';
import {
  LinkedValue,
  ValueLinkContext,
} from '../../../GtfsDiffTool/components/GtfsDiffFileDiffPanel';
import { useForeignKeyLinker } from '../../lib/foreign-keys';

/** Rows fetched per request while scrolling. */
const SEGMENT_ROWS = 100;
/** Start loading the next segment this far before the end is reached. */
const LOAD_AHEAD_PX = 1200;
/** Rendered segments are only removed when this far outside the view. */
const EVICT_MARGIN_PX = 4000;
/** Rows in the DOM before far-away segments are swapped for spacers. */
const MAX_RENDERED_ROWS = 1000;
/** Same height as the file diff panel's lists. */
const MAX_LIST_H = 476;

const MONO = 'var(--font-ibm-plex-mono)';

/** Row tabs, like the file diff panel's Added / Deleted / Modified. */
type ViewTab =
  | 'changes'
  | 'added'
  | 'deleted'
  | 'modified'
  | 'id_only'
  | 'unchanged'
  | 'all';

const TAB_ACTIONS: Record<ViewTab, RawAction[]> = {
  changes: DEFAULT_ACTIONS,
  added: ['added'],
  deleted: ['deleted'],
  modified: ['modified'],
  id_only: ['id_only'],
  unchanged: ['unchanged'],
  all: RAW_ACTIONS,
};

const TAB_LABELS: Record<ViewTab, string> = {
  changes: 'All changes',
  added: 'Added',
  deleted: 'Deleted',
  modified: 'Modified',
  id_only: 'ID only',
  unchanged: 'Unchanged',
  all: 'All rows',
};

const TAB_HELP: Partial<Record<ViewTab, string>> = {
  changes: 'Added, deleted and modified rows',
  id_only:
    'Same row; only identifiers differ (renumbered trip_id, block_id, service_id or stop_sequence, or a renamed but identical shape). Not counted as a change.',
  unchanged: 'Identical in both feeds',
};

const ACTION_LABELS: Record<RawAction, string> = {
  added: 'Added: only in the new feed',
  deleted: 'Deleted: only in the base feed',
  modified: 'Modified',
  id_only: 'ID only: same row, renumbered identifiers',
  unchanged: 'Unchanged',
};

function tabFor(actions: RawAction[] | undefined): ViewTab {
  if (actions == null) return 'changes';
  const key = [...actions].sort().join();
  const found = (Object.keys(TAB_ACTIONS) as ViewTab[]).find(
    (t) => [...TAB_ACTIONS[t]].sort().join() === key,
  );
  return found ?? 'changes';
}

export interface RawDiffTableProps {
  datasetId: string;
  /** trips.txt, stop_times.txt or frequencies.txt */
  file: string;
  /** Filters applied on first render (e.g. a selected route or trip). */
  initialFilters?: Partial<RawDiffFilters>;
  /**
   * GTFS column that identifies a row's entity (trip_key in the Parquet),
   * shown in its own column: trip_id, or shape_id for shapes.txt.
   */
  keyLabel?: string;
  /**
   * Only the rows table (no tabs, search, filters or column bars), for rows
   * a caller already scoped through initialFilters (e.g. a highlight).
   */
  compact?: boolean;
  /** Height of the scrolling rows area, px. */
  maxHeight?: number;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const headSx = {
  fontFamily: MONO,
  fontWeight: 700,
  fontSize: '0.65rem',
  bgcolor: 'background.paper',
  whiteSpace: 'nowrap',
} as const;

const cellSx = {
  fontFamily: MONO,
  fontSize: '0.65rem',
  py: 0.5,
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
} as const;

/** One GTFS value, in the file diff panel's style. */
function ValueCell({
  row,
  column,
}: {
  row: RawDiffRow;
  column: string;
}): React.ReactElement {
  const b = row.base?.[column] ?? '';
  const n = row.new?.[column] ?? '';
  if (row.action === 'added')
    return (
      <TableCell sx={{ ...cellSx, color: RAW_COLORS.added }}>
        <LinkedValue column={column} value={n} />
      </TableCell>
    );
  if (row.action === 'deleted')
    return (
      <TableCell sx={{ ...cellSx, color: RAW_COLORS.deleted }}>
        <LinkedValue column={column} value={b} />
      </TableCell>
    );
  if (b === n)
    return (
      <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>
        <LinkedValue column={column} value={n} />
      </TableCell>
    );
  // A real change, or an identifier that was renumbered (ID only).
  const real = row.changed.includes(column);
  return (
    <TableCell sx={cellSx}>
      {b !== '' ? (
        <Box
          component='span'
          sx={{
            color: real ? RAW_COLORS.deleted : 'text.disabled',
            textDecoration: 'line-through',
            mr: 0.5,
          }}
        >
          <LinkedValue column={column} value={b} />
        </Box>
      ) : null}
      <Box
        component='span'
        sx={{
          color: real ? RAW_COLORS.added : 'text.secondary',
          fontWeight: real ? 600 : 400,
        }}
      >
        {n ? <LinkedValue column={column} value={n} /> : '(empty)'}
      </Box>
    </TableCell>
  );
}

/**
 * Every row of one GTFS file across both feeds, with what happened to it,
 * laid out like the file diff panel (column change intensity, row tabs,
 * search, inline diff). Queried in the browser with DuckDB-WASM over the
 * dataset's Parquet file, so millions of stop_times rows can be filtered,
 * sorted and scrolled through without downloading them.
 */
export default function RawDiffTable({
  datasetId,
  file,
  initialFilters,
  keyLabel = 'trip_id',
  compact = false,
  maxHeight = MAX_LIST_H,
}: RawDiffTableProps): React.ReactElement {
  // Fixed for the table's lifetime (callers remount to change it).
  const predicate = initialFilters?.predicate ?? null;
  const [tab, setTab] = useState<ViewTab>(() =>
    tabFor(initialFilters?.actions),
  );
  const actions = TAB_ACTIONS[tab];
  const [routeId, setRouteId] = useState<string | null>(
    initialFilters?.routeId ?? null,
  );
  const [tripId, setTripId] = useState(initialFilters?.tripId ?? '');
  const [stopId, setStopId] = useState(initialFilters?.stopId ?? '');
  const [changedColumn, setChangedColumn] = useState<string | null>(
    initialFilters?.changedColumn ?? null,
  );
  const [search, setSearch] = useState(initialFilters?.search ?? '');
  const [sort, setSort] = useState<RawDiffSort | null>(null);
  // Foreign keys (route_id, stop_id, service_id, shape_id) open their page.
  const linker = useForeignKeyLinker(datasetId);

  // Debounce the typed filters as one string (a primitive, so the timer
  // isn't reset by a fresh object every render).
  const typed = useDebounced(JSON.stringify([tripId, stopId, search]), 300);
  const filters = useMemo<RawDiffFilters>(() => {
    const [t, s, q] = JSON.parse(typed) as [string, string, string];
    return {
      actions,
      routeId,
      changedColumn,
      tripId: t,
      stopId: s,
      search: q,
      predicate,
    };
  }, [actions, routeId, changedColumn, typed, predicate]);
  // Totals, counts, columns and route ids for the query; rows come by segment.
  const { columns, routes, total, counts, columnStats, loading, error } =
    useRawDiffRows({
      datasetId,
      file,
      filters,
      sort,
      offset: 0,
      limit: 1,
    });
  const cache = useSegmentedRawRows({
    datasetId,
    file,
    filters,
    sort,
    segmentRows: SEGMENT_ROWS,
  });
  // ── Infinite scroll with windowing (lib/useSegmentWindow.ts) ─────
  const view = useSegmentWindow({
    cache,
    total,
    segmentRows: SEGMENT_ROWS,
    aheadPx: LOAD_AHEAD_PX,
    evictMarginPx: EVICT_MARGIN_PX,
    maxRenderedRows: MAX_RENDERED_ROWS,
  });
  const { topSpacer, bottomSpacer, segmentCount } = view;
  const lastRendered = view.last;
  const hasMore = lastRendered + 1 < segmentCount && bottomSpacer === 0;
  const firstRow = Math.min(total, view.first * SEGMENT_ROWS + 1);
  const lastRow = Math.min(total, (lastRendered + 1) * SEGMENT_ROWS);

  // The key column is the row's identifier rather than a GTFS column.
  const shown = columns.filter((c) => c !== keyLabel);
  // Files with their own route_id column (trips.txt) show it, with its
  // changes, as a GTFS column; others (stop_times.txt) get the trip's route.
  const metaRoute = !columns.includes('route_id');
  const colSpan = shown.length + (metaRoute ? 3 : 2);
  const modified = counts.modified;

  const sortBy = (column: string): void =>
    setSort((s) =>
      s?.column === column
        ? s.desc
          ? null
          : { column, desc: true }
        : { column, desc: false },
    );
  const sortLabel = (column: string, label: string): React.ReactElement => (
    <TableSortLabel
      active={sort?.column === column}
      direction={sort?.column === column && sort.desc ? 'desc' : 'asc'}
      onClick={() => sortBy(column)}
    >
      {label}
    </TableSortLabel>
  );
  const tabCount = (t: ViewTab): number =>
    TAB_ACTIONS[t].reduce((s, a) => s + counts[a], 0);

  if (error != null)
    return (
      <Alert severity='error'>
        Could not query {file} with DuckDB: {error.message}
      </Alert>
    );

  return (
    <ValueLinkContext.Provider value={linker}>
      <Box>
        {compact ? null : (
          <>
            {/* Column modification intensity, for the current filters */}
            {columnStats.length > 0 ? (
              <ColumnIntensityBar
                intensities={columnStats.map((c) => ({
                  column: c.column,
                  changedCount: c.count,
                  totalModified: modified,
                  percentage:
                    Math.round((c.count / Math.max(modified, 1)) * 10000) / 100,
                }))}
              />
            ) : null}

            {/* Row tabs */}
            <Tabs
              value={tab}
              onChange={(_, v: ViewTab) => setTab(v)}
              variant='scrollable'
              scrollButtons='auto'
              sx={{ minHeight: 36, mb: 1.5 }}
              slotProps={{ indicator: { style: { height: 2 } } }}
            >
              {(Object.keys(TAB_ACTIONS) as ViewTab[]).map((t) => (
                <Tab
                  key={t}
                  value={t}
                  label={
                    <Tooltip title={TAB_HELP[t] ?? ''}>
                      <span>
                        {TAB_LABELS[t]} ({tabCount(t).toLocaleString()})
                      </span>
                    </Tooltip>
                  }
                  sx={{
                    minHeight: 36,
                    fontSize: '0.8rem',
                    textTransform: 'none',
                  }}
                />
              ))}
            </Tabs>

            <TextField
              fullWidth
              size='small'
              placeholder={`Search ${file} rows: ids, names, values…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ mb: 1.5 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position='start'>
                      <Search fontSize='small' />
                    </InputAdornment>
                  ),
                  endAdornment: search ? (
                    <InputAdornment position='end'>
                      <IconButton
                        size='small'
                        aria-label='Clear search'
                        onClick={() => setSearch('')}
                      >
                        <Clear fontSize='small' />
                      </IconButton>
                    </InputAdornment>
                  ) : undefined,
                },
              }}
            />
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                flexWrap: 'wrap',
                alignItems: 'center',
                mb: 1.5,
              }}
            >
              <Typography variant='caption' color='text.secondary'>
                Filter:
              </Typography>
              <Autocomplete
                size='small'
                options={routes}
                value={routeId}
                onChange={(_, v) => setRouteId(v)}
                renderInput={(params) => (
                  <TextField {...params} placeholder='route_id' />
                )}
                sx={{ width: 150 }}
              />
              <TextField
                size='small'
                placeholder={keyLabel}
                value={tripId}
                onChange={(e) => setTripId(e.target.value)}
                sx={{ width: 160 }}
              />
              {columns.includes('stop_id') ? (
                <TextField
                  size='small'
                  placeholder='stop_id'
                  value={stopId}
                  onChange={(e) => setStopId(e.target.value)}
                  sx={{ width: 120 }}
                />
              ) : null}
              <TextField
                select
                size='small'
                value={changedColumn ?? ''}
                onChange={(e) => setChangedColumn(e.target.value || null)}
                sx={{ width: 230 }}
                slotProps={{
                  select: {
                    displayEmpty: true,
                    renderValue: () =>
                      changedColumn ? (
                        <Box component='span' sx={{ fontFamily: MONO }}>
                          {changedColumn} changed
                        </Box>
                      ) : (
                        <Box component='span' sx={{ color: 'text.secondary' }}>
                          Any changed column
                        </Box>
                      ),
                  },
                }}
              >
                <MenuItem value=''>Any changed column</MenuItem>
                {columns.map((c) => (
                  <MenuItem key={c} value={c} sx={{ fontFamily: MONO }}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
          </>
        )}

        <Box sx={{ height: 2 }}>
          {loading ? <LinearProgress sx={{ height: 2 }} /> : null}
        </Box>
        <TableContainer
          ref={view.scrollRef}
          onScroll={view.onScroll}
          data-window={`${view.first}-${lastRendered}`}
          data-measured={view.measured}
          sx={{
            maxHeight,
            borderRadius: '4px',
            overflowX: 'auto',
            opacity: loading ? 0.6 : 1,
            // Restoring a segment in place of its spacer must not move the view.
            overflowAnchor: 'none',
          }}
        >
          <Table size='small' stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>
                  {sortLabel('trip_key', 'Identifier')}
                </TableCell>
                {metaRoute ? (
                  <TableCell sx={headSx}>
                    {sortLabel('route_id', 'route_id')}
                  </TableCell>
                ) : null}
                {shown.map((c) => (
                  <TableCell key={c} sx={headSx}>
                    {sortLabel(c, c)}
                  </TableCell>
                ))}
                <TableCell sx={headSx}>Line</TableCell>
              </TableRow>
            </TableHead>
            {topSpacer > 0 ? (
              <tbody aria-hidden>
                <tr style={{ height: topSpacer }}>
                  <td colSpan={colSpan} />
                </tr>
              </tbody>
            ) : null}
            {total === 0 && !loading ? (
              <TableBody>
                <TableRow>
                  <TableCell colSpan={colSpan} sx={{ borderBottom: 'none' }}>
                    <Typography variant='body2' color='text.secondary'>
                      No {TAB_LABELS[tab].toLowerCase()} rows match.
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableBody>
            ) : null}
            {view.rendered.map((seg) => {
              const rows = cache.segments.get(seg);
              const knownHeight = view.heightOf(seg);
              if (rows == null) {
                // Placeholder: same height as before when restoring a segment.
                return (
                  <tbody key={seg}>
                    <tr style={{ height: knownHeight }}>
                      <td colSpan={colSpan} style={{ padding: 12 }}>
                        <Typography variant='caption' color='text.secondary'>
                          Loading rows{' '}
                          {(seg * SEGMENT_ROWS + 1).toLocaleString()}–
                          {Math.min(
                            total,
                            (seg + 1) * SEGMENT_ROWS,
                          ).toLocaleString()}
                          …
                        </Typography>
                      </td>
                    </tr>
                  </tbody>
                );
              }
              return (
                <TableBody key={seg} ref={view.segmentRef(seg)}>
                  {rows.map((r, i) => {
                    const renamed =
                      r.base_trip_id != null &&
                      r.new_trip_id != null &&
                      r.base_trip_id !== r.new_trip_id;
                    return (
                      <TableRow
                        key={`${seg}-${i}`}
                        title={ACTION_LABELS[r.action]}
                        sx={{
                          bgcolor: RAW_COLORS.rowBg[r.action],
                          '& > td': {
                            borderBottom: '1px solid rgba(0,0,0,0.04)',
                          },
                        }}
                      >
                        <TableCell
                          sx={{
                            ...cellSx,
                            color:
                              r.action === 'added'
                                ? RAW_COLORS.added
                                : r.action === 'deleted'
                                  ? RAW_COLORS.deleted
                                  : 'text.secondary',
                            fontWeight: 700,
                          }}
                        >
                          {renamed ? (
                            <>
                              <Box
                                component='span'
                                sx={{
                                  textDecoration: 'line-through',
                                  color: 'text.disabled',
                                  mr: 0.5,
                                }}
                              >
                                <LinkedValue
                                  column={keyLabel}
                                  value={r.base_trip_id ?? ''}
                                />
                              </Box>
                              <LinkedValue
                                column={keyLabel}
                                value={r.new_trip_id ?? ''}
                              />
                            </>
                          ) : (
                            <LinkedValue
                              column={keyLabel}
                              value={r.new_trip_id ?? r.base_trip_id ?? ''}
                            />
                          )}
                        </TableCell>
                        {metaRoute ? (
                          <TableCell
                            sx={{ ...cellSx, color: 'text.secondary' }}
                          >
                            <LinkedValue
                              column='route_id'
                              value={r.route_id ?? ''}
                            />
                          </TableCell>
                        ) : null}
                        {shown.map((c) => (
                          <ValueCell key={c} row={r} column={c} />
                        ))}
                        <TableCell sx={{ ...cellSx, color: '#777' }}>
                          {r.new_line ?? r.base_line ?? ''}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              );
            })}
            {bottomSpacer > 0 ? (
              <tbody aria-hidden>
                <tr style={{ height: bottomSpacer }}>
                  <td colSpan={colSpan} />
                </tr>
              </tbody>
            ) : null}
            {hasMore ? (
              <tbody>
                <tr>
                  <td colSpan={colSpan} style={{ padding: 12 }}>
                    <Typography variant='caption' color='text.secondary'>
                      Scroll for more rows…
                    </Typography>
                  </td>
                </tr>
              </tbody>
            ) : null}
          </Table>
        </TableContainer>

        {/* Row count footer, as in the file diff panel */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 0.5,
            py: 0.75,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
          aria-live='polite'
        >
          <Typography variant='caption' color='text.secondary'>
            {total === 0
              ? 'Showing 0 rows'
              : `Showing ${firstRow > 1 ? `${firstRow.toLocaleString()}–` : ''}${lastRow.toLocaleString()} of ${total.toLocaleString()} rows`}
          </Typography>
          {lastRow < total ? (
            <Typography
              variant='caption'
              color='text.secondary'
              sx={{ fontStyle: 'italic' }}
            >
              — scroll down to load more
            </Typography>
          ) : null}
          {cache.error ? (
            <Typography variant='caption' color='error'>
              {cache.error.message}
            </Typography>
          ) : null}
        </Box>
      </Box>
    </ValueLinkContext.Provider>
  );
}
