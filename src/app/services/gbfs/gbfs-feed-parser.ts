import {
  type GbfsAutoDiscoveryFeed,
  type GbfsFeedData,
  type GbfsFeedUrls,
  type GbfsStation,
  type GbfsStationStatus,
  type GbfsStationWithStatus,
  type GbfsVehicle,
  type GbfsVehicleType,
  type GbfsPricingPlan,
  type GbfsGeofencingData,
  type GbfsGeofencingZone,
} from './gbfs-feed-types';

// ─── Auto-Discovery Parsing ─────────────────────────────────────────────────

/**
 * Detect GBFS version from auto-discovery response.
 * v3.0 has `data.feeds[]` directly; v1.x–2.x have `data.{lang}.feeds[]`.
 */
export function detectGbfsVersion(
  autoDiscovery: Record<string, unknown>,
): string {
  // v3.0 has `version` at top level of data
  if (
    typeof autoDiscovery.version === 'string' &&
    autoDiscovery.version.startsWith('3')
  ) {
    return autoDiscovery.version;
  }

  const data = autoDiscovery.data as Record<string, unknown> | undefined;
  if (data == null) return 'unknown';

  // v3.0: data.feeds is an array directly
  if (Array.isArray(data.feeds)) {
    // Check if any feed reports v3
    return autoDiscovery.version?.toString() ?? '3.0';
  }

  // v1.x–2.x: data.{lang}.feeds where lang is a language key
  // Version can be in the response or detected from feed structure
  if (typeof autoDiscovery.version === 'string') {
    return autoDiscovery.version;
  }

  // Try to infer from structure
  for (const key of Object.keys(data)) {
    const langData = data[key] as Record<string, unknown> | undefined;
    if (langData != null && Array.isArray(langData.feeds)) {
      return '2.0'; // Default to 2.0 if we can't determine exactly
    }
  }

  return 'unknown';
}

/**
 * Extract feed URLs from a GBFS auto-discovery response.
 * Handles both v3.0 (flat) and v1.x–2.x (language-nested) structures.
 * @param language - Preferred language for v1.x–2.x feeds. Falls back to first available.
 */
export function parseAutoDiscovery(
  autoDiscovery: Record<string, unknown>,
  language?: string,
): GbfsFeedUrls {
  const data = autoDiscovery.data as Record<string, unknown> | undefined;
  if (data == null) return {};

  let feeds: GbfsAutoDiscoveryFeed[] = [];

  // v3.0: data.feeds is an array directly
  if (Array.isArray(data.feeds)) {
    feeds = data.feeds as GbfsAutoDiscoveryFeed[];
  } else {
    // v1.x–2.x: data.{lang}.feeds
    const langKeys = Object.keys(data);
    const selectedLang =
      language != null && langKeys.includes(language) ? language : langKeys[0];

    if (selectedLang != null) {
      const langData = data[selectedLang] as Record<string, unknown>;
      if (langData != null && Array.isArray(langData.feeds)) {
        feeds = langData.feeds as GbfsAutoDiscoveryFeed[];
      }
    }
  }

  const urls: GbfsFeedUrls = {};
  for (const feed of feeds) {
    const name = feed.name;
    if (name === 'station_information') urls.station_information = feed.url;
    else if (name === 'station_status') urls.station_status = feed.url;
    else if (name === 'free_bike_status') urls.free_bike_status = feed.url;
    else if (name === 'vehicle_status') urls.vehicle_status = feed.url;
    else if (name === 'vehicle_types') urls.vehicle_types = feed.url;
    else if (name === 'system_pricing_plans')
      urls.system_pricing_plans = feed.url;
    else if (name === 'geofencing_zones') urls.geofencing_zones = feed.url;
    else if (name === 'system_information') urls.system_information = feed.url;
  }

  return urls;
}

// ─── Station Parsing ─────────────────────────────────────────────────────────

export function parseStations(data: Record<string, unknown>): GbfsStation[] {
  const stationsData = extractDataArray(data, ['stations']);
  return stationsData.map(
    (s: Record<string, unknown>): GbfsStation => ({
      station_id: String(s.station_id ?? ''),
      name: resolveName(s.name, resolveName(s.station_name, '')),
      lat: Number(s.lat ?? 0),
      lon: Number(s.lon ?? 0),
      address: s.address != null ? resolveName(s.address, '') : undefined,
      capacity: s.capacity != null ? Number(s.capacity) : undefined,
      is_virtual_station: s.is_virtual_station === true,
      rental_methods: Array.isArray(s.rental_methods)
        ? (s.rental_methods as string[])
        : undefined,
      region_id: s.region_id != null ? String(s.region_id) : undefined,
      station_area:
        s.station_area != null &&
        typeof s.station_area === 'object' &&
        (s.station_area as Record<string, unknown>).type === 'MultiPolygon'
          ? (s.station_area as GeoJSON.MultiPolygon)
          : undefined,
      _raw: s,
    }),
  );
}

