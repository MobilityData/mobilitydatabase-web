/**
 * Normalized GBFS feed data types.
 * These interfaces represent the internal, version-agnostic data model.
 * All GBFS versions (1.1–3.0) are normalized into these types by the parser.
 */

// ─── Station Types ───────────────────────────────────────────────────────────

export interface GbfsStation {
  station_id: string;
  name: string;
  lat: number;
  lon: number;
  address?: string;
  capacity?: number;
  is_virtual_station?: boolean;
  rental_methods?: string[];
  /** Region ID if available */
  region_id?: string;
  /** GeoJSON MultiPolygon for virtual station areas (GBFS v2.1+) */
  station_area?: GeoJSON.MultiPolygon;
  /** Raw source data for "View Raw Data" popup */
  _raw: Record<string, unknown>;
}

export interface GbfsStationStatus {
  station_id: string;
  num_bikes_available: number | undefined;
  num_docks_available?: number;
  is_installed: boolean;
  is_renting: boolean;
  is_returning: boolean;
  last_reported?: number;
  /** Vehicle counts by type, if available (v2.1+) */
  vehicle_types_available?: Array<{
    vehicle_type_id: string;
    count: number;
  }>;
  _raw: Record<string, unknown>;
}

/** Merged station info + status for map rendering */
export interface GbfsStationWithStatus extends GbfsStation {
  status?: GbfsStationStatus;
}

// ─── Vehicle Types ───────────────────────────────────────────────────────────

export interface GbfsVehicle {
  vehicle_id: string;
  lat: number;
  lon: number;
  is_reserved: boolean;
  is_disabled: boolean;
  vehicle_type_id?: string;
  /** Pricing plan for this vehicle, if assigned */
  pricing_plan_id?: string;
  /** Battery level 0–100, if electric */
  current_fuel_percent?: number;
  /** Range in meters remaining */
  current_range_meters?: number;
  /** Station this vehicle is docked at, if any */
  station_id?: string;
  _raw: Record<string, unknown>;
}

export interface GbfsVehicleType {
  vehicle_type_id: string;
  form_factor: string; // 'bicycle' | 'scooter' | 'car' | 'moped' | 'cargo_bicycle' | 'other'
  propulsion_type?: string; // 'human' | 'electric_assist' | 'electric' | 'combustion' | 'combustion_diesel' | 'hybrid' | 'plug_in_hybrid' | 'hydrogen_fuel_cell'
  name?: string;
  max_range_meters?: number;
  default_pricing_plan_id?: string;
  _raw: Record<string, unknown>;
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

export interface GbfsPricingPlan {
  plan_id: string;
  name: string;
  currency: string;
  price: number;
  description?: string;
  is_taxable: boolean;
  url?: string;
  _raw: Record<string, unknown>;
}

// ─── Geofencing ──────────────────────────────────────────────────────────────

export interface GbfsGeofencingRule {
  ride_start_allowed: boolean;
  ride_end_allowed: boolean;
  ride_through_allowed: boolean;
  station_parking?: boolean;
  /** Vehicle types this rule applies to, if scoped */
  vehicle_type_ids?: string[];
}

export interface GbfsGeofencingZone {
  type: 'Feature';
  geometry: GeoJSON.Geometry;
  properties: {
    name?: string;
    rules: GbfsGeofencingRule[];
    _raw: Record<string, unknown>;
  };
}

export interface GbfsGeofencingData {
  type: 'FeatureCollection';
  features: GbfsGeofencingZone[];
}

// ─── Aggregated Feed Data ────────────────────────────────────────────────────

export interface GbfsFeedData {
  /** Detected GBFS version */
  version: string;
  /** System-level info */
  systemInfo?: {
    system_id?: string;
    name?: string;
    operator?: string;
    timezone?: string;
    language?: string;
  };
  stations: GbfsStationWithStatus[];
  vehicles: GbfsVehicle[];
  vehicleTypes: GbfsVehicleType[];
  pricingPlans: GbfsPricingPlan[];
  geofencingZones?: GbfsGeofencingData;
}

// ─── Auto-Discovery Types ────────────────────────────────────────────────────

/** Known GBFS feed file names */
export type GbfsFeedName =
  | 'gbfs'
  | 'gbfs_versions'
  | 'system_information'
  | 'station_information'
  | 'station_status'
  | 'free_bike_status'
  | 'vehicle_status'
  | 'vehicle_types'
  | 'system_pricing_plans'
  | 'geofencing_zones'
  | 'system_regions'
  | 'system_alerts';

export interface GbfsAutoDiscoveryFeed {
  name: GbfsFeedName;
  url: string;
}

export interface GbfsFeedUrls {
  station_information?: string;
  station_status?: string;
  free_bike_status?: string;
  vehicle_status?: string;
  vehicle_types?: string;
  system_pricing_plans?: string;
  geofencing_zones?: string;
  system_information?: string;
}

/** Shape of the proxy request body */
export interface GbfsProxyRequest {
  url: string;
  auth?: {
    type: 'basic' | 'bearer' | 'oauth';
    username?: string;
    password?: string;
    token?: string;
    clientId?: string;
    clientSecret?: string;
    tokenUrl?: string;
  };
}
