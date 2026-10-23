'use client';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  IconButton,
  InputAdornment,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import { Clear, ExpandMore, Place, Search } from '@mui/icons-material';
import React, { useEffect, useRef, useState } from 'react';
import type {
  EntityTypeDiff,
  FileDiff,
  RawTable,
  RouteDetail,
  RouteFlag,
  RoutesMapDiff,
} from '../../lib/entity-diff-types';
import {
  ROUTE_FLAGS,
  ROUTE_FLAG_LABELS,
  ROUTE_KIND_COLORS,
  ROUTE_KIND_LABELS,
  type RouteKind,
  routeKind,
} from '../../lib/routes-utils';
import {
  type RouteListRow,
  type RouteTableFilters,
  routeDetailQuery,
  routeOfShapeQuery,
  routesFlagCountsQuery,
  routesKindCountsQuery,
  routesOverviewQuery,
  routesPageQuery,
  toRouteListRow,
  toRouteOverview,
} from '../../lib/map-table-query';
import { type Json, decodeDeep } from '../../lib/entity-diff-codec';
import {
  mapDetailUrl,
  mapTableUrl,
  queryMapTable,
  useMapTableQuery,
} from '../../lib/useMapTable';
import SegmentedList from '../diffmap/SegmentedList';
import { type NavFocus, useDiffNav } from '../../lib/diff-nav';
import GtfsDiffFileDiffPanel, {
  type RowAction,
} from '../../../GtfsDiffTool/components/GtfsDiffFileDiffPanel';
import NestedCheckboxList, {
  type CheckboxStructure,
} from '../../../../components/NestedCheckboxList';
import { SearchHeader } from '../../../../styles/Filters.styles';
import GenericEntityPanel from '../GenericEntityPanel';
import { RouteChip } from '../calendar/shared';
import { ReportActions, useReportSubtitle } from '../report/ReportLayout';
import {
  type ActiveFilter,
  ActiveFilterChips,
  ColorCheckboxList,
  ColorDot,
  DiffMapControlPanel,
  DiffMapFrame,
  DiffMapLayout,
  INLINE_CHIPS_SX,
  RAW_DIFF_ID,
  SeeRawDiffButton,
  useDiffMapFullscreen,
} from '../diffmap/DiffMapControls';
import EntityOverviewCard from '../overview/EntityOverviewCard';
import { categoryFileRows } from '../../lib/file-stats';
import RoutesDiffMap from './RoutesDiffMap';
import RouteDetails from './RouteDetails';
import UnusedShapes from './UnusedShapes';
import RawDiffTable from '../raw/RawDiffTable';

const SHAPES_RAW_ID = 'shapes-raw-diff';

/** Change types offered as filters; unchanged routes are a visibility option. */
const CHANGED_KINDS: RouteKind[] = ['added', 'removed', 'modified'];

interface Filters {
  /** Selected change types; none selected shows every changed route. */
  kinds: RouteKind[];
  /** Routes having any of these changes; empty = no restriction. */
  flags: RouteFlag[];
  search: string;
  showUnchanged: boolean;
}

const DEFAULT_FILTERS: Filters = {
  kinds: [],
  flags: [],
  search: '',
  showUnchanged: false,
};

function effectiveKinds(f: Filters): RouteKind[] {
  const kinds = f.kinds.length > 0 ? f.kinds : CHANGED_KINDS;
  return f.showUnchanged ? [...kinds, 'unchanged'] : kinds;
}

const NO_KIND_COUNTS: Record<RouteKind, number> = {
  added: 0,
  removed: 0,
  modified: 0,
  unchanged: 0,
};

/** A route's `detail` column: RouteDetail, deep-encoded (polylines). */
function readDetail(rows: Array<Record<string, unknown>>): RouteDetail | null {
  return rows[0]
    ? (decodeDeep(
        JSON.parse(String(rows[0].detail)) as Json,
      ) as unknown as RouteDetail)
    : null;
}

