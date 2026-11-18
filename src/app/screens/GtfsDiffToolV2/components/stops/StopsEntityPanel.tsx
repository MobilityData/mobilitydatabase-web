'use client';

import {
  Box,
  Button,
  Checkbox,
  Chip,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  type SxProps,
  TextField,
  type Theme,
  Typography,
} from '@mui/material';
import { Clear, Search, Place } from '@mui/icons-material';
import React, { useEffect, useRef, useState } from 'react';
import type {
  EntityTypeDiff,
  RawTable,
  StopChange,
  StopsMapDiff,
} from '../../lib/entity-diff-types';
import {
  STOP_KINDS,
  STOP_KIND_COLORS,
  STOP_KIND_LABELS,
  type StopFilters,
  type StopKind,
  formatDistance,
  isPrecisionOnly,
} from '../../lib/stops-utils';
import {
  type StopListRow,
  stopChangeQuery,
  stopsKindCountsQuery,
  stopsPageQuery,
  stopsPointsQuery,
  toStopChange,
  toStopListRow,
  toStopPoint,
} from '../../lib/map-table-query';
import { parquetView, runQueued } from '../../lib/duckdb-client';
import { diffFileUrl } from '../../lib/datasets';
import { stopsTableSource, useViewsQuery } from '../../lib/useMapTable';
import { useRouteInfo } from '../../lib/useDiffData';
import SegmentedList from '../diffmap/SegmentedList';
import { type RowAction } from '../../../GtfsDiffTool/components/GtfsDiffFileDiffPanel';
import EntityOverviewCard from '../overview/EntityOverviewCard';
import RawFileDiffCard from '../raw/RawFileDiffCard';
import StopsDiffMap, { type MapSelection } from './StopsDiffMap';
import {
  DiffMapControlPanel,
  DiffMapFrame,
  DiffMapLayout,
  useDiffMapFullscreen,
} from '../diffmap/DiffMapControls';
import MapLegend, { LegendDot } from '../diffmap/MapLegend';
import { type NavFocus, useDiffNav } from '../../lib/diff-nav';
import { SearchHeader } from '../../../../styles/Filters.styles';
import { ReportActions, useReportSubtitle } from '../report/ReportLayout';
import { StyledChipFilterContainer } from '../../../Feed/Map.styles';

/** Anchor of the raw file diff at the bottom of the page. */
const RAW_DIFF_ID = 'raw-diff';

/**
 * No change type selected means all are shown (like route types on the
 * feed map). Moves under 1 m and coordinate-precision-only changes are
 * always treated as noise.
 */
const DEFAULT_FILTERS: StopFilters = {
  kinds: [],
  minMoveM: 1,
  hidePrecisionOnly: true,
  search: '',
};

/** Map-marker style dot for a change type (also used as a Chip icon). */
function KindDot({
  kind,
  className,
}: {
  kind: StopKind;
  className?: string;
}): React.ReactElement {
  const color = STOP_KIND_COLORS[kind];
  return (
    <Box
      component='span'
      className={className}
      sx={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        bgcolor: color,
        border: '2px solid #fff',
        boxShadow: `0 0 0 1px ${color}`,
        flex: '0 0 auto',
      }}
    />
  );
}

/** Change-type checkboxes in the map colours, styled like NestedCheckboxList. */
function KindCheckboxList({
  selected,
  counts,
  onToggle,
}: {
  selected: StopKind[];
  counts: Record<StopKind, number>;
  onToggle: (kind: StopKind) => void;
}): React.ReactElement {
  return (
    <List sx={{ width: '100%' }} dense>
      {STOP_KINDS.map((k) => {
        const color = STOP_KIND_COLORS[k];
        const labelId = `stop-kind-${k}`;
        return (
          <ListItem key={k} disablePadding>
            <ListItemButton dense sx={{ p: 0 }} onClick={() => onToggle(k)}>
              <Checkbox
                edge='start'
                tabIndex={-1}
                disableRipple
                checked={selected.includes(k)}
                slotProps={{ input: { 'aria-labelledby': labelId } }}
                sx={{ color, '&.Mui-checked': { color } }}
              />
              <ListItemText
                id={labelId}
                primary={
                  <Box
                    component='span'
                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <KindDot kind={k} />
                    <b>{STOP_KIND_LABELS[k]}</b>
                    <Box component='span' sx={{ color: 'text.secondary' }}>
                      ({counts[k].toLocaleString()})
                    </Box>
                  </Box>
                }
                slotProps={{ primary: { variant: 'body1' } }}
              />
            </ListItemButton>
          </ListItem>
        );
      })}
    </List>
  );
}

