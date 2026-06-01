/** Shared types for GBFS map components */

export interface GbfsPopupItem {
  type: 'station' | 'vehicle' | 'geofencing' | 'error';
  properties: Record<string, unknown>;
  /** All overlapping zone properties for geofencing clicks */
  overlappingZones?: Array<Record<string, unknown>>;
}

export interface GbfsPopupData {
  longitude: number;
  latitude: number;
  items: GbfsPopupItem[];
}

export interface MapErrorDetails {
  fileName: string;
  fileUrl?: string;
  error: { keyword?: string; message?: string; instancePath?: string };
}