export function parseStationStatuses(
  data: Record<string, unknown>,
): GbfsStationStatus[] {
  const statuses = extractDataArray(data, ['stations']);
  return statuses.map(
    (s: Record<string, unknown>): GbfsStationStatus => ({
      station_id: String(s.station_id ?? ''),
      num_bikes_available:
        s.num_bikes_available != null ? Number(s.num_bikes_available) : undefined,
      num_docks_available:
        s.num_docks_available != null
          ? Number(s.num_docks_available)
          : undefined,
      is_installed: s.is_installed !== false,
      is_renting: s.is_renting !== false,
      is_returning: s.is_returning !== false,
      last_reported:
        s.last_reported != null ? Number(s.last_reported) : undefined,
      vehicle_types_available: Array.isArray(s.vehicle_types_available)
        ? (s.vehicle_types_available as Array<{
            vehicle_type_id: string;
            count: number;
          }>)
        : undefined,
      _raw: s,
    }),
  );
}

/** Merge station info with station status */
export function mergeStationsWithStatus(
  stations: GbfsStation[],
  statuses: GbfsStationStatus[],
): GbfsStationWithStatus[] {
  const statusMap = new Map<string, GbfsStationStatus>();
  for (const s of statuses) {
    statusMap.set(s.station_id, s);
  }
  return stations.map((station) => ({
    ...station,
    status: statusMap.get(station.station_id),
  }));
}

// ─── Vehicle Parsing ─────────────────────────────────────────────────────────

/**
 * Parse free-floating vehicles from free_bike_status (v1.x–2.x) or vehicle_status (v3.0).
 */
export function parseVehicles(data: Record<string, unknown>): GbfsVehicle[] {
  // v1.x–2.x uses "bikes", v3.0 uses "vehicles"
  const vehicles = extractDataArray(data, ['vehicles', 'bikes']);
  return vehicles
    .filter((v: Record<string, unknown>) => {
      // Only include free-floating (not docked) vehicles
      const lat = Number(v.lat ?? 0);
      const lon = Number(v.lon ?? 0);
      return lat !== 0 || lon !== 0;
    })
    .map(
      (v: Record<string, unknown>): GbfsVehicle => ({
        vehicle_id: String(v.vehicle_id ?? v.bike_id ?? ''),
        lat: Number(v.lat ?? 0),
        lon: Number(v.lon ?? 0),
        is_reserved: v.is_reserved === true || v.is_reserved === 1,
        is_disabled: v.is_disabled === true || v.is_disabled === 1,
        vehicle_type_id:
          v.vehicle_type_id != null ? String(v.vehicle_type_id) : undefined,
        pricing_plan_id:
          v.pricing_plan_id != null ? String(v.pricing_plan_id) : undefined,
        current_fuel_percent:
          v.current_fuel_percent != null
            ? Number(v.current_fuel_percent)
            : undefined,
        current_range_meters:
          v.current_range_meters != null
            ? Number(v.current_range_meters)
            : undefined,
        station_id: v.station_id != null ? String(v.station_id) : undefined,
        _raw: v,
      }),
    );
}

// ─── Vehicle Types Parsing ───────────────────────────────────────────────────

export function parseVehicleTypes(
  data: Record<string, unknown>,
): GbfsVehicleType[] {
  const types = extractDataArray(data, ['vehicle_types']);
  return types.map(
    (t: Record<string, unknown>): GbfsVehicleType => ({
      vehicle_type_id: String(t.vehicle_type_id ?? ''),
      form_factor: String(t.form_factor ?? 'other'),
      propulsion_type:
        t.propulsion_type != null ? String(t.propulsion_type) : undefined,
      name: t.name != null ? resolveName(t.name, '') : undefined,
      max_range_meters:
        t.max_range_meters != null ? Number(t.max_range_meters) : undefined,
      default_pricing_plan_id:
        t.default_pricing_plan_id != null
          ? String(t.default_pricing_plan_id)
          : undefined,
      _raw: t,
    }),
  );
}

// ─── Pricing Plans Parsing ───────────────────────────────────────────────────

export function parsePricingPlans(
  data: Record<string, unknown>,
): GbfsPricingPlan[] {
  const plans = extractDataArray(data, ['plans']);
  return plans.map(
    (p: Record<string, unknown>): GbfsPricingPlan => ({
      plan_id: String(p.plan_id ?? ''),
      name: resolveName(p.name, ''),
      currency: String(p.currency ?? ''),
      price: Number(p.price ?? 0),
      description: p.description != null ? resolveName(p.description, '') : undefined,
      is_taxable: p.is_taxable === true,
      url: p.url != null ? String(p.url) : undefined,
      _raw: p,
    }),
  );
}

// ─── Geofencing Parsing ──────────────────────────────────────────────────────