/** One-line summary of what changed, for the list. */
function changeSummary(s: StopListRow): string {
  if (s.kind === 'added') return 'New stop';
  if (s.kind === 'removed') return 'Stop removed';
  const fields = s.changed
    .filter((f) => s.kind !== 'moved' || (f !== 'stop_lat' && f !== 'stop_lon'))
    .map((f) => f.replace(/^stop_/, ''));
  const parts: string[] = [];
  if (s.kind === 'moved') parts.push(`Moved ${formatDistance(s.moved_m)}`);
  if (fields.length > 0) parts.push(`${fields.join(', ')} changed`);
  return parts.join(' · ');
}

const NO_KIND_COUNTS: Record<StopKind, number> = {
  added: 0,
  removed: 0,
  modified: 0,
  moved: 0,
};

/** Legend over the stops map, as on the Routes v2 map. */
function StopsMapLegend(): React.ReactElement {
  const moved = STOP_KIND_COLORS.moved;
  return (
    <MapLegend
      items={[
        ...STOP_KINDS.map((k) => ({
          symbol: <LegendDot fill={STOP_KIND_COLORS[k]} stroke='#fff' />,
          label: STOP_KIND_LABELS[k],
        })),
        {
          symbol: (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <LegendDot fill='transparent' stroke={moved} />
              <Box
                aria-hidden
                sx={{
                  width: 16,
                  borderTop: `2px dashed ${moved}`,
                  opacity: 0.6,
                }}
              />
            </Box>
          ),
          label: 'Old position → new position',
        },
      ]}
    />
  );
}

interface StopsEntityPanelProps {
  datasetId: string;
  stopsMap: StopsMapDiff;
  /** stops.txt, levels.txt, pathways.txt counts, for the overview. */
  entityTypes: EntityTypeDiff[];
  /** Row diffs of the files that changed, as Parquet row tables. */
  rawTables: RawTable[];
  /** Cross-tab focus: a stop to select on the map. */
  focus: NavFocus | null;
}

