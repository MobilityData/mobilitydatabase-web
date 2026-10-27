'use client';

import * as React from 'react';
import MapGL, {
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
  NavigationControl,
  Popup,
  Source,
} from 'react-map-gl/maplibre';
import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Box, ButtonBase, Link as MuiLink, Typography } from '@mui/material';
import { useMapConfig } from '../../../../hooks/useMapConfig';
import { Link as IntlLink } from '../../../../../i18n/navigation';
import { MONO_FONT } from '../calendar/shared';
import type {
  LonLat,
  RouteImpact,
  RouteShapeDiff,
  RouteStopInfo,
} from '../../lib/entity-diff-types';
import {
  STOP_RELATION_COLORS,
  STOP_RELATION_LABELS,
  SHAPE_STATUS_COLORS,
  routeBounds,
  routeStops,
  shapeBounds,
} from '../../lib/routes-utils';
import {
  type RouteV2Overview,
  overviewBounds,
} from '../../lib/map-table-query';
import { OVERVIEW_STYLES, overviewCategory } from '../../lib/routes-v2';
import { RouteBadge } from './RouteBadge';
import MapLegend, {
  type LegendItem,
  LegendDot,
  LegendLine,
} from '../diffmap/MapLegend';

const ROUTES_SRC = 'v2-routes';
const STOPS_SRC = 'v2-stops';
const HIT_LAYER = 'v2-routes-hit';
const STOPS_LAYER = 'v2-stops';
const INTERACTIVE_LAYERS = [HIT_LAYER, STOPS_LAYER];
/** Accent for the selected shape, distinct from route and change colors. */
const SHAPE_ACCENT = SHAPE_STATUS_COLORS.rerouted;
const FIT = { padding: 60, maxZoom: 15, duration: 600 };

type Feature = GeoJSON.Feature<
  GeoJSON.Geometry,
  Record<string, string | number | boolean>
>;

function collection(features: Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features };
}

function line(coords: LonLat[], properties: Feature['properties']): Feature {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties,
  };
}

const CAT = ['get', 'cat'] as unknown as ExpressionSpecification;
const HOVER: ExpressionSpecification = [
  'boolean',
  ['feature-state', 'hover'],
  false,
];
const SELECTED: ExpressionSpecification = [
  'boolean',
  ['feature-state', 'selected'],
  false,
];

const categoryColorExpr: ExpressionSpecification = [
  'match',
  CAT,
  'major',
  OVERVIEW_STYLES.major.color,
  'added',
  OVERVIEW_STYLES.added.color,
  'removed',
  OVERVIEW_STYLES.removed.color,
  OVERVIEW_STYLES.minor.color,
];
const categoryWidthExpr: ExpressionSpecification = [
  'match',
  CAT,
  'major',
  OVERVIEW_STYLES.major.width,
  'added',
  OVERVIEW_STYLES.added.width,
  'removed',
  OVERVIEW_STYLES.removed.width,
  OVERVIEW_STYLES.minor.width,
];
/** Other routes while one is selected: thin and grey (opacity alone adds up where routes share streets). */
const DIMMED_COLOR = '#9e9e9e';
const DIMMED_WIDTH = 1.25;

/** Line colour; dimmed routes turn grey, a hovered one keeps its colour. */
function categoryColor(dimmed: boolean): ExpressionSpecification {
  return dimmed
    ? ['case', HOVER, categoryColorExpr, DIMMED_COLOR]
    : categoryColorExpr;
}

function categoryWidth(dimmed: boolean): ExpressionSpecification {
  return [
    'case',
    HOVER,
    ['+', categoryWidthExpr, 2.5],
    dimmed ? DIMMED_WIDTH : categoryWidthExpr,
  ];
}

/** Overview opacity: the selected route is drawn by its own layers; others dim. */
function categoryOpacity(dimmed: boolean): ExpressionSpecification {
  return [
    'case',
    SELECTED,
    0,
    HOVER,
    1,
    dimmed ? 0.35 : ['match', CAT, 'minor', 0.75, 0.9],
  ];
}

