'use client';

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import MapGL, {
  NavigationControl,
  Source,
  Layer,
  type MapRef,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Box, Button, IconButton, Skeleton, Typography } from '@mui/material';
import {
  Fullscreen,
  FullscreenExit,
  Refresh as RefreshIcon,
  FilterList,
} from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { useMapConfig } from '../../hooks/useMapConfig';
import type { GbfsFeedData } from '../../services/gbfs/gbfs-feed-types';
import type { ValidationResult } from '../../store/gbfs-validator-reducer';
import {
  stationsToGeoJSON,
  vehiclesToGeoJSON,
  virtualStationAreasToGeoJSON,
  computeBoundsFromGeoJSON,
} from '../GbfsVisualizationMap.clustering';
import {
  makeStationsClusterLayer,
  makeStationsClusterCountLayer,
  makeStationsUnclusteredLayer,
  makeVehiclesClusterLayer,
  makeVehiclesClusterCountLayer,
  makeVehiclesUnclusteredLayer,
  VEHICLE_FORM_FACTOR_COLORS,
  STATION_COLORS,
  geofencingFillLayer,
  geofencingOutlineLayer,
  virtualStationAreaFillLayer,
  virtualStationAreaOutlineLayer,
  errorsClusterLayer,
  errorsClusterCountLayer,
  errorsLayer,
  errorsCountLayer,
  ERROR_COLOR,
  registerMapIcons,
} from '../GbfsVisualizationMap.layers';
import { GbfsMapPopup } from './GbfsMapPopup';
import type { GbfsPopupData, GbfsPopupItem, MapErrorDetails } from './types';
import {
  GbfsMapFilterPanel,
  defaultFilters,
  type GbfsMapFilters,
} from './GbfsMapFilterPanel';
import { buildErrorGeoJSON } from '../../screens/GbfsValidator/mapErrorOverlay';

// ─── Props ───────────────────────────────────────────────────────────────────

export type { MapErrorDetails } from './types';

/** Imperative handle for controlling the map from parent components */
export interface GbfsMapHandle {
  /** Fly to a specific location and open an error popup */
  flyToError: (
    lat: number,
    lon: number,
    error: {
      keyword: string;
      message: string;
      instancePath: string;
      fileName: string;
      fileUrl?: string;
    },
  ) => void;
}

