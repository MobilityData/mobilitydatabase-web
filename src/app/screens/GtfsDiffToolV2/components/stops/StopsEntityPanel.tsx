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
import { Clear, Search, Place, TableRows } from '@mui/icons-material';
import React, { useEffect, useRef, useState } from 'react';
import type {
  EntityTypeDiff,
  FileDiff,
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
  stopDetailQuery,
  stopsKindCountsQuery,
  stopsPageQuery,
  stopsPointsQuery,
  toStopListRow,
  toStopPoint,
} from '../../lib/map-table-query';
import {
  mapDetailUrl,
  mapTableUrl,
  queryMapTable,
  useMapTableQuery,
} from '../../lib/useMapTable';
import SegmentedList from '../diffmap/SegmentedList';
import GtfsDiffFileDiffPanel, {
  type RowAction,
} from '../../../GtfsDiffTool/components/GtfsDiffFileDiffPanel';
import EntityOverviewCard from '../overview/EntityOverviewCard';
import { categoryFileRows } from '../../lib/file-stats';
import StopsDiffMap, { type MapSelection } from './StopsDiffMap';
import {
  DiffMapControlPanel,
  DiffMapFrame,
  DiffMapLayout,
  useDiffMapFullscreen,
} from '../diffmap/DiffMapControls';
import { type NavFocus, useDiffNav } from '../../lib/diff-nav';
import NestedCheckboxList, {
  type CheckboxStructure,
} from '../../../../components/NestedCheckboxList';
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

function Legend(): React.ReactElement {
  const dot = (color: string, hollow = false): React.ReactElement => (
    <Box
      sx={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        bgcolor: hollow ? 'transparent' : color,
        border: `2px solid ${hollow ? color : '#fff'}`,
        boxShadow: hollow ? undefined : `0 0 0 1px ${color}`,
      }}
    />
  );
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        flexWrap: 'wrap',
        alignItems: 'center',
        mt: 1.5,
      }}
    >
      {STOP_KINDS.map((k) => (
        <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {dot(STOP_KIND_COLORS[k])}
          <Typography variant='caption'>{STOP_KIND_LABELS[k]}</Typography>
        </Box>
      ))}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {dot(STOP_KIND_COLORS.moved, true)}
        <Box
          sx={{
            width: 22,
            borderTop: `2px dashed ${STOP_KIND_COLORS.moved}`,
            opacity: 0.6,
          }}
        />
        <Typography variant='caption'>Old position → new position</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {dot('#9e9e9e')}
        <Typography variant='caption'>Original feed</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {dot('#64b5f6')}
        <Typography variant='caption'>New feed</Typography>
      </Box>
    </Box>
  );
}

interface StopsEntityPanelProps {
  datasetId: string;
  stopsMap: StopsMapDiff;
  /** stops.txt, levels.txt, pathways.txt counts, for the overview. */
  entityTypes: EntityTypeDiff[];
  fileDiffs: FileDiff[];
  /** Cross-tab focus: a stop to select on the map. */
  focus: NavFocus | null;
}