function Legend({
  selected,
  shapeSelected,
  thresholdM,
}: {
  selected: boolean;
  shapeSelected: boolean;
  thresholdM: number;
}): React.ReactElement {
  const swatch = (
    color: string,
    dashed = false,
    halo = false,
  ): React.ReactElement => (
    <Box
      sx={{
        width: 24,
        height: halo ? 8 : 0,
        borderTop: halo
          ? undefined
          : `3px ${dashed ? 'dashed' : 'solid'} ${color}`,
        bgcolor: halo ? color : undefined,
        opacity: halo ? 0.35 : 1,
        borderRadius: halo ? '4px' : undefined,
      }}
    />
  );
  const item = (el: React.ReactElement, label: string): React.ReactElement => (
    <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {el}
      <Typography variant='caption'>{label}</Typography>
    </Box>
  );
  const dot = (fill: string, stroke: string): React.ReactElement => (
    <Box
      sx={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        bgcolor: fill,
        border: `2px solid ${stroke}`,
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
      {selected ? (
        <>
          {item(swatch('#616161', true), 'Old path')}
          {item(swatch('#1565c0'), 'New path')}
          {item(dot('#2e7d32', '#fff'), 'Stop added to route')}
          {item(dot('#d32f2f', '#fff'), 'Stop removed from route')}
          {item(dot('#fff', '#1565c0'), 'Stop kept')}
          {shapeSelected && item(swatch('#7b1fa2'), 'Selected shape')}
          {shapeSelected &&
            item(swatch('#7b1fa2', true), 'Selected shape, before')}
        </>
      ) : (
        [...CHANGED_KINDS, 'unchanged' as const].map((k) =>
          item(
            swatch(ROUTE_KIND_COLORS[k], k === 'removed'),
            ROUTE_KIND_LABELS[k],
          ),
        )
      )}
      {item(swatch('#2e7d32', false, true), 'New path section')}
      {item(swatch('#d32f2f', false, true), 'Abandoned path section')}
      <Typography variant='caption' color='text.secondary'>
        Path changes under {thresholdM} m are ignored.
      </Typography>
    </Box>
  );
}

interface RoutesEntityPanelProps {
  datasetId: string;
  routesMap: RoutesMapDiff;
  /** Other files of the category (networks, areas, …) shown as tables when present. */
  entityTypes: EntityTypeDiff[];
  fileDiffs: FileDiff[];
  /** Parquet row tables of the category (shapes.txt). */
  rawTables: RawTable[];
  focus: NavFocus | null;
}

export default function RoutesEntityPanel({
  datasetId,
  routesMap,
  entityTypes,
  fileDiffs,
  rawTables,
  focus,
}: RoutesEntityPanelProps): React.ReactElement {
  const nav = useDiffNav();
  const highlights = routesMap.highlights;
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [stopFlyRequest, setStopFlyRequest] = useState(0);
  const [refocusRequest, setRefocusRequest] = useState(0);
  const [showControlsMobile, setShowControlsMobile] = useState(false);
  const fullscreen = useDiffMapFullscreen();
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  /** Shape whose rows the raw shapes.txt table is scoped to (remounts it). */
  const [rawShapeFilter, setRawShapeFilter] = useState<{
    shapeId: string;
    nonce: number;
  } | null>(null);
  const [rawShapesOpen, setRawShapesOpen] = useState(false);
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const thresholdM = routesMap.path_change_threshold_m;
  const sameM = routesMap.shape_same_m ?? 2;
  const shapesTable = rawTables.find((t) => t.file === 'shapes.txt') ?? null;

  // Routes live in maps/routes.parquet: counts, the overview lines, the
  // list and the selected route are DuckDB queries (lib/map-table-query.ts).
  const url = mapTableUrl(datasetId, routesMap.table);
  const detailUrl = mapDetailUrl(datasetId, routesMap.table);
  const tableFilters: RouteTableFilters = {
    kinds: effectiveKinds(filters),
    flags: filters.flags,
    search: filters.search,
  };
  const filterKey = JSON.stringify(tableFilters);
  const kindCountsQ = useMapTableQuery(
    url,
    JSON.stringify([filters.flags, filters.search]),
    (v) => routesKindCountsQuery(v, tableFilters),
    (rows) => {
      const c = { ...NO_KIND_COUNTS };
      for (const r of rows) c[r.kind as RouteKind] = Number(r.n);
      return c;
    },
  );
  const kindCounts = kindCountsQ.data ?? NO_KIND_COUNTS;
  const flagCounts =
    useMapTableQuery(
      url,
      JSON.stringify([tableFilters.kinds, filters.search]),
      (v) => routesFlagCountsQuery(v, tableFilters),
      (rows) =>
        Object.fromEntries(
          ROUTE_FLAGS.map((f) => [f, Number(rows[0]?.[f] ?? 0)]),
        ) as Record<RouteFlag, number>,
    ).data ??
    (Object.fromEntries(ROUTE_FLAGS.map((f) => [f, 0])) as Record<
      RouteFlag,
      number
    >);
  const overviewQ = useMapTableQuery(
    url,
    filterKey,
    (v) => routesOverviewQuery(v, tableFilters),
    (rows) => rows.map(toRouteOverview),
  );
  const overview = overviewQ.data ?? [];
  const detailQ = useMapTableQuery(
    selectedId ? detailUrl : null,
    selectedId ?? '',
    (v) => routeDetailQuery(v, selectedId ?? ''),
    readDetail,
  );
  const selected =
    detailQ.data?.route_id === selectedId ? (detailQ.data ?? null) : null;
  const selectedShape =
    selected?.shapes?.find((sh) => sh.shape_id === selectedShapeId) ?? null;
  const routeInfo = routesMap.route_info;
  const fetchListRows = (
    offset: number,
    limit: number,
  ): Promise<RouteListRow[]> =>
    queryMapTable(url, (v) =>
      routesPageQuery(v, tableFilters, offset, limit),
    ).then((rows) => rows.map(toRouteListRow));

  const { counts } = routesMap;
  const totalRoutes =
    counts.added + counts.deleted + counts.modified + counts.unchanged;
  const baseCount = totalRoutes - counts.added;
  const newCount = totalRoutes - counts.deleted;
  const visibleCount = tableFilters.kinds.reduce(
    (n, k) => n + kindCounts[k],
    0,
  );
  const visibleChanged = tableFilters.kinds
    .filter((k) => k !== 'unchanged')
    .reduce((n, k) => n + kindCounts[k], 0);
  useReportSubtitle(
    `${baseCount.toLocaleString()} → ${newCount.toLocaleString()} routes · showing ${visibleChanged.toLocaleString()} changed${
      filters.showUnchanged
        ? ` + ${(visibleCount - visibleChanged).toLocaleString()} unchanged`
        : ''
    }`,
  );

  const selectRoute = (id: string | null): void => {
    setSelectedId(id);
    setSelectedStopId(null);
    setSelectedShapeId(null);
    setRawShapeFilter(null);
    nav?.replaceTarget(
      id ? { tab: 'routes', kind: 'route', id } : { tab: 'routes' },
    );
  };

  const selectShape = (shapeId: string | null): void => {
    setSelectedShapeId(shapeId);
    setSelectedStopId(null);
    if (selectedId == null) return;
    nav?.replaceTarget(
      shapeId
        ? { tab: 'routes', kind: 'shape', id: shapeId }
        : { tab: 'routes', kind: 'route', id: selectedId },
    );
    if (shapeId)
      mapBoxRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
  };

  /** Open the raw shapes.txt table scoped to one shape. */
  const viewShapeRows = (shapeId: string): void => {
    setRawShapeFilter((f) => ({ shapeId, nonce: (f?.nonce ?? 0) + 1 }));
    setRawShapesOpen(true);
    // Let the accordion expand before scrolling to it.
    window.setTimeout(
      () =>
        document
          .getElementById(SHAPES_RAW_ID)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      150,
    );
  };

  const selectStop = (id: string | null, fly = false): void => {
    setSelectedStopId(id);
    if (fly && id) {
      setStopFlyRequest((n) => n + 1);
      mapBoxRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  };

  /**
   * Select a route and scroll the map into view (the map fits the selected
   * route). Filters are only reset when they hide it. Resolves to the
   * route's detail, or null for an unknown route.
   */
  const revealRoute = async (id: string): Promise<RouteDetail | null> => {
    const route = readDetail(
      await queryMapTable(detailUrl, (v) => routeDetailQuery(v, id)),
    );
    if (route == null) return null;
    if (!overview.some((r) => r.route_id === id)) {
      setFilters({
        ...DEFAULT_FILTERS,
        showUnchanged: routeKind(route) === 'unchanged',
      });
    }
    setSelectedId(id);
    setSelectedStopId(null);
    setSelectedShapeId(null);
    setRawShapeFilter(null);
    mapBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return route;
  };

  /** Reveal the route a shape belongs to, with the shape selected. */
  const revealShape = async (id: string): Promise<void> => {
    const owner = await queryMapTable(url, (v) => routeOfShapeQuery(v, id));
    const route = owner[0]
      ? await revealRoute(String(owner[0].route_id))
      : null;
    if (route) {
      const sh = route.shapes?.find(
        (x) => x.shape_id === id || x.renamed_from === id,
      );
      setSelectedShapeId(sh?.shape_id ?? null);
    } else if (routesMap.unused_shapes?.some((sh) => sh.shape_id === id)) {
      document
        .getElementById('unused-shapes')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Cross-tab focus (a route chip or shape link clicked elsewhere, or a deep link).
  useEffect(() => {
    if (focus?.id == null) return;
    if (focus.kind === 'route') {
      revealRoute(focus.id).catch(() => undefined);
    } else if (focus.kind === 'shape') {
      // The route whose new trips use it, else one that used it before.
      revealShape(focus.id).catch(() => undefined);
    }
    // Only react to new focus requests.
  }, [focus?.nonce]);

  /** "See on map" on a routes.txt row of the raw diff. */
  const seeOnMap: RowAction = {
    files: ['routes.txt'],
    label: 'See on map',
    icon: <Place fontSize='small' />,
    onClick: (identifier) => {
      const id = identifier.route_id;
      if (!id) return;
      revealRoute(id)
        .then((route) => {
          if (route) nav?.replaceTarget({ tab: 'routes', kind: 'route', id });
        })
        .catch(() => undefined);
    },
  };

  const toggleKind = (k: RouteKind): void =>
    setFilters((f) => ({
      ...f,
      kinds: f.kinds.includes(k)
        ? f.kinds.filter((x) => x !== k)
        : CHANGED_KINDS.filter((x) => x === k || f.kinds.includes(x)),
    }));

  const flagCheckboxes: CheckboxStructure[] = ROUTE_FLAGS.filter(
    (f) => flagCounts[f] > 0 || filters.flags.includes(f),
  ).map((f) => ({
    title: `${ROUTE_FLAG_LABELS[f]} (${flagCounts[f].toLocaleString()})`,
    type: 'checkbox',
    checked: filters.flags.includes(f),
    props: { flag: f },
  }));

  const activeFilters: ActiveFilter[] = [
    ...filters.kinds.map((k) => ({
      key: `kind-${k}`,
      label: ROUTE_KIND_LABELS[k],
      color: ROUTE_KIND_COLORS[k],
      clear: () => toggleKind(k),
    })),
    ...filters.flags.map((fl) => ({
      key: `flag-${fl}`,
      label: `${ROUTE_FLAG_LABELS[fl]} changed`,
      clear: () =>
        setFilters((f) => ({ ...f, flags: f.flags.filter((x) => x !== fl) })),
    })),
    ...(filters.showUnchanged
      ? [
          {
            key: 'unchanged',
            label: 'Unchanged routes',
            color: ROUTE_KIND_COLORS.unchanged,
            clear: () => setFilters((f) => ({ ...f, showUnchanged: false })),
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
  const clearAll = (): void => setFilters(DEFAULT_FILTERS);
  // shapes.txt is shown per route (RouteShapes) and in its own raw table.
  const otherEntityTypes = entityTypes.filter(
    (et) => et.file !== 'routes.txt' && et.file !== 'shapes.txt',
  );

  return (
    <Box>
      <EntityOverviewCard
        title='Overview of route changes'
        files={categoryFileRows(entityTypes, rawTables, 'routes.txt')}
        highlights={highlights}
        noun={(h) => (h.id === 'unused_shapes' ? 'shapes' : 'routes')}
        onOpen={(h) =>
          nav && h.id !== 'unused_shapes'
            ? (id) => nav.navigate({ tab: 'routes', kind: 'route', id })
            : undefined
        }
        emptyText='Nothing concerning stood out: no route is removed, changes mode, drops stops or is re-routed.'
      />
      {/* Row under the header: the CTA, then the active filters beside it,
          so the map below starts level with the filter panel. */}
      <ReportActions>
        <SeeRawDiffButton />
        <ActiveFilterChips
          filters={activeFilters}
          onClearAll={clearAll}
          sx={INLINE_CHIPS_SX}
        />
      </ReportActions>

      <DiffMapLayout
        fullscreen={fullscreen.fullscreen}
        onExitFullscreen={fullscreen.exit}
        title='Routes map'
        toolbar={
          <ActiveFilterChips
            filters={activeFilters}
            onClearAll={clearAll}
            sx={INLINE_CHIPS_SX}
          />
        }
      >
        {/* Filters + route list, laid out like the feed detail map */}
        <DiffMapControlPanel
          open={showControlsMobile}
          onClose={() => setShowControlsMobile(false)}
          mobileChips={
            <ActiveFilterChips filters={activeFilters} onClearAll={clearAll} />
          }
        >
          <SearchHeader variant='h6' className='no-collapse'>
            Change type
          </SearchHeader>
          <ColorCheckboxList
            options={CHANGED_KINDS.map((k) => ({
              key: k,
              label: ROUTE_KIND_LABELS[k],
              color: ROUTE_KIND_COLORS[k],
              count: kindCounts[k],
            }))}
            selected={filters.kinds}
            onToggle={toggleKind}
          />

          {flagCheckboxes.length > 0 ? (
            <>
              <SearchHeader variant='h6' className='no-collapse'>
                What changed
              </SearchHeader>
              <NestedCheckboxList
                checkboxData={flagCheckboxes}
                onCheckboxChange={(data: CheckboxStructure[]) => {
                  const flags = data
                    .filter((d) => d.checked)
                    .map((d) => d.props?.flag as RouteFlag);
                  setFilters((f) => ({
                    ...f,
                    flags: ROUTE_FLAGS.filter((fl) => flags.includes(fl)),
                  }));
                }}
              />
            </>
          ) : null}

          <SearchHeader variant='h6' className='no-collapse'>
            Visibility
          </SearchHeader>
          <NestedCheckboxList
            checkboxData={[
              {
                title: `Unchanged routes (${kindCounts.unchanged.toLocaleString()})`,
                type: 'checkbox',
                checked: filters.showUnchanged,
              },
            ]}
            onCheckboxChange={(data: CheckboxStructure[]) =>
              setFilters((f) => ({ ...f, showUnchanged: data[0].checked }))
            }
          />

          <SearchHeader variant='h6' className='no-collapse'>
            Routes
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
              {visibleCount.toLocaleString()} route
              {visibleCount === 1 ? '' : 's'}
            </Typography>
            <TextField
              fullWidth
              size='small'
              placeholder='Search routes...'
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
            <SegmentedList<RouteListRow>
              queryKey={`${url}|${filterKey}`}
              total={visibleCount}
              loading={kindCountsQ.loading}
              fetchRows={fetchListRows}
              rowKey={(r) => r.route_id}
              emptyText='No routes match the current filters.'
              renderRow={(r) => (
                <ListItemButton
                  dense
                  selected={r.route_id === selectedId}
                  onClick={() => {
                    selectRoute(r.route_id === selectedId ? null : r.route_id);
                    setShowControlsMobile(false);
                  }}
                  sx={{ pl: 0, pr: 1, alignItems: 'flex-start', gap: 1 }}
                >
                  <Box sx={{ mt: 0.5 }}>
                    <ColorDot color={ROUTE_KIND_COLORS[r.kind]} />
                  </Box>
                  <ListItemText
                    sx={{ m: 0, minWidth: 0 }}
                    primary={
                      <Box
                        component='span'
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.75,
                        }}
                      >
                        <RouteChip
                          routeId={r.route_id}
                          route={{
                            short_name: r.short_name,
                            long_name: r.long_name,
                            color: r.color,
                            text_color: r.text_color,
                            presence: r.kind === 'removed' ? 'base' : 'both',
                          }}
                          linked={false}
                        />
                        <Box
                          component='span'
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {r.long_name}
                        </Box>
                      </Box>
                    }
                    secondary={r.summary}
                    slotProps={{
                      primary: { variant: 'body2', component: 'div' },
                      secondary: { variant: 'caption' },
                    }}
                  />
                </ListItemButton>
              )}
            />
          </Box>
        </DiffMapControlPanel>

        {/* Map */}
        <Box
          sx={{
            width: '100%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <DiffMapFrame
            ref={mapBoxRef}
            recenterLabel='Recenter on the selected or visible routes'
            onRecenter={() => setRefocusRequest((n) => n + 1)}
            onOpenFilters={() => setShowControlsMobile(true)}
            fullscreen={fullscreen.fullscreen}
            onToggleFullscreen={fullscreen.toggle}
          >
            <RoutesDiffMap
              routes={overview}
              selected={selected}
              stops={selected?.stop_info ?? {}}
              onSelectRoute={selectRoute}
              selectedStopId={selectedStopId}
              onSelectStop={(id) => selectStop(id)}
              stopFlyRequest={stopFlyRequest}
              refocusRequest={refocusRequest}
              onOpenStop={(id) =>
                nav?.navigate({ tab: 'stops', kind: 'stop', id })
              }
              selectedShape={selectedShape}
            />
          </DiffMapFrame>
          <Legend
            selected={selected != null}
            shapeSelected={selectedShape != null}
            thresholdM={routesMap.path_change_threshold_m}
          />
        </Box>
      </DiffMapLayout>

      {selected ? (
        <RouteDetails
          route={selected}
          stops={selected.stop_info}
          onClose={() => selectRoute(null)}
          onStopClick={(id) => selectStop(id, true)}
          routeInfo={routeInfo}
          thresholdM={thresholdM}
          sameM={sameM}
          selectedShapeId={selectedShapeId}
          onSelectShape={selectShape}
          onViewShapeRows={shapesTable ? viewShapeRows : undefined}
        />
      ) : (
        <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
          {selectedId
            ? 'Loading the route…'
            : 'Select a route on the map or in the list to see its stop sequence, trips and services.'}
        </Typography>
      )}

      {(routesMap.unused_shapes?.length ?? 0) > 0 && (
        <UnusedShapes
          shapes={routesMap.unused_shapes ?? []}
          sameM={sameM}
          thresholdM={thresholdM}
        />
      )}

      {otherEntityTypes.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant='h6' fontWeight={700} sx={{ mb: 2 }}>
            Networks & areas
          </Typography>
          <GenericEntityPanel entityTypes={otherEntityTypes} />
        </Box>
      )}

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
        alwaysOpenFiles={['routes.txt']}
        rowAction={seeOnMap}
      />

      {shapesTable && (
        <Accordion
          id={SHAPES_RAW_ID}
          expanded={rawShapesOpen}
          onChange={(_, open) => setRawShapesOpen(open)}
          disableGutters
          variant='outlined'
          slotProps={{ transition: { unmountOnExit: true } }}
          sx={{
            mt: 2,
            scrollMarginTop: 96,
            borderRadius: '6px',
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box>
              <Typography
                fontWeight={700}
                sx={{ fontFamily: 'var(--font-ibm-plex-mono)' }}
              >
                shapes.txt
              </Typography>
              <Typography variant='caption' color='text.secondary'>
                {shapesTable.rows.toLocaleString()} rows ·{' '}
                {(
                  shapesTable.counts.added +
                  shapesTable.counts.deleted +
                  shapesTable.counts.modified
                ).toLocaleString()}{' '}
                changed
                {rawShapeFilter
                  ? ` · showing ${rawShapeFilter.shapeId}`
                  : selectedId
                    ? ` · showing route ${selected?.short_name || selectedId}`
                    : ''}
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <RawDiffTable
              key={`${rawShapeFilter?.nonce ?? 0}-${selectedId ?? ''}`}
              datasetId={datasetId}
              file='shapes.txt'
              keyLabel='shape_id'
              initialFilters={
                rawShapeFilter
                  ? { tripId: rawShapeFilter.shapeId }
                  : { routeId: selectedId }
              }
            />
          </AccordionDetails>
        </Accordion>
      )}
    </Box>
  );
}
