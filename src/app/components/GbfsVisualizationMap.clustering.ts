import Supercluster from 'supercluster';
import type {
  GbfsStationWithStatus,
  GbfsVehicle,
  GbfsVehicleType,
} from '../services/gbfs/gbfs-feed-types';
import type { GbfsMapFilters } from './GbfsMap/GbfsMapFilterPanel';

// ─── GeoJSON Feature Builders ────────────────────────────────────────────────

function computeCapacityLevel(station: GbfsStationWithStatus): string {
  const capacity = station.capacity ?? 0;
  const available = station.status?.num_bikes_available ?? 0;
  if (capacity === 0) return 'unknown';
  const ratio = available / capacity;
  if (ratio >= 0.6) return 'high';
  if (ratio >= 0.3) return 'medium';
  if (available > 0) return 'low';
  return 'empty';
}

export function stationsToGeoJSON(
  stations: GbfsStationWithStatus[],
  filters?: GbfsMapFilters,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: stations
      .filter((s) => s.lat !== 0 || s.lon !== 0)
      .filter((s) => {
        if (filters == null) return true;
        if (!filters.showStations) return false;
        const isVirtual = s.is_virtual_station === true;
        if (isVirtual && !filters.showVirtualStations) return false;
        if (!isVirtual && !filters.showPhysicalStations) return false;
        return true;
      })
      .map((station) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [station.lon, station.lat],
        },
        properties: {
          id: station.station_id,
          name: station.name,
          is_virtual: station.is_virtual_station === true,
          has_area: station.station_area != null,
          capacity: station.capacity ?? null,
          capacity_level: computeCapacityLevel(station),
          bikes_available: station.status?.num_bikes_available ?? null,
          docks_available: station.status?.num_docks_available ?? null,
          is_renting: station.status?.is_renting ?? true,
          is_returning: station.status?.is_returning ?? true,
          is_installed: station.status?.is_installed ?? true,
          address: station.address ?? '',
          rental_methods: JSON.stringify(station.rental_methods ?? []),
          _raw: JSON.stringify(station._raw),
          _raw_status: JSON.stringify(station.status?._raw ?? {}),
        },
      })),
  };
}

export function vehiclesToGeoJSON(
  vehicles: GbfsVehicle[],
  vehicleTypes: GbfsVehicleType[],
  filters?: GbfsMapFilters,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const typeMap = new Map(vehicleTypes.map((vt) => [vt.vehicle_type_id, vt]));

  return {
    type: 'FeatureCollection',
    features: vehicles
      .filter((v) => v.lat !== 0 || v.lon !== 0)
      .filter((v) => {
        if (filters == null) return true;
        if (!filters.showVehicles) return false;
        const vType =
          v.vehicle_type_id != null
            ? typeMap.get(v.vehicle_type_id)
            : undefined;
        const formFactor = vType?.form_factor ?? 'other';
        if (!filters.vehicleFormFactors[formFactor]) return false;
        return true;
      })
      .map((vehicle) => {
        const vType =
          vehicle.vehicle_type_id != null
            ? typeMap.get(vehicle.vehicle_type_id)
            : undefined;

        return {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [vehicle.lon, vehicle.lat],
          },
          properties: {
            id: vehicle.vehicle_id,
            form_factor: vType?.form_factor ?? 'other',
            propulsion_type: vType?.propulsion_type ?? '',
            vehicle_type_name: vType?.name ?? '',
            is_reserved: vehicle.is_reserved,
            is_disabled: vehicle.is_disabled,
            battery: vehicle.current_fuel_percent ?? -1,
            range_meters: vehicle.current_range_meters ?? -1,
            pricing_plan_id: vehicle.pricing_plan_id ?? '',
            vehicle_type_id: vehicle.vehicle_type_id ?? '',
            _raw: JSON.stringify(vehicle._raw),
          },
        };
      }),
  };
}

// ─── Supercluster Instances ──────────────────────────────────────────────────

export function createStationCluster(): Supercluster {
  return new Supercluster({
    radius: 60,
    maxZoom: 16,
    map: (props) => ({
      is_virtual: props.is_virtual,
      bikes_total: props.bikes_available,
      docks_total: props.docks_available,
    }),
    reduce: (accumulated, props) => {
      accumulated.bikes_total += props.bikes_total;
      accumulated.docks_total += props.docks_total;
    },
  });
}

export function createVehicleCluster(): Supercluster {
  return new Supercluster({
    radius: 60,
    maxZoom: 16,
    map: (props) => ({
      form_factor: props.form_factor,
    }),
    reduce: () => {
      // No aggregation needed for vehicles beyond count
    },
  });
}

// ─── Bounds Calculation ──────────────────────────────────────────────────────

export interface MapBounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export function computeBoundsFromGeoJSON(
  ...collections: Array<GeoJSON.FeatureCollection | undefined | null>
): MapBounds | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let hasPoints = false;

  for (const collection of collections) {
    if (collection == null) continue;
    for (const feature of collection.features) {
      if (feature.geometry.type === 'Point') {
        const [lng, lat] = feature.geometry.coordinates;
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
        hasPoints = true;
      } else if (
        feature.geometry.type === 'Polygon' ||
        feature.geometry.type === 'MultiPolygon'
      ) {
        const coords =
          feature.geometry.type === 'Polygon'
            ? feature.geometry.coordinates.flat()
            : feature.geometry.coordinates.flat(2);
        for (const coord of coords) {
          minLng = Math.min(minLng, coord[0]);
          minLat = Math.min(minLat, coord[1]);
          maxLng = Math.max(maxLng, coord[0]);
          maxLat = Math.max(maxLat, coord[1]);
          hasPoints = true;
        }
      }
    }
  }

  if (!hasPoints) return null;

  // Add small padding for single-point case
  if (minLng === maxLng && minLat === maxLat) {
    const padding = 0.005;
    minLng -= padding;
    minLat -= padding;
    maxLng += padding;
    maxLat += padding;
  }

  return { minLng, minLat, maxLng, maxLat };
}

// ─── Virtual Station Areas ───────────────────────────────────────────────────

export function virtualStationAreasToGeoJSON(
  stations: GbfsStationWithStatus[],
): GeoJSON.FeatureCollection | null {
  const features = stations
    .filter((s) => s.is_virtual_station === true && s.station_area != null)
    .map(
      (s): GeoJSON.Feature => ({
        type: 'Feature',
        geometry: s.station_area as GeoJSON.MultiPolygon,
        properties: {
          id: s.station_id,
          name: s.name,
          _raw: JSON.stringify(s._raw),
        },
      }),
    );

  if (features.length === 0) return null;
  return { type: 'FeatureCollection', features };
}