export function parseGeofencingZones(
  data: Record<string, unknown>,
): GbfsGeofencingData | undefined {
  // v2.1+: data.geofencing_zones is a GeoJSON FeatureCollection
  const geoData = (data.data as Record<string, unknown>)?.geofencing_zones as
    | Record<string, unknown>
    | undefined;

  if (geoData == null) return undefined;

  const features = geoData.features as Array<Record<string, unknown>>;
  if (!Array.isArray(features)) return undefined;

  const parsedFeatures: GbfsGeofencingZone[] = features.map((f) => {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const rules = Array.isArray(props.rules)
      ? (props.rules as Array<Record<string, unknown>>).map((r) => ({
          ride_start_allowed: r.ride_start_allowed !== false,
          ride_end_allowed: r.ride_end_allowed !== false,
          ride_through_allowed: r.ride_through_allowed !== false,
          station_parking: r.station_parking === true,
          vehicle_type_ids: Array.isArray(r.vehicle_type_ids)
            ? (r.vehicle_type_ids as string[])
            : undefined,
        }))
      : [];

    return {
      type: 'Feature' as const,
      geometry: f.geometry as GeoJSON.Geometry,
      properties: {
        name: props.name != null ? resolveName(props.name, '') : undefined,
        rules,
        _raw: props,
      },
    };
  });

  return {
    type: 'FeatureCollection',
    features: parsedFeatures,
  };
}

// ─── Full Feed Aggregation ───────────────────────────────────────────────────

export interface ParsedFeedResponses {
  autoDiscovery: Record<string, unknown>;
  stationInfo?: Record<string, unknown>;
  stationStatus?: Record<string, unknown>;
  vehicles?: Record<string, unknown>;
  vehicleTypes?: Record<string, unknown>;
  pricingPlans?: Record<string, unknown>;
  geofencingZones?: Record<string, unknown>;
  systemInfo?: Record<string, unknown>;
}

export function buildGbfsFeedData(
  responses: ParsedFeedResponses,
): GbfsFeedData {
  const version = detectGbfsVersion(responses.autoDiscovery);

  const stations =
    responses.stationInfo != null ? parseStations(responses.stationInfo) : [];
  const statuses =
    responses.stationStatus != null
      ? parseStationStatuses(responses.stationStatus)
      : [];
  const mergedStations = mergeStationsWithStatus(stations, statuses);

  const vehicles =
    responses.vehicles != null ? parseVehicles(responses.vehicles) : [];

  const vehicleTypes =
    responses.vehicleTypes != null
      ? parseVehicleTypes(responses.vehicleTypes)
      : [];

  const pricingPlans =
    responses.pricingPlans != null
      ? parsePricingPlans(responses.pricingPlans)
      : [];

  const geofencingZones =
    responses.geofencingZones != null
      ? parseGeofencingZones(responses.geofencingZones)
      : undefined;

  let systemInfo: GbfsFeedData['systemInfo'] | undefined;
  if (responses.systemInfo != null) {
    const sysData =
      (responses.systemInfo.data as Record<string, unknown>) ?? {};
    systemInfo = {
      system_id:
        sysData.system_id != null ? String(sysData.system_id) : undefined,
      name: sysData.name != null ? String(sysData.name) : undefined,
      operator: sysData.operator != null ? String(sysData.operator) : undefined,
      timezone: sysData.timezone != null ? String(sysData.timezone) : undefined,
      language: sysData.language != null ? String(sysData.language) : undefined,
    };
  }

  return {
    version,
    systemInfo,
    stations: mergedStations,
    vehicles,
    vehicleTypes,
    pricingPlans,
    geofencingZones,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract an array from the `data` field of a GBFS response.
 * Tries multiple key names in order (for version compatibility).
 */
function extractDataArray(
  response: Record<string, unknown>,
  keys: string[],
): Array<Record<string, unknown>> {
  const data = response.data as Record<string, unknown> | undefined;
  if (data == null) return [];

  for (const key of keys) {
    if (Array.isArray(data[key])) {
      return data[key] as Array<Record<string, unknown>>;
    }
  }

  return [];
}

/** Get the first string value from an object (for localized name fields) */
function getFirstValue(obj: Record<string, unknown>): string {
  const values = Object.values(obj);
  if (values.length === 0) return '';
  const first = values[0];
  // Handle nested objects (e.g., v3.0 translation objects {text, language})
  if (typeof first === 'object' && first != null) {
    const rec = first as Record<string, unknown>;
    // v3.0 translation object: { text: "...", language: "..." }
    if (typeof rec.text === 'string') return rec.text;
    return JSON.stringify(first);
  }
  return String(first);
}

/**
 * Resolve a multilingual name field to a plain string.
 * Handles:
 *   - string: return as-is
 *   - v3.0 array of { text, language }: pick first text
 *   - v1/v2 object { lang: value }: pick first value
 */
function resolveName(value: unknown, fallback: string = ''): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    // v3.0 translation array: [{ text: "...", language: "en" }, ...]
    for (const item of value) {
      if (typeof item === 'object' && item != null) {
        const rec = item as Record<string, unknown>;
        if (typeof rec.text === 'string') return rec.text;
      }
    }
    return value.length > 0 ? String(value[0]) : fallback;
  }
  if (typeof value === 'object' && value != null) {
    const result = getFirstValue(value as Record<string, unknown>);
    return result !== '' ? result : fallback;
  }
  return value != null ? String(value) : fallback;
}