export default function StopsEntityPanel({
  datasetId,
  stopsMap,
  entityTypes,
  fileDiffs,
  focus,
}: StopsEntityPanelProps): React.ReactElement {
  const nav = useDiffNav();
  const highlights = stopsMap.highlights;
  const [filters, setFilters] = useState<StopFilters>(DEFAULT_FILTERS);
  const [showBase, setShowBase] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [selection, setSelectionState] = useState<MapSelection | null>(null);
  const [flyRequest, setFlyRequest] = useState(0);
  const mapBoxRef = useRef<HTMLDivElement>(null);

  /** Select on the map and mirror the stop in the URL hash. */
  const setSelection = (next: MapSelection | null): void => {
    setSelectionState(next);
    const id =
      next == null
        ? undefined
        : next.type === 'changed'
          ? next.stopId
          : next.stop[0];
    nav?.replaceTarget(
      id ? { tab: 'stops', kind: 'stop', id } : { tab: 'stops' },
    );
  };

  // The changed stops live in maps/stops.parquet: counts, map points, the
  // list and the selected stop are DuckDB queries (lib/map-table-query.ts).
  const url = mapTableUrl(datasetId, stopsMap.table);
  const detailUrl = mapDetailUrl(datasetId, stopsMap.table);
  const effective: StopFilters = {
    ...filters,
    kinds: filters.kinds.length > 0 ? filters.kinds : STOP_KINDS,
  };
  const filterKey = JSON.stringify(effective);
  const kindCountsQ = useMapTableQuery(
    url,
    JSON.stringify({ ...filters, kinds: [] }),
    (v) => stopsKindCountsQuery(v, effective),
    (rows) => {
      const c = { ...NO_KIND_COUNTS };
      for (const r of rows) c[r.kind as StopKind] = Number(r.n);
      return c;
    },
  );
  const kindCounts = kindCountsQ.data ?? NO_KIND_COUNTS;
  const total = effective.kinds.reduce((n, k) => n + kindCounts[k], 0);
  const pointsQ = useMapTableQuery(
    url,
    filterKey,
    (v) => stopsPointsQuery(v, effective),
    (rows) => rows.map(toStopPoint),
  );
  const points = pointsQ.data ?? [];
  const selectedId = selection?.type === 'changed' ? selection.stopId : null;
  const detailQ = useMapTableQuery(
    selectedId ? detailUrl : null,
    selectedId ?? '',
    (v) => stopDetailQuery(v, selectedId ?? ''),
    (rows) =>
      rows[0] ? (JSON.parse(String(rows[0].detail)) as StopChange) : null,
  );
  const selectedStop =
    detailQ.data?.stop_id === selectedId ? detailQ.data : null;

  const fetchListRows = (
    offset: number,
    limit: number,
  ): Promise<StopListRow[]> =>
    queryMapTable(url, (v) => stopsPageQuery(v, effective, offset, limit)).then(
      (rows) => rows.map(toStopListRow),
    );

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
   * are only reset when they hide the stop. Resolves false for unknown stops.
   */
  const revealStop = async (id: string): Promise<boolean> => {
    const rows = await queryMapTable(detailUrl, (v) => stopDetailQuery(v, id));
    const changed = rows[0]
      ? (JSON.parse(String(rows[0].detail)) as StopChange)
      : null;
    if (changed) {
      if (!points.some((p) => p.stop_id === id)) {
        setFilters({
          ...DEFAULT_FILTERS,
          hidePrecisionOnly: !isPrecisionOnly(
            changed,
            DEFAULT_FILTERS.minMoveM,
          ),
        });
      }
      setSelectionState({ type: 'changed', stopId: id });
    } else {
      const inNew = stopsMap.all_stops.new.find((s) => s[0] === id);
      const inBase = stopsMap.all_stops.base.find((s) => s[0] === id);
      if (inNew) {
        setShowNew(true);
        setSelectionState({ type: 'overlay', feed: 'new', stop: inNew });
      } else if (inBase) {
        setShowBase(true);
        setSelectionState({ type: 'overlay', feed: 'base', stop: inBase });
      } else return false;
    }
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

  useReportSubtitle(
    `${stopsMap.all_stops.base.length.toLocaleString()} → ${stopsMap.all_stops.new.length.toLocaleString()} stops · showing ${total.toLocaleString()} changed`,
  );

  const visibilityCheckboxes: CheckboxStructure[] = [
    {
      title: `All original stops (${stopsMap.all_stops.base.length.toLocaleString()})`,
      type: 'checkbox',
      checked: showBase,
    },
    {
      title: `All new stops (${stopsMap.all_stops.new.length.toLocaleString()})`,
      type: 'checkbox',
      checked: showNew,
    },
  ];

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
    ...(showBase
      ? [
          {
            key: 'base',
            label: 'All original stops',
            clear: () => setShowBase(false),
          },
        ]
      : []),
    ...(showNew
      ? [
          {
            key: 'new',
            label: 'All new stops',
            clear: () => setShowNew(false),
          },
        ]
      : []),
  ];

  const clearAll = (): void => {
    setFilters(DEFAULT_FILTERS);
    setShowBase(false);
    setShowNew(false);
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
        title='Overview of stop changes'
        files={categoryFileRows(entityTypes, [], 'stops.txt')}
        highlights={highlights}
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
            Visibility
          </SearchHeader>
          <NestedCheckboxList
            checkboxData={visibilityCheckboxes}
            onCheckboxChange={(data: CheckboxStructure[]) => {
              setShowBase(data[0].checked);
              setShowNew(data[1].checked);
            }}
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
              queryKey={`${url}|${filterKey}`}
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
          {/* Row under the header: the CTA, then the active filters beside it,
              so the map below starts level with the filter panel. */}
          <ReportActions>
            <Button
              disableElevation
              variant='contained'
              endIcon={<TableRows />}
              sx={{ flexShrink: 0, alignSelf: 'center' }}
              onClick={() =>
                document
                  .getElementById(RAW_DIFF_ID)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              See Raw Diff
            </Button>
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
              allStops={stopsMap.all_stops}
              showBaseOverlay={showBase}
              showNewOverlay={showNew}
              minMoveM={filters.minMoveM}
              columns={stopsMap.columns}
              routes={stopsMap.routes}
              selection={selection}
              onSelect={setSelection}
              flyRequest={flyRequest}
              refocusRequest={refocusRequest}
            />
          </DiffMapFrame>
          <Legend />
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
      <GtfsDiffFileDiffPanel
        fileDiffs={fileDiffs}
        showActionFilter={false}
        searchable
        alwaysOpenFiles={['stops.txt']}
        rowAction={seeOnMap}
      />
    </Box>
  );
}
