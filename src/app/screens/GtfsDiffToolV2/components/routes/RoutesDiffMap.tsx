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
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Box, Button, Chip, Typography } from '@mui/material';
import { useMapConfig } from '../../../../hooks/useMapConfig';
import type {
  LonLat,
  RouteImpact,
  RouteShapeDiff,
  RouteStopInfo,
} from '../../lib/entity-diff-types';
import {
  ROUTE_KIND_COLORS,
  STOP_RELATION_COLORS,
  STOP_RELATION_LABELS,
  type StopRelation,
  SHAPE_STATUS_COLORS,
  routeBounds,
  routeStops,
  shapeBounds,
} from '../../lib/routes-utils';
import { type RouteOverview, overviewBounds } from '../../lib/map-table-query';
import { formatDistance } from '../../lib/stops-utils';
import { MONO_FONT } from '../calendar/shared';

const INTERACTIVE_LAYERS = [
  'routes-line',
  'routes-line-deleted',
  'route-stops',
];

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

function stopStatusText(s: RouteStopInfo): string | null {
  if (s.status === 'added') return 'New stop in this feed';
  if (s.status === 'deleted') return 'Stop removed from the feed';
  if (s.status === 'modified')
    return s.moved_m >= 1
      ? `Stop moved ${formatDistance(s.moved_m)}`
      : 'Stop details changed';
  return null;
}

interface RoutesDiffMapProps {
  /** Routes matching the filters, as the overview draws them (maps/routes.parquet). */
  routes: RouteOverview[];
  /** The selected route's full detail, once loaded. */
  selected: RouteImpact | null;
  stops: Record<string, RouteStopInfo>;
  onSelectRoute: (routeId: string | null) => void;
  selectedStopId: string | null;
  onSelectStop: (stopId: string | null) => void;
  /** Incremented to fly to the selected stop. */
  stopFlyRequest: number;
  /** Incremented to re-fit the map to the selected route, or all visible ones. */
  refocusRequest?: number;
  onOpenStop: (stopId: string) => void;
  /** A shape of the selected route, drawn on top (old dashed, new solid). */
  selectedShape?: RouteShapeDiff | null;
}

/** Accent for the selected shape, distinct from route and change colors. */
const SHAPE_ACCENT = SHAPE_STATUS_COLORS.rerouted;

