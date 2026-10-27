'use client';

import {
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Fab,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Link,
  ListItemButton,
  MenuItem,
  Popover,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ChevronLeft,
  ChevronRight,
  Clear,
  FilterList,
  Fullscreen,
  FullscreenExit,
  Search,
} from '@mui/icons-material';
import { useSearchParams } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import type { RouteDetail, RoutesMapDiff } from '../../lib/entity-diff-types';
import {
  ROUTE_CHANGES,
  type RouteChange,
  type RouteSort,
  type RouteV2Filters,
  type RouteV2Overview,
  type RouteV2Row,
  routeDetailQuery,
  routesChangeCountsQuery,
  routesV2KindCountsQuery,
  routesV2OverviewQuery,
  routesV2PageQuery,
  toRouteV2Overview,
  toRouteV2Row,
} from '../../lib/map-table-query';
import { type Json, decodeDeep } from '../../lib/entity-diff-codec';
import {
  mapDetailUrl,
  mapTableUrl,
  queryMapTable,
  useMapTableQuery,
} from '../../lib/useMapTable';
import {
  ROUTE_KIND_COLORS,
  ROUTE_KIND_LABELS,
  type RouteKind,
} from '../../lib/routes-utils';
import {
  CALENDAR_SERVICES_PATH,
  DEFAULT_V2_FILTERS,
  ROUTE_CHANGE_LABELS,
  routeChanges,
  sameFilters,
} from '../../lib/routes-v2';
import { toFocusHash, useDiffNav } from '../../lib/diff-nav';
import { tripsRouteHref } from '../../lib/trips-v2-routes';
import { diffFileUrl } from '../../lib/datasets';
import SegmentedList from '../diffmap/SegmentedList';
import { useDiffMapFullscreen } from '../diffmap/DiffMapControls';
import RoutesV2Map from './RoutesV2Map';
import RouteDetailV2 from './RouteDetailV2';
import { RouteBadge } from './RouteBadge';
import { ChangeChips } from './ChangeChips';

/** Height of the site header (fixed app bar) above the workspace. */
const SITE_HEADER_PX = 64;
/** The workspace (panel and map) is at most this tall outside full screen. */
const WORKSPACE_HEIGHT = '80vh';
const PANEL_PX = 360;
/** The workspace element, scrolled to when a route is opened from elsewhere. */
export const WORKSPACE_ID = 'routes-v2-workspace';
const CHANGED_KINDS: RouteKind[] = ['added', 'removed', 'modified'];

const SORT_LABELS: Record<RouteSort, string> = {
  severity: 'Severity',
  sort_order: 'route_sort_order',
  name: 'Name',
};

const NO_KIND_COUNTS: Record<RouteKind, number> = {
  added: 0,
  removed: 0,
  modified: 0,
  unchanged: 0,
};

