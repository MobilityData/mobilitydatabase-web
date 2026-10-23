'use client';

import * as React from 'react';
import MapGL, {
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
  Marker,
  NavigationControl,
  Popup,
  Source,
} from 'react-map-gl/maplibre';
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Box } from '@mui/material';
import { useMapConfig } from '../../../../hooks/useMapConfig';
import type {
  CompactStop,
  LonLat,
  RouteInfo,
  StopChange,
} from '../../lib/entity-diff-types';
import {
  STOP_KINDS,
  STOP_KIND_COLORS,
  type StopKind,
  bearing,
  displayCoord,
} from '../../lib/stops-utils';
import type { StopPoint } from '../../lib/map-table-query';
import { StopDetails, UnchangedStopDetails } from './StopDetails';

const ARROW_IMAGE = 'stop-move-arrow';
/**
 * Changed stops are clustered per change type: one source and pair of
 * layers per kind, so a cluster only groups stops of one kind and wears its
 * colour.
 */
const sourceId = (k: StopKind): string => `changed-src-${k}`;
const clusterLayer = (k: StopKind): string => `stops-clusters-${k}`;
const pointLayer = (k: StopKind): string => `stops-changed-${k}`;
const CLUSTER_LAYERS = STOP_KINDS.map(clusterLayer);
const POINT_LAYERS = STOP_KINDS.map(pointLayer);
const INTERACTIVE_LAYERS = [
  ...CLUSTER_LAYERS,
  ...POINT_LAYERS,
  'stops-selected',
  'stops-ghost',
  'overlay-new',
  'overlay-base',
];
/** Changed stops are clustered up to this zoom; above it each stop is drawn. */
const CLUSTER_MAX_ZOOM = 14;
/** Moves (old position, arrow) are drawn once stops are no longer clustered. */
const MOVES_MIN_ZOOM = CLUSTER_MAX_ZOOM + 1;
/**
 * Where a kind's clusters sit around their centre (px), so clusters of
 * different kinds at the same place don't hide each other. Single stops
 * stay at their own position.
 */
const CLUSTER_OFFSET: Record<StopKind, [number, number]> = {
  added: [-11, -11],
  removed: [11, -11],
  modified: [-11, 11],
  moved: [11, 11],
};
/** Cluster count labels rendered at once (the rest keep their circle). */
const MAX_CLUSTER_LABELS = 400;

interface ClusterLabel {
  kind: StopKind;
  id: number;
  coord: LonLat;
  count: number;
}

const kindOfLayer = (layerId: string): StopKind | null =>
  STOP_KINDS.find((k) => layerId.endsWith(`-${k}`)) ?? null;

/** Upward-pointing triangle; rotated per feature to the move bearing. */
function createArrowImage(color: string): ImageData | null {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx == null) return null;
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(size / 2, 4);
  ctx.lineTo(size - 7, size - 6);
  ctx.lineTo(size / 2, size - 11);
  ctx.lineTo(7, size - 6);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

export type MapSelection =
  | { type: 'changed'; stopId: string }
  | { type: 'overlay'; feed: 'base' | 'new'; stop: CompactStop };

interface StopsDiffMapProps {
  /** Changed stops matching the filters (maps/stops.parquet). */
  points: StopPoint[];
  /** The selected changed stop's full row, once loaded (popup). */
  selectedStop: StopChange | null;
  allStops: { base: CompactStop[]; new: CompactStop[] };
  showBaseOverlay: boolean;
  showNewOverlay: boolean;
  minMoveM: number;
  columns: string[];
  routes: Record<string, RouteInfo>;
  selection: MapSelection | null;
  onSelect: (selection: MapSelection | null) => void;
  /** Incremented to fly to the selected stop (e.g. when picked from the list). */
  flyRequest: number;
  /** Incremented to re-fit the map to the visible stops. */
  refocusRequest?: number;
}

type Feature = GeoJSON.Feature<
  GeoJSON.Geometry,
  Record<string, string | number | boolean>
>;

function collection(features: Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features };
}

function point(coord: LonLat, properties: Feature['properties']): Feature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coord },
    properties,
  };
}

/** [[minLon, minLat], [maxLon, maxLat]] over both positions of every point. */
function pointBounds(points: StopPoint[]): [LonLat, LonLat] | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const p of points) {
    for (const c of [p.coord, p.base, p.new]) {
      if (c == null) continue;
      minLon = Math.min(minLon, c[0]);
      maxLon = Math.max(maxLon, c[0]);
      minLat = Math.min(minLat, c[1]);
      maxLat = Math.max(maxLat, c[1]);
    }
  }
  return Number.isFinite(minLon)
    ? [
        [minLon, minLat],
        [maxLon, maxLat],
      ]
    : null;
}