export default function StopsEntityPanel({
  datasetId,
  stopsMap,
  entityTypes,
  rawTables,
  focus,
}: StopsEntityPanelProps): React.ReactElement {
  const nav = useDiffNav();
  const highlights = stopsMap.highlights;
  // For the selected stop's route chips.
  const routeInfo = useRouteInfo(datasetId, stopsMap.route_info_file);
  const [filters, setFilters] = useState<StopFilters>(DEFAULT_FILTERS);
  const [selection, setSelectionState] = useState<MapSelection | null>(null);
  const [flyRequest, setFlyRequest] = useState(0);
  const mapBoxRef = useRef<HTMLDivElement>(null);

  /** Select on the map and mirror the stop in the URL hash. */
  const setSelection = (next: MapSelection | null): void => {
    setSelectionState(next);
    const id = next?.stopId;
    nav?.replaceTarget(
      id ? { tab: 'stops', kind: 'stop', id } : { tab: 'stops' },
    );
  };

  // The changed stops are raw/stops.parquet joined with the stops analysis
  // (analysis/stops.parquet), built into one DuckDB table when the page loads:
  // counts, map points, the list and the selected stop are queries on it
  // (lib/map-table-query.ts). A selected stop's full stops.txt rows come
  // from raw/stops.parquet.
  const rawStops = rawTables.find((t) => t.file === 'stops.txt');
  const stops = stopsTableSource(datasetId, stopsMap.table, rawStops);
  const tableViews = (): Promise<string[]> => stops.table().then((t) => [t]);
  // The stops table and the raw one; no raw table means no changed stop.
  const stopViews = async (): Promise<string[]> => {
    const [t, r] = await Promise.all([
      stops.table(),
      rawStops ? parquetView(diffFileUrl(datasetId, rawStops.path)) : null,
    ]);
    return r == null ? [] : [t, r];
  };
  const readStop = (rows: Array<Record<string, unknown>>): StopChange | null =>
    rows[0] ? toStopChange(rows[0], stopsMap.columns) : null;
  const loadStop = async (id: string): Promise<StopChange | null> => {
    const views = await stopViews();
    if (views.length === 0) return null;
    return readStop(await runQueued(stopChangeQuery(views[0], views[1], id)));
  };
  const effective: StopFilters = {
    ...filters,
    kinds: filters.kinds.length > 0 ? filters.kinds : STOP_KINDS,
  };
  const filterKey = JSON.stringify(effective);
  const kindCountsQ = useViewsQuery(
    stops.key,
    tableViews,
    JSON.stringify({ ...filters, kinds: [] }),
    ([v]) => stopsKindCountsQuery(v, effective),
    (rows) => {
      const c = { ...NO_KIND_COUNTS };
      for (const r of rows) c[r.kind as StopKind] = Number(r.n);
      return c;
    },
  );
  const kindCounts = kindCountsQ.data ?? NO_KIND_COUNTS;
  const total = effective.kinds.reduce((n, k) => n + kindCounts[k], 0);
  const pointsQ = useViewsQuery(
    stops.key,
    tableViews,
    filterKey,
    ([v]) => stopsPointsQuery(v, effective),
    (rows) => rows.map(toStopPoint),
  );
  const points = pointsQ.data ?? [];
  const selectedId = selection?.stopId ?? null;
  const detailQ = useViewsQuery(
    selectedId && rawStops ? stops.key : null,
    stopViews,
    selectedId ?? '',
    ([s, r]) => stopChangeQuery(s, r, selectedId ?? ''),
    readStop,
  );
  const selectedStop =
    detailQ.data?.stop_id === selectedId ? detailQ.data : null;

  const fetchListRows = (
    offset: number,
    limit: number,
  ): Promise<StopListRow[]> =>
    stops
      .table()
      .then((t) => runQueued(stopsPageQuery(t, effective, offset, limit)))
      .then((rows) => rows.map(toStopListRow));

  const toggleKind = (k: StopKind): void => {
    setFilters((f) => ({
      ...f,
      kinds: f.kinds.includes(k)
        ? f.kinds.filter((x) => x !== k)
        : STOP_KINDS.filter((x) => x === k || f.kinds.includes(x)),
    }));
  };

  const selectFromList = (id: string): void => {
    setSelection({ type: 'changed', stopId: id });
    setFlyRequest((n) => n + 1);
  };

  /**
   * Select a stop on the map, fly to it and scroll the map into view. Filters
   * are only reset when they hide the stop. Resolves false for stops that
   * didn't change (only changed stops are mapped).
   */
  const revealStop = async (id: string): Promise<boolean> => {
    const changed = await loadStop(id);
    if (changed == null) return false;
    if (!points.some((p) => p.stop_id === id)) {
      setFilters({
        ...DEFAULT_FILTERS,
        hidePrecisionOnly: !isPrecisionOnly(changed, DEFAULT_FILTERS.minMoveM),
      });
    }
    setSelectionState({ type: 'changed', stopId: id });
    setFlyRequest((n) => n + 1);
    mapBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  };

  // Cross-tab focus (e.g. a stop clicked in the Routes tab, or a deep link).
  useEffect(() => {
    if (focus?.kind !== 'stop' || focus.id == null) return;
    revealStop(focus.id).catch(() => undefined);
    // Only react to new focus requests.
  }, [focus?.nonce]);

  /** "See on map" on a stops.txt row of the raw diff. */
  const seeOnMap: RowAction = {
    files: ['stops.txt'],
    label: 'See on map',
    icon: <Place fontSize='small' />,
    onClick: (identifier) => {
      const id = identifier.stop_id;
      if (!id) return;
      revealStop(id)
        .then((found) => {
          if (found) nav?.replaceTarget({ tab: 'stops', kind: 'stop', id });
        })
        .catch(() => undefined);
    },
  };

  const [showControlsMobile, setShowControlsMobile] = useState(false);
  const fullscreen = useDiffMapFullscreen();
  const [refocusRequest, setRefocusRequest] = useState(0);

  // stops.txt rows of each feed.
  const c = stopsMap.counts;
  const baseStops = c.deleted + c.modified + c.unchanged;
  const newStops = c.added + c.modified + c.unchanged;
  useReportSubtitle(
    `${baseStops.toLocaleString()} → ${newStops.toLocaleString()} stops · showing ${total.toLocaleString()} changed`,
  );

  /** Active filters, shown as removable chips above the map (as on the feed map). */
  const activeFilters: Array<{
    key: string;
    label: string;
    kind?: StopKind;
    clear: () => void;
  }> = [
    ...filters.kinds.map((k) => ({
      key: `kind-${k}`,
      label: STOP_KIND_LABELS[k],
      kind: k,
      clear: () => toggleKind(k),
    })),
    // Only set by a link to a precision-only stop (no control for it).
    ...(!filters.hidePrecisionOnly
      ? [
          {
            key: 'precision',
            label: 'Precision-only changes shown',
            clear: () => setFilters((f) => ({ ...f, hidePrecisionOnly: true })),
          },
        ]
      : []),
    ...(filters.search !== ''
      ? [
          {
            key: 'search',
            label: `Search: “${filters.search}”`,
            clear: () => setFilters((f) => ({ ...f, search: '' })),
          },
        ]
      : []),
  ];

  const clearAll = (): void => {
    setFilters(DEFAULT_FILTERS);
  };

  const renderFilterChips = (sx?: SxProps<Theme>): React.ReactElement => (
    <StyledChipFilterContainer sx={sx}>
      {activeFilters.length > 0 ? (
        <Button variant='text' size='small' onClick={clearAll}>
          Clear all
        </Button>
      ) : null}
      {activeFilters.map((f) => (
        <Chip
          key={f.key}
          color='primary'
          variant='outlined'
          size='small'
          label={f.label}
          icon={f.kind ? <KindDot kind={f.kind} /> : undefined}
          onDelete={f.clear}
          sx={{ cursor: 'pointer', '& .MuiChip-icon': { ml: 0.75 } }}
        />
      ))}
    </StyledChipFilterContainer>
  );

  return (
    <Box>
      <EntityOverviewCard
        datasetId={datasetId}
        highlights={highlights}
        highlightsFile={stopsMap.highlights_file}
        noun={() => 'stops'}
        onOpen={() =>
          nav
            ? (id) => nav.navigate({ tab: 'stops', kind: 'stop', id })
            : undefined
        }
        emptyText='Nothing concerning stood out: no served stop is removed, no stop loses accessibility or moves far.'
      />
      <DiffMapLayout
        fullscreen={fullscreen.fullscreen}
        onExitFullscreen={fullscreen.exit}
        title='Stops map'
        toolbar={renderFilterChips({
          minHeight: 0,
          py: 0,
          flexWrap: 'nowrap',
          overflowX: 'auto',
        })}
      >
        {/* Filters + stop list, laid out like the feed detail map */}
        <DiffMapControlPanel
          open={showControlsMobile}
          onClose={() => setShowControlsMobile(false)}
          mobileChips={renderFilterChips()}
        >
          <SearchHeader variant='h6' className='no-collapse'>
            Change type
          </SearchHeader>
          <KindCheckboxList
            selected={filters.kinds}
            counts={kindCounts}
            onToggle={toggleKind}
          />

          <SearchHeader variant='h6' className='no-collapse'>
            Stops
          </SearchHeader>
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              minHeight: 300,
              overflow: 'hidden',
            }}
          >
            <Typography variant='subtitle2' sx={{ m: 0 }}>
              {total.toLocaleString()} stop
              {total === 1 ? '' : 's'}
            </Typography>
            <TextField
              fullWidth
              size='small'
              placeholder='Search stops...'
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position='start'>
                      <Search fontSize='small' />
                    </InputAdornment>
                  ),
                  endAdornment: filters.search ? (
                    <InputAdornment position='end'>
                      <IconButton
                        size='small'
                        aria-label='Clear search'
                        onClick={() =>
                          setFilters((f) => ({ ...f, search: '' }))
                        }
                      >
                        <Clear fontSize='small' />
                      </IconButton>
                    </InputAdornment>
                  ) : undefined,
                },
              }}
            />
            <SegmentedList<StopListRow>
              queryKey={`${stops.key}|${filterKey}`}
              total={total}
              loading={kindCountsQ.loading}
              fetchRows={fetchListRows}
              rowKey={(s) => s.stop_id}
              emptyText='No stops match the current filters.'
              renderRow={(s) => (
                <ListItemButton
                  dense
                  selected={s.stop_id === selectedId}
                  onClick={() => {
                    selectFromList(s.stop_id);
                    setShowControlsMobile(false);
                  }}
                  sx={{ pl: 0, pr: 1, alignItems: 'flex-start', gap: 1 }}
                >
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      bgcolor: STOP_KIND_COLORS[s.kind],
                      border: '1px solid #999',
                      mt: 0.5,
                      flex: '0 0 auto',
                    }}
                  />
                  <ListItemText
                    sx={{ m: 0 }}
                    primary={`${s.stop_id} - ${s.name}`}
                    secondary={changeSummary(s)}
                    slotProps={{
                      primary: { variant: 'body2' },
                      secondary: { variant: 'caption' },
                    }}
                  />
                </ListItemButton>
              )}
            />
          </Box>
        </DiffMapControlPanel>

        {/* Active filters + map */}
        <Box
          sx={{
            width: '100%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Row under the header: the active filters, so the map below
              starts level with the filter panel. */}
          <ReportActions>
            {renderFilterChips({
              minHeight: 0,
              py: 0,
              flex: 1,
              alignSelf: 'center',
              display: { xs: 'none', md: 'flex' },
            })}
          </ReportActions>
          <DiffMapFrame
            ref={mapBoxRef}
            recenterLabel='Recenter on visible stops'
            onRecenter={() => setRefocusRequest((n) => n + 1)}
            onOpenFilters={() => setShowControlsMobile(true)}
            fullscreen={fullscreen.fullscreen}
            onToggleFullscreen={fullscreen.toggle}
          >
            <StopsDiffMap
              points={points}
              selectedStop={selectedStop}
              minMoveM={filters.minMoveM}
              columns={stopsMap.columns}
              routes={routeInfo}
              selection={selection}
              onSelect={setSelection}
              flyRequest={flyRequest}
              refocusRequest={refocusRequest}
            />
            <StopsMapLegend />
          </DiffMapFrame>
        </Box>
      </DiffMapLayout>

      <Typography
        id={RAW_DIFF_ID}
        variant='h6'
        fontWeight={700}
        sx={{ mb: 2, scrollMarginTop: 96 }}
      >
        Raw file diff
      </Typography>
      {rawTables.map((t) => (
        <RawFileDiffCard
          key={t.file}
          datasetId={datasetId}
          table={t}
          defaultOpen={t.file === 'stops.txt'}
          rowAction={seeOnMap}
        />
      ))}
    </Box>
  );
}