interface Camera {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

interface RoutesV2MapProps {
  /** Routes matching the filters, in list order (unchanged ones aren't drawn). */
  routes: RouteV2Overview[];
  /** Re-fits the overview when it changes and nothing is selected. */
  fitKey: string;
  selectedId: string | null;
  /** The selected route's detail, once loaded. */
  selected: RouteImpact | null;
  stops: Record<string, RouteStopInfo>;
  onSelectRoute: (routeId: string) => void;
  hoverRouteId: string | null;
  onHoverRoute: (routeId: string | null) => void;
  /** A stop hovered in the detail's stop strip. */
  hoverStopId: string | null;
  selectedShape: RouteShapeDiff | null;
  /** The stops page focused on a stop (the stop popup's link). */
  stopHref: (stopId: string) => string;
}

/**
 * The routes v2 map: every matching route styled by its kind of change,
 * hover and selection through feature-state (sources and layers are never
 * re-created), the selected route's diff on top, and the legend as an
 * overlay.
 */
export default function RoutesV2Map({
  routes,
  fitKey,
  selectedId,
  selected,
  stops,
  onSelectRoute,
  hoverRouteId,
  onHoverRoute,
  hoverStopId,
  selectedShape,
  stopHref,
}: RoutesV2MapProps): React.ReactElement {
  const mapCfg = useMapConfig();
  const mapRef = React.useRef<MapRef>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [cursor, setCursor] = React.useState('');
  /** Several routes under a click: pick one. */
  const [pick, setPick] = React.useState<{
    lngLat: LonLat;
    ids: string[];
  } | null>(null);
  const [stopPopup, setStopPopup] = React.useState<string | null>(null);

  const mapStyle = React.useMemo<StyleSpecification>(
    () => ({
      version: 8,
      sources: {
        'raster-tiles': {
          type: 'raster',
          tiles: [mapCfg.basemapTileUrl],
          tileSize: 256,
          attribution: mapCfg.basemapAttribution,
        },
      },
      layers: [
        {
          id: 'basemap',
          type: 'raster',
          source: 'raster-tiles',
          minzoom: 0,
          maxzoom: 22,
        },
      ],
    }),
    [mapCfg.basemapTileUrl, mapCfg.basemapAttribution],
  );

  // ── GeoJSON ──────────────────────────────────────────────────────

  const byId = React.useMemo(
    () => new Map(routes.map((r) => [r.route_id, r])),
    [routes],
  );

  /** One feature per drawn route; its numeric id is its index in `routes`. */
  const overview = React.useMemo(() => {
    const features: Feature[] = [];
    routes.forEach((r, i) => {
      const cat = overviewCategory(r.kind, r.flags);
      if (cat === 'unchanged' || r.lines.length === 0) return;
      features.push({
        type: 'Feature',
        id: i,
        geometry: { type: 'MultiLineString', coordinates: r.lines },
        properties: { route_id: r.route_id, cat },
      });
    });
    return collection(features);
  }, [routes]);

  const featureIdOf = React.useMemo(
    () => new Map(routes.map((r, i) => [r.route_id, i])),
    [routes],
  );

  const diverge = React.useMemo(() => {
    const features: Feature[] = [];
    const add = (d: { added: LonLat[][]; removed: LonLat[][] }): void => {
      for (const g of d.added) features.push(line(g, { kind: 'added' }));
      for (const g of d.removed) features.push(line(g, { kind: 'removed' }));
    };
    if (selectedShape) add(selectedShape.diverge);
    else for (const d of selected?.directions ?? []) add(d.diverge);
    return collection(features);
  }, [selected, selectedShape]);

  const selectedLines = React.useMemo(() => {
    const base: Feature[] = [];
    const next: Feature[] = [];
    for (const d of selected?.directions ?? []) {
      if (d.geometry.base && d.geometry.base.length > 1)
        base.push(line(d.geometry.base, {}));
      if (d.geometry.new && d.geometry.new.length > 1)
        next.push(line(d.geometry.new, {}));
    }
    return { base: collection(base), new: collection(next) };
  }, [selected]);

  const shapeLines = React.useMemo(() => {
    const g = selectedShape?.geometry;
    return {
      base: collection(g?.base && g.base.length > 1 ? [line(g.base, {})] : []),
      new: collection(g?.new && g.new.length > 1 ? [line(g.new, {})] : []),
    };
  }, [selectedShape]);

  const routeColor = selected?.color
    ? `#${selected.color}`
    : mapCfg.primaryMain;

  const routeStopList = React.useMemo(
    () => (selected ? routeStops(selected) : []),
    [selected],
  );
  const stopFeatures = React.useMemo(() => {
    const features: Feature[] = [];
    routeStopList.forEach(({ stop_id: id, relation }, i) => {
      const s = stops[id];
      if (s == null) return;
      features.push({
        type: 'Feature',
        id: i,
        geometry: { type: 'Point', coordinates: s.coord },
        properties: {
          stop_id: id,
          fill: STOP_RELATION_COLORS[relation],
          stroke: relation === 'kept' ? routeColor : '#ffffff',
        },
      });
    });
    return collection(features);
  }, [routeStopList, stops, routeColor]);

  // ── Feature-state: hover and selection ───────────────────────────

  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!loaded || map?.getSource(ROUTES_SRC) == null) return;
    map.removeFeatureState({ source: ROUTES_SRC });
    const sel = selectedId != null ? featureIdOf.get(selectedId) : undefined;
    if (sel != null)
      map.setFeatureState({ source: ROUTES_SRC, id: sel }, { selected: true });
    const hov =
      hoverRouteId != null && selectedId == null
        ? featureIdOf.get(hoverRouteId)
        : undefined;
    if (hov != null)
      map.setFeatureState({ source: ROUTES_SRC, id: hov }, { hover: true });
  }, [loaded, featureIdOf, selectedId, hoverRouteId]);

  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!loaded || map?.getSource(STOPS_SRC) == null) return;
    map.removeFeatureState({ source: STOPS_SRC });
    const i = routeStopList.findIndex((s) => s.stop_id === hoverStopId);
    if (i >= 0)
      map.setFeatureState({ source: STOPS_SRC, id: i }, { hover: true });
  }, [loaded, routeStopList, hoverStopId]);

  // ── Camera ───────────────────────────────────────────────────────

  /** The camera before a route was selected, restored on going back. */
  const savedCamera = React.useRef<Camera | null>(null);
  const prevSelectedId = React.useRef<string | null>(null);
  const routesBounds = overviewBounds(routes);
  const routesBoundsRef = React.useRef(routesBounds);
  routesBoundsRef.current = routesBounds;

  React.useEffect(() => {
    const map = mapRef.current;
    if (!loaded || map == null) return;
    const prev = prevSelectedId.current;
    prevSelectedId.current = selectedId;
    if (prev == null && selectedId != null) {
      const c = map.getCenter();
      savedCamera.current = {
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      };
    } else if (prev != null && selectedId == null) {
      const cam = savedCamera.current;
      savedCamera.current = null;
      setStopPopup(null);
      if (cam) map.easeTo({ ...cam, duration: 600 });
      else if (routesBoundsRef.current)
        map.fitBounds(routesBoundsRef.current, FIT);
    }
  }, [loaded, selectedId]);

  // Fit the selected route (or its selected shape) once its detail is in.
  const focusBounds =
    selected?.route_id === selectedId
      ? ((selectedShape ? shapeBounds(selectedShape) : null) ??
        (selected ? routeBounds([selected]) : null))
      : null;
  const focusKey = focusBounds ? focusBounds.flat().join(',') : '';
  React.useEffect(() => {
    if (!loaded || focusBounds == null) return;
    mapRef.current?.fitBounds(focusBounds, FIT);
  }, [loaded, focusKey]);

  // Fit the overview when the filters change, unless a route is selected.
  const hasRoutes = routes.length > 0;
  React.useEffect(() => {
    if (!loaded || selectedId != null || routesBoundsRef.current == null)
      return;
    mapRef.current?.fitBounds(routesBoundsRef.current, FIT);
  }, [loaded, fitKey, hasRoutes]);

  // ── Interaction ──────────────────────────────────────────────────

  // With a route selected, the other (dimmed) routes don't react to the
  // pointer: back to the list to pick another one.
  const routeIdsAt = (e: MapLayerMouseEvent): string[] =>
    selectedId != null
      ? []
      : [
          ...new Set(
            (e.features ?? [])
              .filter((f) => f.layer.id === HIT_LAYER)
              .map((f) => String(f.properties?.route_id)),
          ),
        ];

  const handleClick = (e: MapLayerMouseEvent): void => {
    const stop = e.features?.find((f) => f.layer.id === STOPS_LAYER);
    if (stop) {
      setStopPopup(String(stop.properties?.stop_id));
      return;
    }
    const ids = routeIdsAt(e);
    setStopPopup(null);
    if (ids.length === 1) {
      setPick(null);
      onSelectRoute(ids[0]);
    } else if (ids.length > 1) {
      setPick({ lngLat: [e.lngLat.lng, e.lngLat.lat], ids });
    } else {
      setPick(null);
    }
  };

  const handleMove = (e: MapLayerMouseEvent): void => {
    const ids = routeIdsAt(e);
    const onStop = e.features?.some((f) => f.layer.id === STOPS_LAYER);
    setCursor(ids.length > 0 || onStop ? 'pointer' : '');
    const id = ids[0] ?? null;
    if (id !== hoverRouteId) onHoverRoute(id);
  };

  const popupStop = stopPopup ? stops[stopPopup] : undefined;
  const popupRelation = routeStopList.find(
    (s) => s.stop_id === stopPopup,
  )?.relation;

  return (
    <Box
      sx={{
        height: '100%',
        position: 'relative',
        '& .maplibregl-popup-content': {
          p: 0,
          bgcolor: 'background.paper',
          color: 'text.primary',
        },
        '& .maplibregl-popup-tip': {
          borderTopColor: 'background.paper',
          borderBottomColor: 'background.paper',
        },
      }}
    >
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: 0, latitude: 20, zoom: 1 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        interactiveLayerIds={INTERACTIVE_LAYERS}
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseOut={() => {
          setCursor('');
          if (hoverRouteId != null) onHoverRoute(null);
        }}
        onLoad={() => setLoaded(true)}
        cursor={cursor}
      >
        <Source id={ROUTES_SRC} type='geojson' data={overview}>
          <Layer
            id='v2-routes-solid'
            type='line'
            filter={['!=', CAT, 'removed']}
            layout={{
              'line-cap': 'round',
              'line-join': 'round',
              'line-sort-key': [
                'match',
                CAT,
                'major',
                3,
                'added',
                2,
                'minor',
                0,
                1,
              ],
            }}
            paint={{
              'line-color': categoryColor(selectedId != null),
              'line-width': categoryWidth(selectedId != null),
              'line-opacity': categoryOpacity(selectedId != null),
            }}
          />
          <Layer
            id='v2-routes-dashed'
            type='line'
            filter={['==', CAT, 'removed']}
            paint={{
              'line-color': categoryColor(selectedId != null),
              'line-width': categoryWidth(selectedId != null),
              'line-opacity': categoryOpacity(selectedId != null),
              'line-dasharray': [2, 1.5],
            }}
          />
          {/* Wide and transparent: what clicks and hovers hit. */}
          <Layer
            id={HIT_LAYER}
            type='line'
            paint={{
              'line-color': '#000000',
              'line-width': 14,
              'line-opacity': 0,
            }}
          />
        </Source>
        <Source id='v2-diverge-src' type='geojson' data={diverge}>
          <Layer
            id='v2-diverge-added'
            type='line'
            filter={['==', ['get', 'kind'], 'added']}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': '#2e7d32',
              'line-width': 10,
              'line-opacity': 0.35,
            }}
          />
          <Layer
            id='v2-diverge-removed'
            type='line'
            filter={['==', ['get', 'kind'], 'removed']}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': '#d32f2f',
              'line-width': 10,
              'line-opacity': 0.35,
            }}
          />
        </Source>
        <Source id='v2-sel-base-src' type='geojson' data={selectedLines.base}>
          <Layer
            id='v2-sel-base'
            type='line'
            paint={{
              'line-color': '#616161',
              'line-width': 3,
              'line-opacity': 0.8,
              'line-dasharray': [2, 2],
            }}
          />
        </Source>
        <Source id='v2-sel-new-src' type='geojson' data={selectedLines.new}>
          <Layer
            id='v2-sel-new-casing'
            type='line'
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': '#ffffff', 'line-width': 7 }}
          />
          <Layer
            id='v2-sel-new'
            type='line'
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': routeColor, 'line-width': 4 }}
          />
        </Source>
        <Source id='v2-shape-base-src' type='geojson' data={shapeLines.base}>
          <Layer
            id='v2-shape-base'
            type='line'
            paint={{
              'line-color': SHAPE_ACCENT,
              'line-width': 3,
              'line-opacity': 0.55,
              'line-dasharray': [2, 1.5],
            }}
          />
        </Source>
        <Source id='v2-shape-new-src' type='geojson' data={shapeLines.new}>
          <Layer
            id='v2-shape-new-casing'
            type='line'
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': '#ffffff',
              'line-width': 7,
              'line-opacity': 0.9,
            }}
          />
          <Layer
            id='v2-shape-new'
            type='line'
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': SHAPE_ACCENT, 'line-width': 4 }}
          />
        </Source>
        <Source id={STOPS_SRC} type='geojson' data={stopFeatures}>
          <Layer
            id={STOPS_LAYER}
            type='circle'
            paint={{
              'circle-radius': ['case', HOVER, 9, 5.5],
              'circle-color': ['get', 'fill'],
              'circle-stroke-color': ['get', 'stroke'],
              'circle-stroke-width': ['case', HOVER, 3, 2],
            }}
          />
        </Source>
        <NavigationControl position='top-right' />

        {pick ? (
          <Popup
            longitude={pick.lngLat[0]}
            latitude={pick.lngLat[1]}
            offset={8}
            maxWidth='460px'
            closeOnClick={false}
            onClose={() => setPick(null)}
          >
            <Box
              sx={{
                py: 0.75,
                minWidth: 320,
                maxWidth: 440,
                maxHeight: 400,
                overflowY: 'auto',
              }}
            >
              <Typography
                variant='caption'
                color='text.secondary'
                component='div'
                sx={{ px: 1.5, pb: 0.5, pr: 4 }}
              >
                {pick.ids.length} routes here
              </Typography>
              {pick.ids.map((id) => {
                const r = byId.get(id);
                return (
                  <ButtonBase
                    key={id}
                    onClick={() => {
                      setPick(null);
                      onSelectRoute(id);
                    }}
                    onMouseEnter={() => onHoverRoute(id)}
                    sx={{
                      display: 'flex',
                      width: '100%',
                      justifyContent: 'flex-start',
                      alignItems: 'flex-start',
                      gap: 1.25,
                      px: 1.5,
                      py: 0.75,
                      textAlign: 'left',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <RouteBadge
                      label={r?.short_name || id}
                      color={r?.color ?? ''}
                      textColor={r?.text_color ?? ''}
                      removed={r?.kind === 'removed'}
                      maxWidth={180}
                    />
                    <Typography
                      variant='body2'
                      sx={{ lineHeight: 1.35, pt: '2px' }}
                    >
                      {r?.long_name || id}
                    </Typography>
                  </ButtonBase>
                );
              })}
            </Box>
          </Popup>
        ) : null}

        {popupStop != null && stopPopup != null ? (
          <Popup
            longitude={popupStop.coord[0]}
            latitude={popupStop.coord[1]}
            offset={12}
            closeOnClick={false}
            onClose={() => setStopPopup(null)}
          >
            <Box sx={{ p: 1.25, pr: 3, minWidth: 220, maxWidth: 320 }}>
              <Typography variant='body2' fontWeight={700}>
                {popupStop.name || stopPopup}
              </Typography>
              <Typography
                variant='caption'
                component='div'
                sx={{ fontFamily: MONO_FONT, overflowWrap: 'anywhere' }}
              >
                stop_id {stopPopup}
              </Typography>
              {popupRelation ? (
                <Typography
                  variant='caption'
                  component='div'
                  color='text.secondary'
                >
                  {STOP_RELATION_LABELS[popupRelation]}
                </Typography>
              ) : null}
              <MuiLink
                component={IntlLink}
                href={stopHref(stopPopup)}
                variant='body2'
                underline='hover'
                sx={{ display: 'inline-block', mt: 0.75, fontWeight: 600 }}
              >
                Open in Stops →
              </MuiLink>
            </Box>
          </Popup>
        ) : null}
      </MapGL>
      <RoutesLegend selected={selectedId != null} routeColor={routeColor} />
    </Box>
  );
}