export interface GbfsVisualizationMapProps {
  feedData: GbfsFeedData | null;
  loading: boolean;
  error: string | null;
  validationResult?: ValidationResult;
  onRefresh?: () => void;
  onViewError?: (details: MapErrorDetails) => void;
  /** When this value changes a different feed is being shown — filters reset to defaults */
  feedUrl?: string | null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const GbfsVisualizationMap = forwardRef<
  GbfsMapHandle,
  GbfsVisualizationMapProps
>(function GbfsVisualizationMap(
  {
    feedData,
    loading,
    error,
    validationResult,
    onRefresh,
    onViewError,
    feedUrl,
  },
  ref,
) {
  const mapCfg = useMapConfig();
  const mapRef = useRef<MapRef>(null);
  const t = useTranslations('gbfsMap');

  const [popupData, setPopupData] = useState<GbfsPopupData | null>(null);
  const [filters, setFilters] = useState<GbfsMapFilters>(defaultFilters);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Reset filters when the user switches to a different feed
  useEffect(() => {
    setFilters(defaultFilters);
  }, [feedUrl]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iconsReady, setIconsReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapLoadedRef = useRef(false);

  // ─── Derived GeoJSON Data ────────────────────────────────────────────────

  const stationsGeoJSON = useMemo(() => {
    if (feedData == null) return null;
    return stationsToGeoJSON(feedData.stations, filters);
  }, [feedData, filters]);

  const vehiclesGeoJSON = useMemo(() => {
    if (feedData == null) return null;
    return vehiclesToGeoJSON(feedData.vehicles, feedData.vehicleTypes, filters);
  }, [feedData, filters]);

  const virtualStationAreasGeoJSON = useMemo(() => {
    if (
      feedData == null ||
      !filters.showStations ||
      !filters.showVirtualStations
    )
      return null;
    return virtualStationAreasToGeoJSON(feedData.stations);
  }, [feedData, filters.showStations, filters.showVirtualStations]);

  const geofencingGeoJSON = useMemo(() => {
    if (feedData?.geofencingZones == null) return null;
    // Flatten rules into top-level properties for MapLibre expressions
    return {
      type: 'FeatureCollection' as const,
      features: feedData.geofencingZones.features.map((f, index) => ({
        ...f,
        properties: {
          ...f.properties,
          name: f.properties.name ?? '',
          ride_start_allowed: f.properties.rules[0]?.ride_start_allowed ?? true,
          ride_end_allowed: f.properties.rules[0]?.ride_end_allowed ?? true,
          ride_through_allowed:
            f.properties.rules[0]?.ride_through_allowed ?? true,
          station_parking: f.properties.rules[0]?.station_parking ?? false,
          _rules: JSON.stringify(f.properties.rules),
          _raw: JSON.stringify(f.properties._raw),
          _precedence_index: index,
        },
      })),
    };
  }, [feedData]);

  const errorsGeoJSON = useMemo(() => {
    if (validationResult == null || feedData == null) return null;
    return buildErrorGeoJSON(validationResult, feedData);
  }, [validationResult, feedData]);

  // ─── Available form factors for filter panel ─────────────────────────────

  const availableFormFactors = useMemo(() => {
    if (feedData == null) return [];
    const factors = new Set(feedData.vehicleTypes.map((vt) => vt.form_factor));
    // Also check vehicles that might not have a type mapping
    for (const v of feedData.vehicles) {
      if (v.vehicle_type_id == null) factors.add('other');
    }
    return Array.from(factors);
  }, [feedData]);

  // Split stations GeoJSON by physical vs virtual for per-type coloured clusters
  const physicalStationsGeoJSON = useMemo(() => {
    if (stationsGeoJSON == null) return null;
    const features = stationsGeoJSON.features.filter(
      (f) => f.properties?.is_virtual !== true,
    );
    return features.length > 0
      ? { type: 'FeatureCollection' as const, features }
      : null;
  }, [stationsGeoJSON]);

  const virtualStationsGeoJSON = useMemo(() => {
    if (stationsGeoJSON == null) return null;
    const features = stationsGeoJSON.features.filter(
      (f) => f.properties?.is_virtual === true,
    );
    return features.length > 0
      ? { type: 'FeatureCollection' as const, features }
      : null;
  }, [stationsGeoJSON]);

  // Split vehicles GeoJSON by form factor for per-type coloured clusters
  const vehiclesByFormFactor = useMemo(() => {
    if (vehiclesGeoJSON == null)
      return {} as Record<string, GeoJSON.FeatureCollection<GeoJSON.Point>>;
    const byFF: Record<string, GeoJSON.FeatureCollection<GeoJSON.Point>> = {};
    for (const feature of vehiclesGeoJSON.features) {
      const ff = String(feature.properties?.form_factor ?? 'other');
      if (byFF[ff] == null) {
        byFF[ff] = { type: 'FeatureCollection', features: [] };
      }
      byFF[ff].features.push(feature);
    }
    return byFF;
  }, [vehiclesGeoJSON]);

  // ─── Auto-fit bounds when data loads ─────────────────────────────────────

  const fitBoundsToData = useCallback(() => {
    if (feedData == null || mapRef.current == null) return;
    const bounds = computeBoundsFromGeoJSON(
      stationsGeoJSON ?? undefined,
      vehiclesGeoJSON ?? undefined,
      geofencingGeoJSON as GeoJSON.FeatureCollection | undefined,
    );
    if (bounds != null) {
      mapRef.current.fitBounds(
        [
          [bounds.minLng, bounds.minLat],
          [bounds.maxLng, bounds.maxLat],
        ],
        { padding: 60, duration: 800 },
      );
    }
  }, [feedData, stationsGeoJSON, vehiclesGeoJSON, geofencingGeoJSON]);

  const handleMapLoad = useCallback(() => {
    mapLoadedRef.current = true;
    const map = mapRef.current?.getMap();
    if (map != null) {
      void registerMapIcons(map).then(() => {
        setIconsReady(true);
      });
    }
    fitBoundsToData();
  }, [fitBoundsToData]);

  useEffect(() => {
    if (mapLoadedRef.current) {
      fitBoundsToData();
    }
  }, [fitBoundsToData]);

  // ─── Imperative handle for parent components ───────────────────────────

  useImperativeHandle(
    ref,
    () => ({
      flyToError(lat, lon, err) {
        const map = mapRef.current?.getMap();
        if (map != null) {
          map.flyTo({ center: [lon, lat], zoom: 16, duration: 1200 });
        }
        setPopupData({
          longitude: lon,
          latitude: lat,
          items: [
            {
              type: 'error',
              properties: {
                errorCount: 1,
                _errors: JSON.stringify([err]),
                _raw: JSON.stringify({ errors: [err] }),
              },
            },
          ],
        });
      },
    }),
    [],
  );

  // ─── Click handling ──────────────────────────────────────────────────────

  const handleMapClick = useCallback(
    (
      event: maplibregl.MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[];
      },
    ) => {
      // Prevent flickering: ignore clicks that originate from a popup
      const target = event.originalEvent?.target;
      if (
        target instanceof HTMLElement &&
        target.closest('.maplibregl-popup') != null
      ) {
        return;
      }

      const map = mapRef.current?.getMap();
      if (map == null) return;

      const features = map.queryRenderedFeatures(event.point, {
        layers: [
          'stations-physical-unclustered',
          'stations-physical-cluster',
          'stations-virtual-unclustered',
          'stations-virtual-cluster',
          ...Object.keys(VEHICLE_FORM_FACTOR_COLORS).flatMap((ff) => [
            `vehicles-unclustered-${ff}`,
            `vehicles-cluster-${ff}`,
          ]),
          'geofencing-fill',
          'errors',
          'errors-cluster',
        ].filter((id) => {
          try {
            return map.getLayer(id) != null;
          } catch {
            return false;
          }
        }),
      });

      if (features.length === 0) {
        setPopupData(null);
        return;
      }

      const coords = event.lngLat;

      // Handle cluster expansion (takes precedence over individual feature popup)
      const clusterFeature = features.find(
        (f) =>
          f.layer.id === 'stations-physical-cluster' ||
          f.layer.id === 'stations-virtual-cluster' ||
          f.layer.id.startsWith('vehicles-cluster-') ||
          f.layer.id === 'errors-cluster',
      );
      if (clusterFeature != null) {
        const fLayerId = clusterFeature.layer.id;
        const sourceId =
          fLayerId === 'stations-physical-cluster'
            ? 'stations-physical'
            : fLayerId === 'stations-virtual-cluster'
              ? 'stations-virtual'
              : fLayerId.startsWith('vehicles-cluster-')
                ? fLayerId.replace('vehicles-cluster-', 'vehicles-')
                : 'errors';
        const source = map.getSource(sourceId);
        if (source != null && 'getClusterExpansionZoom' in source) {
          const clusterId = clusterFeature.properties.cluster_id as number;
          void (source as maplibregl.GeoJSONSource)
            .getClusterExpansionZoom(clusterId)
            .then((zoom) => {
              map.easeTo({ center: coords, zoom: Math.min(zoom, 18) });
            });
        }
        return;
      }

      // Collect one popup item per distinct feature type
      const items: GbfsPopupItem[] = [];
      const seenTypes = new Set<string>();
      for (const f of features) {
        const fLayerId = f.layer.id;
        if (
          (fLayerId === 'stations-physical-unclustered' ||
            fLayerId === 'stations-virtual-unclustered') &&
          !seenTypes.has('station')
        ) {
          seenTypes.add('station');
          items.push({
            type: 'station',
            properties: f.properties as Record<string, unknown>,
          });
        } else if (
          fLayerId.startsWith('vehicles-unclustered-') &&
          !seenTypes.has('vehicle')
        ) {
          seenTypes.add('vehicle');
          items.push({
            type: 'vehicle',
            properties: f.properties as Record<string, unknown>,
          });
        } else if (
          fLayerId === 'geofencing-fill' &&
          !seenTypes.has('geofencing')
        ) {
          seenTypes.add('geofencing');
          const geoFeatures = map.queryRenderedFeatures(event.point, {
            layers: ['geofencing-fill'],
          });
          const allZones = geoFeatures
            .map((gf) => gf.properties as Record<string, unknown>)
            .sort(
              (a, b) =>
                (Number(a._precedence_index) ?? 0) -
                (Number(b._precedence_index) ?? 0),
            );
          items.push({
            type: 'geofencing',
            properties: allZones[0] ?? {},
            overlappingZones: allZones.length > 1 ? allZones : undefined,
          });
        } else if (fLayerId === 'errors' && !seenTypes.has('error')) {
          seenTypes.add('error');
          items.push({
            type: 'error',
            properties: f.properties as Record<string, unknown>,
          });
        }
      }

      if (items.length === 0) {
        setPopupData(null);
        return;
      }

      setPopupData({
        longitude: coords.lng,
        latitude: coords.lat,
        items,
      });
    },
    [],
  );

  // ─── Fullscreen toggle ───────────────────────────────────────────────────

  const toggleFullscreen = useCallback(() => {
    if (containerRef.current == null) return;
    if (document.fullscreenElement == null) {
      void containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      });
    } else {
      void document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  }, []);

  useEffect(() => {
    const handler = (): void => {
      setIsFullscreen(document.fullscreenElement != null);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
    };
  }, []);

  // ─── Loading state ───────────────────────────────────────────────────────

  if (loading && feedData == null) {
    return (
      <Box sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <Skeleton variant='rectangular' height={500} />
      </Box>
    );
  }

  if (error != null && feedData == null) {
    return (
      <Box
        sx={{
          height: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        <Typography variant='body2' color='error'>
          {t('loadError')}: {error}
        </Typography>
        {onRefresh != null && (
          <Button size='small' onClick={onRefresh} startIcon={<RefreshIcon />}>
            {t('retry')}
          </Button>
        )}
      </Box>
    );
  }

  const hasData =
    feedData != null &&
    (feedData.stations.length > 0 ||
      feedData.vehicles.length > 0 ||
      feedData.geofencingZones != null);

  if (!hasData && !loading) {
    return (
      <Box
        sx={{
          height: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant='body2' color='text.secondary'>
          {t('noMapData')}
        </Typography>
      </Box>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        height: isFullscreen ? '100vh' : 400,
        borderRadius: 1,
        overflow: 'hidden',
        display: 'flex',
      }}
    >
      {/* Filter Panel */}
      {showFilterPanel && (
        <Box
          sx={{
            position: { xs: 'absolute', md: 'relative' },
            zIndex: 10,
            top: 0,
            left: 0,
            height: '100%',
          }}
        >
          <GbfsMapFilterPanel
            filters={filters}
            onFiltersChange={setFilters}
            availableFormFactors={availableFormFactors}
            hasStations={feedData != null && feedData.stations.length > 0}
            hasPhysicalStations={
              feedData != null &&
              feedData.stations.some((s) => !s.is_virtual_station)
            }
            hasVirtualStations={
              feedData != null &&
              feedData.stations.some((s) => s.is_virtual_station === true)
            }
            hasVehicles={feedData != null && feedData.vehicles.length > 0}
            hasGeofencing={
              feedData?.geofencingZones != null &&
              feedData.geofencingZones.features.length > 0
            }
            hasErrors={
              errorsGeoJSON != null && errorsGeoJSON.features.length > 0
            }
            onClose={() => {
              setShowFilterPanel(false);
            }}
          />
        </Box>
      )}

      {/* Map */}
      <Box sx={{ flex: 1, position: 'relative' }}>
        <MapGL
          ref={mapRef}
          initialViewState={{
            longitude: 0,
            latitude: 0,
            zoom: 2,
          }}
          onLoad={handleMapLoad}
          onClick={handleMapClick}
          style={{ width: '100%', height: '100%' }}
          mapStyle={{
            version: 8,
            sources: {
              'raster-tiles': {
                type: 'raster',
                tiles: [mapCfg.basemapTileUrl],
                tileSize: 256,
                attribution:
                  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
            glyphs:
              'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
          }}
          interactiveLayerIds={[
            'stations-physical-unclustered',
            'stations-physical-cluster',
            'stations-virtual-unclustered',
            'stations-virtual-cluster',
            ...Object.keys(VEHICLE_FORM_FACTOR_COLORS).map(
              (ff) => `vehicles-unclustered-${ff}`,
            ),
            ...Object.keys(VEHICLE_FORM_FACTOR_COLORS).map(
              (ff) => `vehicles-cluster-${ff}`,
            ),
            'geofencing-fill',
            'virtual-station-areas-fill',
            'errors',
            'errors-cluster',
          ]}
          cursor='pointer'
        >
          <NavigationControl position='top-right' />

          {/* Virtual Station Areas (rendered behind everything) */}
          {virtualStationAreasGeoJSON != null && (
            <Source
              id='virtual-station-areas'
              type='geojson'
              data={virtualStationAreasGeoJSON}
            >
              <Layer {...virtualStationAreaFillLayer} />
              <Layer {...virtualStationAreaOutlineLayer} />
            </Source>
          )}

          {/* Geofencing Source + Layers */}
          {geofencingGeoJSON != null && filters.showGeofencing && (
            <Source
              id='geofencing'
              type='geojson'
              data={geofencingGeoJSON as unknown as GeoJSON.FeatureCollection}
            >
              <Layer {...geofencingFillLayer} />
              <Layer {...geofencingOutlineLayer} />
            </Source>
          )}

          {/* Physical Stations Source + Layers */}
          {physicalStationsGeoJSON != null && (
            <Source
              id='stations-physical'
              type='geojson'
              data={physicalStationsGeoJSON}
              cluster={true}
              clusterMaxZoom={14}
              clusterRadius={60}
            >
              <Layer
                {...makeStationsClusterLayer(
                  'stations-physical',
                  STATION_COLORS.physical,
                )}
              />
              <Layer {...makeStationsClusterCountLayer('stations-physical')} />
              {iconsReady && (
                <Layer
                  {...makeStationsUnclusteredLayer('stations-physical', false)}
                />
              )}
            </Source>
          )}

          {/* Virtual Stations Source + Layers */}
          {virtualStationsGeoJSON != null && (
            <Source
              id='stations-virtual'
              type='geojson'
              data={virtualStationsGeoJSON}
              cluster={true}
              clusterMaxZoom={14}
              clusterRadius={60}
            >
              <Layer
                {...makeStationsClusterLayer(
                  'stations-virtual',
                  STATION_COLORS.virtual,
                )}
              />
              <Layer {...makeStationsClusterCountLayer('stations-virtual')} />
              {iconsReady && (
                <Layer
                  {...makeStationsUnclusteredLayer('stations-virtual', true)}
                />
              )}
            </Source>
          )}

          {/* Vehicles – one source+layer set per form factor for per-type colours */}
          {Object.entries(vehiclesByFormFactor).map(([ff, geoJson]) =>
            geoJson.features.length > 0 ? (
              <Source
                key={ff}
                id={`vehicles-${ff}`}
                type='geojson'
                data={geoJson}
                cluster={true}
                clusterMaxZoom={14}
                clusterRadius={60}
              >
                <Layer {...makeVehiclesClusterLayer(ff)} />
                <Layer {...makeVehiclesClusterCountLayer(ff)} />
                {iconsReady && <Layer {...makeVehiclesUnclusteredLayer(ff)} />}
              </Source>
            ) : null,
          )}

          {/* Error Overlay */}
          {errorsGeoJSON != null &&
            errorsGeoJSON.features.length > 0 &&
            filters.showErrors && (
              <Source
                id='errors'
                type='geojson'
                data={errorsGeoJSON}
                cluster={true}
                clusterMaxZoom={14}
                clusterRadius={50}
              >
                <Layer {...errorsClusterLayer} />
                <Layer {...errorsClusterCountLayer} />
                <Layer {...errorsLayer} />
                <Layer {...errorsCountLayer} />
              </Source>
            )}

          {/* Popup */}
          {popupData != null && (
            <GbfsMapPopup
              key={`${popupData.longitude}-${popupData.latitude}`}
              popupData={popupData}
              pricingPlans={feedData?.pricingPlans ?? []}
              onClose={() => {
                setPopupData(null);
              }}
              onViewError={
                onViewError != null
                  ? (err) => {
                      onViewError(err);
                    }
                  : undefined
              }
            />
          )}
        </MapGL>

        {/* Map Controls Overlay */}
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            zIndex: 5,
          }}
        >
          <IconButton
            size='small'
            onClick={() => {
              setShowFilterPanel((prev) => !prev);
            }}
            sx={{
              backgroundColor: 'background.paper',
              boxShadow: 1,
              '&:hover': { backgroundColor: 'action.hover' },
            }}
          >
            <FilterList fontSize='small' />
          </IconButton>
        </Box>

        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 48,
            display: 'flex',
            gap: 0.5,
            zIndex: 5,
          }}
        >
          {onRefresh != null && (
            <IconButton
              size='small'
              onClick={onRefresh}
              disabled={loading}
              sx={{
                backgroundColor: 'background.paper',
                boxShadow: 1,
                '&:hover': { backgroundColor: 'action.hover' },
              }}
              title={t('refreshData')}
            >
              <RefreshIcon fontSize='small' />
            </IconButton>
          )}
          <IconButton
            size='small'
            onClick={toggleFullscreen}
            sx={{
              backgroundColor: 'background.paper',
              boxShadow: 1,
              '&:hover': { backgroundColor: 'action.hover' },
            }}
            title={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
          >
            {isFullscreen ? (
              <FullscreenExit fontSize='small' />
            ) : (
              <Fullscreen fontSize='small' />
            )}
          </IconButton>
        </Box>

        {/* Loading overlay */}
        {loading && feedData != null && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 4,
              pointerEvents: 'none',
            }}
          >
            <Typography
              variant='body2'
              sx={{
                backgroundColor: 'background.paper',
                px: 2,
                py: 1,
                borderRadius: 1,
                boxShadow: 2,
              }}
            >
              {t('refreshing')}
            </Typography>
          </Box>
        )}

        {/* Data summary badge with legend */}
        {feedData != null && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              backgroundColor: 'background.paper',
              px: 1.5,
              py: 1,
              borderRadius: 1,
              boxShadow: 1,
              zIndex: 5,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
            }}
          >
            {feedData.geofencingZones != null &&
              feedData.geofencingZones.features.length > 0 && (
                <Typography variant='caption'>
                  <b>{feedData.geofencingZones.features.length}</b> {t('zones')}
                </Typography>
              )}
            {feedData.stations.some((s) => !s.is_virtual_station) && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: STATION_COLORS.physical,
                    flexShrink: 0,
                  }}
                />
                <Typography variant='caption'>
                  <b>
                    {feedData.stations.filter((s) => !s.is_virtual_station).length}
                  </b>{' '}
                  {t('physicalStation')}
                </Typography>
              </Box>
            )}
            {feedData.stations.some((s) => s.is_virtual_station === true) && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: STATION_COLORS.virtual,
                    flexShrink: 0,
                  }}
                />
                <Typography variant='caption'>
                  <b>
                    {feedData.stations.filter((s) => s.is_virtual_station === true).length}
                  </b>{' '}
                  {t('virtualStation')}
                </Typography>
              </Box>
            )}
            {availableFormFactors.map((ff) => {
              const count = vehiclesByFormFactor[ff]?.features.length ?? 0;
              if (count === 0) return null;
              return (
                <Box
                  key={ff}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
                >
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor:
                        VEHICLE_FORM_FACTOR_COLORS[ff] ??
                        VEHICLE_FORM_FACTOR_COLORS.other,
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    variant='caption'
                    sx={{ textTransform: 'capitalize' }}
                  >
                    <b>{count}</b> {ff.replace(/_/g, ' ')}
                  </Typography>
                </Box>
              );
            })}
            {(() => {
              const totalErrors =
                errorsGeoJSON?.features.reduce(
                  (sum, f) => sum + (Number(f.properties?.errorCount) || 0),
                  0,
                ) ?? 0;
              if (totalErrors === 0) return null;
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: ERROR_COLOR,
                      flexShrink: 0,
                    }}
                  />
                  <Typography variant='caption'>
                    <b>{totalErrors}</b> {t('validationErrors')}
                  </Typography>
                </Box>
              );
            })()}
          </Box>
        )}
      </Box>
    </Box>
  );
});