export default function RoutesDiffMap({
  routes,
  selected,
  stops,
  onSelectRoute,
  selectedStopId,
  onSelectStop,
  stopFlyRequest,
  refocusRequest = 0,
  onOpenStop,
  selectedShape = null,
}: RoutesDiffMapProps): React.ReactElement {
  const mapCfg = useMapConfig();
  const mapRef = React.useRef<MapRef>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [cursor, setCursor] = React.useState('');

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

  const overview = React.useMemo(() => {
    const features: Feature[] = [];
    for (const r of routes) {
      for (const g of r.lines) {
        features.push(
          line(g, {
            route_id: r.route_id,
            color: ROUTE_KIND_COLORS[r.kind],
            deleted: r.kind === 'removed',
          }),
        );
      }
    }
    return collection(features);
  }, [routes]);

  const diverge = React.useMemo(() => {
    const features: Feature[] = [];
    if (selectedShape) {
      for (const g of selectedShape.diverge.added)
        features.push(line(g, { kind: 'added' }));
      for (const g of selectedShape.diverge.removed)
        features.push(line(g, { kind: 'removed' }));
      return collection(features);
    }
    if (selected) {
      for (const d of selected.directions) {
        for (const g of d.diverge.added)
          features.push(line(g, { kind: 'added' }));
        for (const g of d.diverge.removed)
          features.push(line(g, { kind: 'removed' }));
      }
      return collection(features);
    }
    for (const r of routes) {
      for (const g of r.added) features.push(line(g, { kind: 'added' }));
      for (const g of r.removed) features.push(line(g, { kind: 'removed' }));
    }
    return collection(features);
  }, [routes, selected, selectedShape]);

  const shapeLines = React.useMemo(() => {
    const g = selectedShape?.geometry;
    return {
      base: collection(g?.base && g.base.length > 1 ? [line(g.base, {})] : []),
      new: collection(g?.new && g.new.length > 1 ? [line(g.new, {})] : []),
    };
  }, [selectedShape]);

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

  const routeColor = selected?.color
    ? `#${selected.color}`
    : mapCfg.primaryMain;

  const stopFeatures = React.useMemo(() => {
    if (selected == null) return collection([]);
    const features: Feature[] = [];
    for (const { stop_id: id, relation } of routeStops(selected)) {
      const s = stops[id];
      if (s == null) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: s.coord },
        properties: {
          stop_id: id,
          relation,
          fill: STOP_RELATION_COLORS[relation],
          stroke: relation === 'kept' ? routeColor : '#ffffff',
          selected: id === selectedStopId,
        },
      });
    }
    return collection(features);
  }, [selected, stops, routeColor, selectedStopId]);

  // ── Camera ───────────────────────────────────────────────────────

  const bounds = React.useMemo(
    () =>
      (selectedShape ? shapeBounds(selectedShape) : null) ??
      (selected ? routeBounds([selected]) : overviewBounds(routes)),
    [selected, routes, selectedShape],
  );
  const boundsKey = `${selected?.route_id ?? ''}|${selectedShape?.shape_id ?? ''}|${bounds ? bounds.flat().join(',') : ''}`;
  const handledFly = React.useRef(0);

  React.useEffect(() => {
    if (!loaded || bounds == null || stopFlyRequest > handledFly.current)
      return;
    mapRef.current?.fitBounds(bounds, {
      padding: 50,
      maxZoom: 15,
      duration: 600,
    });
    // Re-fit when the bounds change or when asked to (the recenter button).
  }, [loaded, boundsKey, refocusRequest]);

  const selectedStop = selectedStopId ? stops[selectedStopId] : undefined;

  React.useEffect(() => {
    if (
      !loaded ||
      stopFlyRequest === handledFly.current ||
      selectedStop == null
    )
      return;
    handledFly.current = stopFlyRequest;
    const map = mapRef.current;
    map?.flyTo({
      center: selectedStop.coord,
      zoom: Math.max(map.getZoom(), 15),
      duration: 700,
    });
  }, [stopFlyRequest, loaded]);

  // ── Interaction ──────────────────────────────────────────────────

  const handleClick = (e: MapLayerMouseEvent): void => {
    const f = e.features?.[0];
    if (f == null) {
      onSelectStop(null);
      return;
    }
    if (f.layer.id === 'route-stops')
      onSelectStop(String(f.properties?.stop_id));
    else onSelectRoute(String(f.properties?.route_id));
  };

  const relation: StopRelation | undefined =
    selected && selectedStopId
      ? routeStops(selected).find((s) => s.stop_id === selectedStopId)?.relation
      : undefined;

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 420,
        position: 'relative',
        borderRadius: '6px',
        overflow: 'hidden',
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
        initialViewState={
          bounds
            ? { bounds, fitBoundsOptions: { padding: 50, maxZoom: 15 } }
            : { longitude: 0, latitude: 0, zoom: 1 }
        }
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        interactiveLayerIds={INTERACTIVE_LAYERS}
        onClick={handleClick}
        onLoad={() => setLoaded(true)}
        onMouseEnter={() => setCursor('pointer')}
        onMouseLeave={() => setCursor('')}
        cursor={cursor}
      >
        <Source id='diverge-src' type='geojson' data={diverge}>
          <Layer
            id='diverge-added'
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
            id='diverge-removed'
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
        <Source id='routes-src' type='geojson' data={overview}>
          <Layer
            id='routes-line'
            type='line'
            filter={['!', ['get', 'deleted']]}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': ['get', 'color'],
              'line-width': 3,
              'line-opacity': selected ? 0.15 : 0.85,
            }}
          />
          <Layer
            id='routes-line-deleted'
            type='line'
            filter={['get', 'deleted']}
            paint={{
              'line-color': ['get', 'color'],
              'line-width': 3,
              'line-opacity': selected ? 0.15 : 0.85,
              'line-dasharray': [2, 1.5],
            }}
          />
        </Source>
        <Source id='sel-base-src' type='geojson' data={selectedLines.base}>
          <Layer
            id='sel-base'
            type='line'
            paint={{
              'line-color': '#616161',
              'line-width': 3,
              'line-opacity': 0.8,
              'line-dasharray': [2, 2],
            }}
          />
        </Source>
        <Source id='sel-new-src' type='geojson' data={selectedLines.new}>
          <Layer
            id='sel-new'
            type='line'
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': routeColor,
              'line-width': 4,
              'line-opacity': 0.9,
            }}
          />
        </Source>
        <Source id='shape-base-src' type='geojson' data={shapeLines.base}>
          <Layer
            id='shape-base'
            type='line'
            paint={{
              'line-color': SHAPE_ACCENT,
              'line-width': 3,
              'line-opacity': 0.55,
              'line-dasharray': [2, 1.5],
            }}
          />
        </Source>
        <Source id='shape-new-src' type='geojson' data={shapeLines.new}>
          <Layer
            id='shape-new-casing'
            type='line'
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': '#ffffff',
              'line-width': 7,
              'line-opacity': 0.9,
            }}
          />
          <Layer
            id='shape-new'
            type='line'
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': SHAPE_ACCENT, 'line-width': 4 }}
          />
        </Source>
        <Source id='route-stops-src' type='geojson' data={stopFeatures}>
          <Layer
            id='route-stops'
            type='circle'
            paint={{
              'circle-radius': ['case', ['get', 'selected'], 8, 5.5],
              'circle-color': ['get', 'fill'],
              'circle-stroke-color': ['get', 'stroke'],
              'circle-stroke-width': ['case', ['get', 'selected'], 3, 2],
            }}
          />
        </Source>
        <NavigationControl position='top-right' />
        {selectedStop != null && selectedStopId != null && (
          <Popup
            longitude={selectedStop.coord[0]}
            latitude={selectedStop.coord[1]}
            offset={12}
            focusAfterOpen={false}
            closeOnClick={false}
            onClose={() => onSelectStop(null)}
          >
            <Box sx={{ p: 1.25, minWidth: 220 }}>
              <Typography
                sx={{
                  fontFamily: MONO_FONT,
                  fontWeight: 700,
                  fontSize: '0.8rem',
                }}
              >
                {selectedStopId}
              </Typography>
              <Typography variant='body2' fontWeight={700} sx={{ mb: 0.5 }}>
                {selectedStop.name || 'Unnamed stop'}
              </Typography>
              {relation && (
                <Chip
                  size='small'
                  label={STOP_RELATION_LABELS[relation]}
                  sx={{
                    height: 20,
                    fontSize: '0.68rem',
                    mb: 0.5,
                    bgcolor:
                      relation === 'kept'
                        ? 'action.selected'
                        : STOP_RELATION_COLORS[relation],
                    color: relation === 'kept' ? 'text.primary' : '#fff',
                  }}
                />
              )}
              {stopStatusText(selectedStop) && (
                <Typography
                  variant='caption'
                  component='div'
                  color='text.secondary'
                >
                  {stopStatusText(selectedStop)}
                </Typography>
              )}
              <Button
                size='small'
                sx={{ mt: 0.5, px: 0 }}
                onClick={() => onOpenStop(selectedStopId)}
              >
                Open in Stops tab →
              </Button>
            </Box>
          </Popup>
        )}
      </MapGL>
    </Box>
  );
}