/** Change categories with nothing selected; the diff styling with a route selected. */
function RoutesLegend({
  selected,
  routeColor,
}: {
  selected: boolean;
  routeColor: string;
}): React.ReactElement {
  const items: LegendItem[] = selected
    ? [
        { symbol: <LegendLine color='#616161' dashed />, label: 'Old path' },
        {
          symbol: <LegendLine color={routeColor} width={4} />,
          label: 'New path',
        },
        {
          symbol: <LegendLine color='#2e7d32' halo />,
          label: 'New path section',
        },
        {
          symbol: <LegendLine color='#d32f2f' halo />,
          label: 'Abandoned section',
        },
        {
          symbol: <LegendDot fill={STOP_RELATION_COLORS.added} stroke='#fff' />,
          label: 'Stop added',
        },
        {
          symbol: (
            <LegendDot fill={STOP_RELATION_COLORS.removed} stroke='#fff' />
          ),
          label: 'Stop removed',
        },
        {
          symbol: <LegendDot fill='#fff' stroke={routeColor} />,
          label: 'Stop kept',
        },
      ]
    : (['major', 'minor', 'added', 'removed'] as const).map((c) => ({
        symbol: (
          <LegendLine
            color={OVERVIEW_STYLES[c].color}
            width={OVERVIEW_STYLES[c].width}
            dashed={OVERVIEW_STYLES[c].dashed}
          />
        ),
        label: OVERVIEW_STYLES[c].label,
      }));
  return (
    <MapLegend
      items={items}
      note={selected ? 'Other routes dimmed' : undefined}
    />
  );
}