export default function StopsDiffMap({
  points,
  selectedStop,
  allStops,
  showBaseOverlay,
  showNewOverlay,
  minMoveM,
  columns,
  routes,
  selection,
  onSelect,
  flyRequest,
  refocusRequest = 0,
}: StopsDiffMapProps): React.ReactElement {
  const mapCfg = useMapConfig();
  const mapRef = React.useRef<MapRef>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [cursor, setCursor] = React.useState<string>('');
  const [clusters, setClusters] = React.useState<ClusterLabel[]>([]);
  const selectedId = selection?.type === 'changed' ? selection.stopId : null;
  const pointsById = React.useMemo(
    () => new Map(points.map((p) => [p.stop_id, p])),
    [points],
  );

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

  // ── GeoJSON sources ──────────────────────────────────────────────

  // Clustered per change type: IDFM has 55k changed stops.
  const changedData = React.useMemo(() => {
    const byKind = Object.fromEntries(
      STOP_KINDS.map((k) => [k, [] as Feature[]]),
    ) as Record<StopKind, Feature[]>;
    for (const p of points)
      byKind[p.kind].push(
        point(p.coord, { stop_id: p.stop_id, color: STOP_KIND_COLORS[p.kind] }),
      );
    return Object.fromEntries(
      STOP_KINDS.map((k) => [k, collection(byKind[k])]),
    ) as Record<StopKind, GeoJSON.FeatureCollection>;
  }, [points]);

  // The selected stop, drawn above the clusters at every zoom.
  const selectedPoint = selectedId ? pointsById.get(selectedId) : undefined;
  const selectedCoord: LonLat | null =
    selectedPoint?.coord ?? (selectedStop ? displayCoord(selectedStop) : null);
  const selLon = selectedCoord?.[0];
  const selLat = selectedCoord?.[1];
  const selColor = selectedPoint
    ? STOP_KIND_COLORS[selectedPoint.kind]
    : '#757575';
  const selectedData = React.useMemo(
    () =>
      collection(
        selLon != null && selLat != null && selectedId
          ? [point([selLon, selLat], { stop_id: selectedId, color: selColor })]
          : [],
      ),
    [selectedId, selLon, selLat, selColor],
  );

  const moveData = React.useMemo(() => {
    const lines: Feature[] = [];
    const ghosts: Feature[] = [];
    const arrows: Feature[] = [];
    for (const s of points) {
      if (s.kind !== 'moved' || !s.base || !s.new) continue;
      const [a, b] = [s.base, s.new];
      lines.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [a, b] },
        properties: { stop_id: s.stop_id },
      });
      ghosts.push(point(a, { stop_id: s.stop_id }));
      // Arrowhead at 70% of the way, pointing toward the new position.
      const at: LonLat = [
        a[0] + (b[0] - a[0]) * 0.7,
        a[1] + (b[1] - a[1]) * 0.7,
      ];
      arrows.push(point(at, { stop_id: s.stop_id, bearing: bearing(a, b) }));
    }
    return {
      lines: collection(lines),
      ghosts: collection(ghosts),
      arrows: collection(arrows),
    };
  }, [points]);

  const overlayData = React.useMemo(
    () => ({
      base: collection(
        allStops.base.map((s) =>
          point([s[1], s[2]], { stop_id: s[0], feed: 'base' }),
        ),
      ),
      new: collection(
        allStops.new.map((s) =>
          point([s[1], s[2]], { stop_id: s[0], feed: 'new' }),
        ),
      ),
    }),
    [allStops],
  );

  // ── Camera ───────────────────────────────────────────────────────

  const bounds = React.useMemo(() => pointBounds(points), [points]);
  const boundsKey = bounds ? bounds.flat().join(',') : '';

  // Last fly request already handled. A pending fly (e.g. a stop focused from
  // another tab before the map loaded) takes priority over fitting bounds.
  const handledFly = React.useRef(0);

  React.useEffect(() => {
    if (!loaded || bounds == null || flyRequest > handledFly.current) return;
    mapRef.current?.fitBounds(bounds, {
      padding: 60,
      maxZoom: 16,
      duration: 600,
    });
    // boundsKey captures the bounds value; re-fit when it changes or when
    // asked to (the recenter button).
  }, [loaded, boundsKey, refocusRequest]);

  const popupCoord: LonLat | null =
    selection?.type === 'overlay'
      ? [selection.stop[1], selection.stop[2]]
      : selectedCoord;

  React.useEffect(() => {
    if (!loaded || flyRequest === handledFly.current || popupCoord == null)
      return;
    handledFly.current = flyRequest;
    const map = mapRef.current;
    map?.flyTo({
      center: popupCoord,
      zoom: Math.max(map.getZoom(), 15),
      duration: 700,
    });
    // Only react to explicit fly requests, not to every selection change.
  }, [flyRequest, loaded]);

  // Count labels of the clusters in view (the style has no glyphs, so
  // they are HTML markers rather than a symbol layer).
  const updateClusters = (): void => {
    const map = mapRef.current;
    if (map == null) return;
    const layers = CLUSTER_LAYERS.filter((l) => map.getLayer(l));
    if (layers.length === 0) return;
    // Cluster ids are unique per source only: key them by kind too.
    const seen = new Map<string, ClusterLabel>();
    for (const f of map.queryRenderedFeatures({ layers })) {
      const kind = kindOfLayer(f.layer.id);
      const id = Number(f.properties?.cluster_id);
      const key = `${kind}:${id}`;
      if (kind == null || seen.has(key) || f.geometry.type !== 'Point')
        continue;
      const [lon, lat] = f.geometry.coordinates;
      seen.set(key, {
        kind,
        id,
        coord: [lon, lat],
        count: Number(f.properties?.point_count),
      });
      if (seen.size >= MAX_CLUSTER_LABELS) break;
    }
    setClusters([...seen.values()]);
  };

  // ── Interaction ──────────────────────────────────────────────────

  const zoomIntoCluster = (
    kind: StopKind,
    clusterId: number,
    center: LonLat,
  ): void => {
    const map = mapRef.current;
    const source = map?.getSource(sourceId(kind)) as GeoJSONSource | undefined;
    if (map == null || source == null) return;
    source
      .getClusterExpansionZoom(clusterId)
      .then((zoom) => map.easeTo({ center, zoom, duration: 500 }))
      .catch(() => map.easeTo({ center, zoom: map.getZoom() + 2 }));
  };

  const handleClick = (e: MapLayerMouseEvent): void => {
    const f = e.features?.[0];
    if (f == null) {
      onSelect(null);
      return;
    }
    if (CLUSTER_LAYERS.includes(f.layer.id)) {
      const kind = kindOfLayer(f.layer.id);
      if (kind && f.geometry.type === 'Point') {
        const [lon, lat] = f.geometry.coordinates;
        zoomIntoCluster(kind, Number(f.properties?.cluster_id), [lon, lat]);
      }
      return;
    }
    const id = String(f.properties?.stop_id);
    if (
      POINT_LAYERS.includes(f.layer.id) ||
      f.layer.id === 'stops-selected' ||
      f.layer.id === 'stops-ghost' ||
      pointsById.has(id)
    ) {
      onSelect({ type: 'changed', stopId: id });
      return;
    }
    const feed = f.properties?.feed === 'base' ? 'base' : 'new';
    const stop = allStops[feed].find((s) => s[0] === id);
    if (stop) onSelect({ type: 'overlay', feed, stop });
  };

  const handleLoad = (): void => {
    const map = mapRef.current?.getMap();
    if (map && !map.hasImage(ARROW_IMAGE)) {
      const img = createArrowImage(STOP_KIND_COLORS.moved);
      if (img) map.addImage(ARROW_IMAGE, img, { pixelRatio: 2 });
    }
    setLoaded(true);
  };

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
          maxHeight: 'min(480px, 70vh)',
          // Column layout so the details pin their header and scroll only
          // the field table (react-map-gl wraps children in a div).
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          '& > div': {
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          },
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
            ? { bounds, fitBoundsOptions: { padding: 60, maxZoom: 16 } }
            : { longitude: 0, latitude: 0, zoom: 1 }
        }
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        interactiveLayerIds={INTERACTIVE_LAYERS}
        onClick={handleClick}
        onLoad={handleLoad}
        onIdle={updateClusters}
        onMoveEnd={updateClusters}
        onMouseEnter={() => setCursor('pointer')}
        onMouseLeave={() => setCursor('')}
        cursor={cursor}
      >
        <Source id='overlay-base-src' type='geojson' data={overlayData.base}>
          <Layer
            id='overlay-base'
            type='circle'
            layout={{ visibility: showBaseOverlay ? 'visible' : 'none' }}
            paint={{
              'circle-radius': 3.5,
              'circle-color': '#9e9e9e',
              'circle-opacity': 0.7,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#616161',
            }}
          />
        </Source>
        <Source id='overlay-new-src' type='geojson' data={overlayData.new}>
          <Layer
            id='overlay-new'
            type='circle'
            layout={{ visibility: showNewOverlay ? 'visible' : 'none' }}
            paint={{
              'circle-radius': 3.5,
              'circle-color': '#64b5f6',
              'circle-opacity': 0.7,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#1565c0',
            }}
          />
        </Source>
        <Source id='moves-src' type='geojson' data={moveData.lines}>
          <Layer
            id='moves'
            type='line'
            minzoom={MOVES_MIN_ZOOM}
            layout={{ 'line-cap': 'round' }}
            paint={{
              'line-color': STOP_KIND_COLORS.moved,
              'line-width': 2,
              'line-opacity': 0.55,
              'line-dasharray': [2, 2],
            }}
          />
        </Source>
        <Source id='ghosts-src' type='geojson' data={moveData.ghosts}>
          <Layer
            id='stops-ghost'
            type='circle'
            minzoom={MOVES_MIN_ZOOM}
            paint={{
              'circle-radius': 5,
              'circle-color': 'rgba(0,0,0,0)',
              'circle-stroke-width': 1.5,
              'circle-stroke-color': STOP_KIND_COLORS.moved,
              'circle-stroke-opacity': 0.6,
            }}
          />
        </Source>
        {loaded && (
          <Source id='arrows-src' type='geojson' data={moveData.arrows}>
            <Layer
              id='move-arrows'
              type='symbol'
              minzoom={MOVES_MIN_ZOOM}
              layout={{
                'icon-image': ARROW_IMAGE,
                'icon-size': 0.6,
                'icon-rotate': ['get', 'bearing'],
                'icon-rotation-alignment': 'map',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
              }}
              paint={{ 'icon-opacity': 0.8 }}
            />
          </Source>
        )}
        {STOP_KINDS.map((k) => (
          <Source
            key={k}
            id={sourceId(k)}
            type='geojson'
            data={changedData[k]}
            cluster
            clusterMaxZoom={CLUSTER_MAX_ZOOM}
            clusterRadius={50}
          >
            <Layer
              id={clusterLayer(k)}
              type='circle'
              filter={['has', 'point_count']}
              paint={{
                'circle-color': STOP_KIND_COLORS[k],
                'circle-opacity': 0.9,
                'circle-radius': [
                  'step',
                  ['get', 'point_count'],
                  14,
                  50,
                  18,
                  500,
                  23,
                  5000,
                  29,
                ],
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
                'circle-translate': CLUSTER_OFFSET[k],
              }}
            />
            <Layer
              id={pointLayer(k)}
              type='circle'
              filter={['!', ['has', 'point_count']]}
              paint={{
                'circle-radius': 6,
                'circle-color': STOP_KIND_COLORS[k],
                'circle-stroke-width': 1.5,
                'circle-stroke-color': '#ffffff',
              }}
            />
          </Source>
        ))}
        <Source id='selected-src' type='geojson' data={selectedData}>
          <Layer
            id='stops-selected'
            type='circle'
            paint={{
              'circle-radius': 9,
              'circle-color': ['get', 'color'],
              'circle-stroke-width': 3,
              'circle-stroke-color': '#ffffff',
            }}
          />
        </Source>
        {clusters.map((c) => (
          <Marker
            key={`${c.kind}:${c.id}`}
            longitude={c.coord[0]}
            latitude={c.coord[1]}
            anchor='center'
            offset={CLUSTER_OFFSET[c.kind]}
            style={{ pointerEvents: 'none' }}
          >
            <Box
              component='span'
              sx={{
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 700,
                pointerEvents: 'none',
              }}
            >
              {c.count >= 1000 ? `${Math.round(c.count / 100) / 10}k` : c.count}
            </Box>
          </Marker>
        ))}
        <NavigationControl position='top-right' />
        {popupCoord != null && (
          <Popup
            longitude={popupCoord[0]}
            latitude={popupCoord[1]}
            focusAfterOpen={false}
            offset={12}
            maxWidth='min(640px, 90vw)'
            closeOnClick={false}
            onClose={() => onSelect(null)}
          >
            {selection?.type === 'overlay' ? (
              <UnchangedStopDetails
                stopId={selection.stop[0]}
                name={selection.stop[3]}
                feed={selection.feed}
              />
            ) : selectedStop ? (
              <StopDetails
                stop={selectedStop}
                columns={columns}
                routes={routes}
                minMoveM={minMoveM}
              />
            ) : null}
          </Popup>
        )}
      </MapGL>
    </Box>
  );
}
