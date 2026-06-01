import type { ValidationResult } from '../../store/gbfs-validator-reducer';
import type { GbfsFeedData } from '../../services/gbfs/gbfs-feed-types';

/**
 * Maps validation errors to geographic locations (stations/vehicles) so
 * they can be displayed as an overlay on the GBFS map.
 *
 * Parses instancePath from errors like `/data/stations/3/name` to find
 * the affected station at index 3 and create an error marker at its location.
 */
export function buildErrorGeoJSON(
  validationResult: ValidationResult,
  feedData: GbfsFeedData,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const errorsByLocation = new Map<
    string,
    {
      lat: number;
      lon: number;
      errors: Array<{
        keyword: string;
        message: string;
        instancePath: string;
        fileName: string;
        fileUrl: string;
      }>;
    }
  >();

  const files = validationResult.summary?.files ?? [];

  for (const file of files) {
    if (file.errors == null || file.errors.length === 0) continue;

    for (const error of file.errors) {
      const path = error.instancePath ?? '';
      const location = resolveErrorLocation(path, file.name ?? '', feedData);
      if (location == null) continue;

      const key = `${location.lat.toFixed(6)},${location.lon.toFixed(6)}`;
      const existing = errorsByLocation.get(key);
      if (existing != null) {
        existing.errors.push({
          keyword: error.keyword ?? '',
          message: error.message ?? '',
          instancePath: path,
          fileName: file.name ?? '',
          fileUrl: file.url ?? '',
        });
      } else {
        errorsByLocation.set(key, {
          lat: location.lat,
          lon: location.lon,
          errors: [
            {
              keyword: error.keyword ?? '',
              message: error.message ?? '',
              instancePath: path,
              fileName: file.name ?? '',
              fileUrl: file.url ?? '',
            },
          ],
        });
      }
    }
  }

  const features: Array<GeoJSON.Feature<GeoJSON.Point>> = [];
  errorsByLocation.forEach((loc) => {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [loc.lon, loc.lat],
      },
      properties: {
        errorCount: loc.errors.length,
        _errors: JSON.stringify(loc.errors),
        _raw: JSON.stringify({ errors: loc.errors }),
      },
    });
  });

  return { type: 'FeatureCollection', features };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface ErrorLocation {
  lat: number;
  lon: number;
}

/**
 * Check whether a validation error can be located on the map.
 * Returns the lat/lon if resolvable, null otherwise.
 */
export function getErrorLocation(
  instancePath: string,
  fileName: string,
  feedData: GbfsFeedData,
): ErrorLocation | null {
  return resolveErrorLocation(instancePath, fileName, feedData);
}

/**
 * Attempt to resolve an error's instancePath to a geographic location.
 * Handles paths like:
 *   /data/stations/3/name → station index 3
 *   /data/bikes/5/lat → vehicle index 5
 *   /data/vehicles/2/vehicle_type_id → vehicle index 2
 */
function resolveErrorLocation(
  instancePath: string,
  fileName: string,
  feedData: GbfsFeedData,
): ErrorLocation | null {
  // Match patterns like /data/stations/N/... or /stations/N/...
  const stationMatch = instancePath.match(/\/?(?:data\/)?stations\/(\d+)/);
  if (
    stationMatch != null &&
    (fileName === 'station_information' || fileName === 'station_status')
  ) {
    const idx = parseInt(stationMatch[1], 10);
    if (idx < feedData.stations.length) {
      const station = feedData.stations[idx];
      if (station.lat !== 0 || station.lon !== 0) {
        return { lat: station.lat, lon: station.lon };
      }
    }
  }

  // Match patterns like /data/bikes/N/... or /data/vehicles/N/...
  const vehicleMatch = instancePath.match(
    /\/?(?:data\/)?(?:bikes|vehicles)\/(\d+)/,
  );
  if (
    vehicleMatch != null &&
    (fileName === 'free_bike_status' || fileName === 'vehicle_status')
  ) {
    const idx = parseInt(vehicleMatch[1], 10);
    if (idx < feedData.vehicles.length) {
      const vehicle = feedData.vehicles[idx];
      if (vehicle.lat !== 0 || vehicle.lon !== 0) {
        return { lat: vehicle.lat, lon: vehicle.lon };
      }
    }
  }

  return null;
}