/** Sets or clears ?route= (a history entry when pushed, so Back undoes it). */
export function setRouteParam(
  id: string | null,
  mode: 'push' | 'replace',
): void {
  const params = new URLSearchParams(window.location.search);
  if (id == null) params.delete('route');
  else params.set('route', id);
  const qs = params.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
  if (mode === 'push') window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

/** A route's `detail` column: RouteDetail, deep-encoded (polylines). */
function readDetail(rows: Array<Record<string, unknown>>): RouteDetail | null {
  return rows[0]
    ? (decodeDeep(
        JSON.parse(String(rows[0].detail)) as Json,
      ) as unknown as RouteDetail)
    : null;
}

function rowSelector(id: string): string {
  return `[data-route-row="${CSS.escape(id)}"]`;
}

interface RoutesV2WorkspaceProps {
  datasetId: string;
  routesMap: RoutesMapDiff;
  /** Show a route's routes.txt row in the raw file diff. */
  onSeeRouteRow: (routeId: string) => void;
}

/**
 * A workspace up to 80vh high: a side panel (route
 * list, or one route's detail) and the map. The selected route is
 * ?route=<route_id>.
 */
export default function RoutesV2Workspace({
  datasetId,
  routesMap,
  onSeeRouteRow,
}: RoutesV2WorkspaceProps): React.ReactElement {
  const nav = useDiffNav();
  const selectedId = useSearchParams().get('route');
  const [filters, setFilters] = useState<RouteV2Filters>(DEFAULT_V2_FILTERS);
  const [sort, setSort] = useState<RouteSort>('severity');
  const [hoverRouteId, setHoverRouteId] = useState<string | null>(null);
  const [hoverStopId, setHoverStopId] = useState<string | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [filtersAnchor, setFiltersAnchor] = useState<HTMLElement | null>(null);
  const fullscreen = useDiffMapFullscreen();
  const listRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** The current ?route= entry was pushed from the list: Back returns to it. */
  const pushed = useRef(false);
  /** Move focus to the detail heading once the route has loaded. */
  const focusDetail = useRef(false);

  const url = mapTableUrl(datasetId, routesMap.table);
  const detailUrl = mapDetailUrl(datasetId, routesMap.table);
  const filterKey = JSON.stringify(filters);
  const overviewQ = useMapTableQuery(
    url,
    `${filterKey}|${sort}`,
    (v) => routesV2OverviewQuery(v, filters, sort),
    (rows) => rows.map(toRouteV2Overview),
  );
  const overview: RouteV2Overview[] = overviewQ.data ?? [];
  const changeCounts =
    useMapTableQuery(
      url,
      JSON.stringify({ ...filters, changes: [] }),
      (v) => routesChangeCountsQuery(v, filters),
      (rows) =>
        Object.fromEntries(
          ROUTE_CHANGES.map((c) => [c, Number(rows[0]?.[c] ?? 0)]),
        ) as Record<RouteChange, number>,
    ).data ?? null;
  const kindCounts =
    useMapTableQuery(
      url,
      JSON.stringify({ ...filters, kinds: [], showUnchanged: false }),
      (v) => routesV2KindCountsQuery(v, filters),
      (rows) => {
        const c = { ...NO_KIND_COUNTS };
        for (const r of rows) c[r.kind as RouteKind] = Number(r.n);
        return c;
      },
    ).data ?? NO_KIND_COUNTS;
  const detailQ = useMapTableQuery(
    selectedId ? detailUrl : null,
    selectedId ?? '',
    (v) => routeDetailQuery(v, selectedId ?? ''),
    readDetail,
  );
  const selected =
    selectedId != null && detailQ.data?.route_id === selectedId
      ? detailQ.data
      : null;
  const selectedShape =
    selected?.shapes?.find((sh) => sh.shape_id === selectedShapeId) ?? null;

  // ── Selection ────────────────────────────────────────────────────

  const openRoute = (id: string): void => {
    if (id === selectedId) return;
    if (selectedId == null) {
      setRouteParam(id, 'push');
      pushed.current = true;
      focusDetail.current = true;
    } else {
      // Switching routes keeps one entry: Back still returns to the list.
      setRouteParam(id, 'replace');
    }
    setSelectedShapeId(null);
    setHoverStopId(null);
    setHoverRouteId(null);
  };

  const backToList = (): void => {
    if (selectedId == null) return;
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else setRouteParam(null, 'replace');
  };

  // Focus: the heading once a route opened from the list or map is loaded;
  // its row on return (Back, Escape or the back link).
  useEffect(() => {
    if (selected == null || !focusDetail.current) return;
    focusDetail.current = false;
    headingRef.current?.focus({ preventScroll: true });
  }, [selected?.route_id]);

  const prevSelected = useRef(selectedId);
  useEffect(() => {
    const prev = prevSelected.current;
    prevSelected.current = selectedId;
    if (selectedId != null) return;
    pushed.current = false;
    setSelectedShapeId(null);
    setHoverStopId(null);
    if (prev != null)
      listRef.current?.querySelector<HTMLElement>(rowSelector(prev))?.focus();
  }, [selectedId]);

  // Escape returns to the list (menus and popovers handle it first). It runs
  // in the capture phase, before full screen's own Escape: the first press
  // closes the route, the next one leaves full screen.
  useEffect(() => {
    if (selectedId == null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('.MuiPopover-root, [role="menu"], [role="listbox"]'))
        return;
      e.preventDefault();
      backToList();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [selectedId]);

  const ids = overview.map((r) => r.route_id);
  const index = selectedId != null ? ids.indexOf(selectedId) : -1;
  const prevId = index > 0 ? ids[index - 1] : null;
  const nextId = index >= 0 && index < ids.length - 1 ? ids[index + 1] : null;

  // ── Filters ──────────────────────────────────────────────────────

  const toggleChange = (c: RouteChange): void =>
    setFilters((f) => ({
      ...f,
      changes: f.changes.includes(c)
        ? f.changes.filter((x) => x !== c)
        : ROUTE_CHANGES.filter((x) => x === c || f.changes.includes(x)),
    }));
  const toggleKind = (k: RouteKind): void =>
    setFilters((f) => ({
      ...f,
      kinds: f.kinds.includes(k)
        ? f.kinds.filter((x) => x !== k)
        : CHANGED_KINDS.filter((x) => x === k || f.kinds.includes(x)),
    }));
  const popoverCount =
    filters.changes.length +
    filters.kinds.length +
    (filters.showUnchanged ? 1 : 0);
  const agencies = routesMap.agencies ?? [];

  const fetchRows = (offset: number, limit: number): Promise<RouteV2Row[]> =>
    queryMapTable(url, (v) =>
      routesV2PageQuery(v, filters, sort, offset, limit),
    ).then((rows) => rows.map(toRouteV2Row));

  const detailShown = selectedId != null;

  return (
    <Box>
      <Box
        role={fullscreen.fullscreen ? 'dialog' : undefined}
        aria-modal={fullscreen.fullscreen ? true : undefined}
        aria-label={
          fullscreen.fullscreen ? 'Routes map, full screen' : undefined
        }
        sx={
          fullscreen.fullscreen
            ? {
                position: 'fixed',
                inset: 0,
                // Above the app bar and drawers, below menus / dialogs (1300).
                zIndex: (t) => t.zIndex.drawer + 50,
                bgcolor: 'background.paper',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                p: { xs: 1, md: 2 },
                height: '100dvh',
              }
            : undefined
        }
      >
        {fullscreen.fullscreen ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              minHeight: 40,
            }}
          >
            <Typography variant='h6' fontWeight={700} sx={{ flex: 1 }}>
              Routes map
            </Typography>
            <Button
              variant='outlined'
              size='small'
              startIcon={<FullscreenExit />}
              onClick={fullscreen.exit}
            >
              Exit full screen
            </Button>
          </Box>
        ) : null}
        <Box
          id={WORKSPACE_ID}
          sx={{
            height: fullscreen.fullscreen ? 'auto' : WORKSPACE_HEIGHT,
            flex: fullscreen.fullscreen ? 1 : undefined,
            minHeight: fullscreen.fullscreen ? 0 : 420,
            scrollMarginTop: SITE_HEADER_PX + 16,
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr)',
              md: `${PANEL_PX}px minmax(0, 1fr)`,
            },
            gridTemplateRows: {
              xs: '40% minmax(0, 1fr)',
              md: 'minmax(0, 1fr)',
            },
            gridTemplateAreas: { xs: '"map" "panel"', md: '"panel map"' },
            // Like the stops page: the panel on the page background, the
            // map framed beside it.
            gap: 2,
          }}
        >
          {/* Side panel: the list stays mounted under the detail, so its
            scroll position survives going back. */}
          <Box
            sx={{
              gridArea: 'panel',
              position: 'relative',
              minHeight: 0,
              bgcolor: 'background.paper',
              borderRadius: 1,
              overflow: 'hidden',
            }}
          >
            <Box
              ref={listRef}
              inert={detailShown}
              aria-hidden={detailShown || undefined}
              sx={{
                visibility: detailShown ? 'hidden' : 'visible',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                p: 2,
                pb: 0,
              }}
            >
              {agencies.length > 0 ? (
                <TextField
                  select
                  fullWidth
                  size='small'
                  label='Agency'
                  value={filters.agencyId ?? ''}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      agencyId: e.target.value === '' ? null : e.target.value,
                    }))
                  }
                  slotProps={{
                    select: { displayEmpty: true },
                    inputLabel: { shrink: true },
                  }}
                >
                  <MenuItem value=''>All agencies</MenuItem>
                  {agencies.map((a) => (
                    <MenuItem key={a.agency_id} value={a.agency_id}>
                      {a.name}
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  size='small'
                  placeholder='Search routes'
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, search: e.target.value }))
                  }
                  sx={{ flex: 1, minWidth: 0 }}
                  slotProps={{
                    htmlInput: { 'aria-label': 'Search routes' },
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
                <Tooltip title='Filters'>
                  <IconButton
                    aria-label='Filters'
                    aria-haspopup='dialog'
                    onClick={(e) => setFiltersAnchor(e.currentTarget)}
                  >
                    <Badge badgeContent={popoverCount} color='primary'>
                      <FilterList />
                    </Badge>
                  </IconButton>
                </Tooltip>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant='subtitle2' sx={{ flex: 1 }}>
                  {overview.length.toLocaleString()} route
                  {overview.length === 1 ? '' : 's'}
                </Typography>
                <TextField
                  select
                  size='small'
                  variant='standard'
                  value={sort}
                  onChange={(e) => setSort(e.target.value as RouteSort)}
                  slotProps={{
                    htmlInput: { 'aria-label': 'Sort routes' },
                  }}
                  sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                >
                  {(Object.keys(SORT_LABELS) as RouteSort[]).map((s) => (
                    <MenuItem key={s} value={s} sx={{ fontSize: '0.85rem' }}>
                      Sort: {SORT_LABELS[s]}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>

              <SegmentedList<RouteV2Row>
                queryKey={`${url}|${filterKey}|${sort}`}
                total={overview.length}
                loading={overviewQ.loading}
                fetchRows={fetchRows}
                rowKey={(r) => r.route_id}
                emptyText='No routes match the current filters.'
                renderRow={(r) => (
                  <ListItemButton
                    data-route-row={r.route_id}
                    selected={r.route_id === selectedId}
                    onClick={() => openRoute(r.route_id)}
                    onMouseEnter={() => setHoverRouteId(r.route_id)}
                    onMouseLeave={() => setHoverRouteId(null)}
                    onFocus={() => setHoverRouteId(r.route_id)}
                    onBlur={() => setHoverRouteId(null)}
                    sx={{
                      display: 'block',
                      px: 1,
                      py: 0.75,
                      // Clear of overlay scrollbars (macOS), drawn over content.
                      mr: 1.5,
                      borderRadius: '4px',
                      bgcolor:
                        r.route_id === hoverRouteId
                          ? 'action.hover'
                          : undefined,
                    }}
                  >
                    {/* Badge and changes on one line, the name under them. */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 1,
                        mb: 0.5,
                      }}
                    >
                      <RouteBadge
                        label={r.short_name || r.route_id}
                        color={r.color}
                        textColor={r.text_color}
                        removed={r.kind === 'removed'}
                        maxWidth={180}
                      />
                      {/* minWidth 0 lets the chips wrap instead of overflowing. */}
                      <Box
                        sx={{
                          minWidth: 0,
                          '& ul': { justifyContent: 'flex-end' },
                        }}
                      >
                        <ChangeChips changes={routeChanges(r.kind, r.flags)} />
                      </Box>
                    </Box>
                    <Typography
                      variant='body2'
                      sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        lineHeight: 1.35,
                      }}
                    >
                      {r.long_name || r.short_name || r.route_id}
                    </Typography>
                  </ListItemButton>
                )}
              />
            </Box>

            {detailShown ? (
              <Box
                role='region'
                aria-label='Route detail'
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  p: 2,
                  pb: 0,
                  bgcolor: 'background.paper',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    pb: 0.5,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Link
                    component='button'
                    type='button'
                    onClick={backToList}
                    underline='hover'
                    sx={{ fontSize: '0.875rem', fontWeight: 600 }}
                  >
                    ← {overview.length.toLocaleString()} route
                    {overview.length === 1 ? '' : 's'}
                  </Link>
                  <Box
                    sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}
                  >
                    {index >= 0 ? (
                      <Typography variant='caption' color='text.secondary'>
                        {index + 1} of {ids.length.toLocaleString()}
                      </Typography>
                    ) : null}
                    <Tooltip title='Previous route'>
                      <span>
                        <IconButton
                          size='small'
                          aria-label='Previous route'
                          disabled={prevId == null}
                          onClick={() => prevId && openRoute(prevId)}
                        >
                          <ChevronLeft />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title='Next route'>
                      <span>
                        <IconButton
                          size='small'
                          aria-label='Next route'
                          disabled={nextId == null}
                          onClick={() => nextId && openRoute(nextId)}
                        >
                          <ChevronRight />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </Box>
                <Box
                  key={selectedId}
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    pt: 2,
                    pr: 1,
                  }}
                >
                  {selected ? (
                    <RouteDetailV2
                      route={selected}
                      routesMap={routesMap}
                      routeInfo={routesMap.route_info}
                      headingRef={headingRef}
                      onHoverStop={setHoverStopId}
                      selectedShapeId={selectedShapeId}
                      onSelectShape={setSelectedShapeId}
                      onOpenService={(id) =>
                        nav?.navigate({ tab: 'calendar', kind: 'service', id })
                      }
                      tripsHref={tripsRouteHref(datasetId, selected.route_id)}
                      onSeeFieldChanges={() => onSeeRouteRow(selected.route_id)}
                      servicesUrl={diffFileUrl(
                        datasetId,
                        CALENDAR_SERVICES_PATH,
                      )}
                      onOpenCalendar={() =>
                        nav?.navigate({
                          tab: 'calendar',
                          kind: 'route',
                          id: selected.route_id,
                        })
                      }
                    />
                  ) : detailQ.loading ? (
                    <Box
                      sx={{ display: 'flex', justifyContent: 'center', py: 4 }}
                    >
                      <CircularProgress
                        size={24}
                        aria-label='Loading the route'
                      />
                    </Box>
                  ) : (
                    <Typography variant='body2' color='text.secondary'>
                      {detailQ.error
                        ? `Could not load the route: ${detailQ.error.message}`
                        : `No route “${selectedId}” in this diff.`}
                    </Typography>
                  )}
                </Box>
              </Box>
            ) : null}
          </Box>

          <Box
            sx={{
              gridArea: 'map',
              minHeight: 0,
              minWidth: 0,
              position: 'relative',
              borderRadius: '6px',
              border: '2px solid',
              borderColor: 'primary.light',
              overflow: 'hidden',
            }}
          >
            <Tooltip
              title={
                fullscreen.fullscreen ? 'Exit full screen (Esc)' : 'Full screen'
              }
            >
              <Fab
                size='small'
                aria-label={
                  fullscreen.fullscreen ? 'Exit full screen' : 'Full screen'
                }
                aria-pressed={fullscreen.fullscreen}
                onClick={fullscreen.toggle}
                sx={{ position: 'absolute', top: 10, right: 60, zIndex: 1000 }}
              >
                {fullscreen.fullscreen ? <FullscreenExit /> : <Fullscreen />}
              </Fab>
            </Tooltip>
            <RoutesV2Map
              routes={overview}
              fitKey={filterKey}
              selectedId={selectedId}
              selected={selected}
              stops={selected?.stop_info ?? {}}
              onSelectRoute={openRoute}
              hoverRouteId={hoverRouteId}
              onHoverRoute={setHoverRouteId}
              hoverStopId={hoverStopId}
              selectedShape={selectedShape}
              stopHref={(id) =>
                `/gtfs-diff-tool-v2/${datasetId}/stops${toFocusHash({ tab: 'stops', kind: 'stop', id })}`
              }
            />
          </Box>
        </Box>
      </Box>

      <Popover
        open={filtersAnchor != null}
        anchorEl={filtersAnchor}
        onClose={() => setFiltersAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-label': 'Filters',
            sx: { p: 2, width: 300 },
          },
        }}
      >
        <Typography variant='subtitle2' component='h3' sx={{ mb: 0.75 }}>
          What changed
        </Typography>
        <Box
          role='group'
          aria-label='What changed'
          sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}
        >
          {ROUTE_CHANGES.filter(
            (c) => (changeCounts?.[c] ?? 0) > 0 || filters.changes.includes(c),
          ).map((c) => {
            const on = filters.changes.includes(c);
            return (
              <Chip
                key={c}
                size='small'
                clickable
                color={on ? 'primary' : 'default'}
                variant={on ? 'filled' : 'outlined'}
                aria-pressed={on}
                label={`${ROUTE_CHANGE_LABELS[c]} ${(changeCounts?.[c] ?? 0).toLocaleString()}`}
                onClick={() => toggleChange(c)}
              />
            );
          })}
        </Box>
        <Typography variant='subtitle2' component='h3' sx={{ mb: 0.5 }}>
          Change type
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', mb: 1 }}>
          {CHANGED_KINDS.map((k) => (
            <FormControlLabel
              key={k}
              control={
                <Checkbox
                  size='small'
                  checked={filters.kinds.includes(k)}
                  onChange={() => toggleKind(k)}
                  sx={{ color: ROUTE_KIND_COLORS[k], py: 0.25 }}
                />
              }
              label={
                <Typography variant='body2'>
                  {ROUTE_KIND_LABELS[k]} ({kindCounts[k].toLocaleString()})
                </Typography>
              }
            />
          ))}
        </Box>
        <FormControlLabel
          control={
            <Switch
              size='small'
              checked={filters.showUnchanged}
              onChange={(e) =>
                setFilters((f) => ({ ...f, showUnchanged: e.target.checked }))
              }
            />
          }
          label={
            <Typography variant='body2'>
              Unchanged routes ({kindCounts.unchanged.toLocaleString()})
            </Typography>
          }
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
          <Button
            size='small'
            disabled={sameFilters(filters, DEFAULT_V2_FILTERS)}
            onClick={() => setFilters(DEFAULT_V2_FILTERS)}
          >
            Reset all filters
          </Button>
        </Box>
      </Popover>
    </Box>
  );
}
