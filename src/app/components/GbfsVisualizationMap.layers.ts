import type { LayerProps } from 'react-map-gl/maplibre';
import type maplibregl from 'maplibre-gl';

// ─── Color Constants ─────────────────────────────────────────────────────────

export const STATION_COLORS = {
  physical: '#1976d2', // blue
  virtual: '#9c27b0', // purple
} as const;

/** Station marker colors based on vehicle availability relative to capacity */
export const STATION_CAPACITY_COLORS: Record<string, string> = {
  high: '#4caf50', // green  — ≥60% available
  medium: '#ff9800', // orange — 30–59% available
  low: '#f44336', // red    — 1–29% available
  empty: '#9e9e9e', // gray   — 0 available
  unknown: '#1976d2', // blue   — no capacity data
};

export const VEHICLE_FORM_FACTOR_COLORS: Record<string, string> = {
  bicycle: '#4caf50', // green
  scooter: '#ff9800', // orange
  car: '#f44336', // red
  moped: '#ffeb3b', // yellow
  cargo_bicycle: '#8bc34a', // light green
  other: '#9e9e9e', // grey
};

/** Uniform color for all vehicle map icons (differentiated by shape only) */
export const VEHICLE_MAP_COLOR = '#4caf50';

export const GEOFENCE_RULE_COLORS: Record<string, string> = {
  ride_allowed: 'rgba(76, 175, 80, 0.25)', // green for fully allowed
  ride_restricted: 'rgba(255, 152, 0, 0.3)', // orange for partial restrictions
  ride_forbidden: 'rgba(244, 67, 54, 0.3)', // red for fully restricted
  station_parking: 'rgba(33, 150, 243, 0.25)', // blue for station parking
};

export const ERROR_COLOR = '#f44336';

// ─── Station Layers ──────────────────────────────────────────────────────────

export function makeStationsClusterLayer(
  sourceId: string,
  color: string,
): LayerProps {
  return {
    id: `${sourceId}-cluster`,
    type: 'circle',
    source: sourceId,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': color,
      'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 32],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff',
    },
  };
}

export function makeStationsClusterCountLayer(sourceId: string): LayerProps {
  return {
    id: `${sourceId}-cluster-count`,
    type: 'symbol',
    source: sourceId,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-size': 13,
      'text-font': ['Open Sans Bold'],
    },
    paint: {
      'text-color': '#ffffff',
    },
  };
}

export function makeStationsUnclusteredLayer(
  sourceId: string,
  isVirtual: boolean,
): LayerProps {
  const prefix = isVirtual ? 'virtual-station' : 'station';
  return {
    id: `${sourceId}-unclustered`,
    type: 'symbol',
    source: sourceId,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': [
        'match',
        ['get', 'capacity_level'],
        'high',
        `${prefix}-high`,
        'medium',
        `${prefix}-medium`,
        'low',
        `${prefix}-low`,
        'empty',
        `${prefix}-empty`,
        `${prefix}-unknown`,
      ],
      'icon-size': 1,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  };
}

// ─── Vehicle Layers ──────────────────────────────────────────────────────────

export function makeVehiclesClusterLayer(formFactor: string): LayerProps {
  const color =
    VEHICLE_FORM_FACTOR_COLORS[formFactor] ?? VEHICLE_FORM_FACTOR_COLORS.other;
  return {
    id: `vehicles-cluster-${formFactor}`,
    type: 'circle',
    source: `vehicles-${formFactor}`,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': color,
      'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff',
    },
  };
}

export function makeVehiclesClusterCountLayer(formFactor: string): LayerProps {
  const color =
    VEHICLE_FORM_FACTOR_COLORS[formFactor] ?? VEHICLE_FORM_FACTOR_COLORS.other;
  // Use dark text on light-coloured cluster bubbles (e.g. moped yellow)
  const textColor =
    color === VEHICLE_FORM_FACTOR_COLORS.moped ? '#000000' : '#ffffff';
  return {
    id: `vehicles-cluster-count-${formFactor}`,
    type: 'symbol',
    source: `vehicles-${formFactor}`,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-size': 12,
      'text-font': ['Open Sans Bold'],
    },
    paint: {
      'text-color': textColor,
    },
  };
}

export function makeVehiclesUnclusteredLayer(formFactor: string): LayerProps {
  return {
    id: `vehicles-unclustered-${formFactor}`,
    type: 'symbol',
    source: `vehicles-${formFactor}`,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': `vehicle-${formFactor}`,
      'icon-size': 0.70,
    },
  };
}

// ─── Geofencing Layers ───────────────────────────────────────────────────────

export const geofencingFillLayer: LayerProps = {
  id: 'geofencing-fill',
  type: 'fill',
  source: 'geofencing',
  paint: {
    'fill-color': [
      'case',
      // Fully restricted
      [
        'all',
        ['==', ['get', 'ride_start_allowed'], false],
        ['==', ['get', 'ride_end_allowed'], false],
        ['==', ['get', 'ride_through_allowed'], false],
      ],
      GEOFENCE_RULE_COLORS.ride_forbidden,
      // Partial restriction
      [
        'any',
        ['==', ['get', 'ride_start_allowed'], false],
        ['==', ['get', 'ride_end_allowed'], false],
        ['==', ['get', 'ride_through_allowed'], false],
      ],
      GEOFENCE_RULE_COLORS.ride_restricted,
      // Station parking zone
      ['==', ['get', 'station_parking'], true],
      GEOFENCE_RULE_COLORS.station_parking,
      // Fully allowed
      GEOFENCE_RULE_COLORS.ride_allowed,
    ],
    'fill-opacity': 0.6,
  },
};

export const geofencingOutlineLayer: LayerProps = {
  id: 'geofencing-outline',
  type: 'line',
  source: 'geofencing',
  paint: {
    'line-color': [
      'case',
      [
        'all',
        ['==', ['get', 'ride_start_allowed'], false],
        ['==', ['get', 'ride_end_allowed'], false],
        ['==', ['get', 'ride_through_allowed'], false],
      ],
      '#d32f2f',
      [
        'any',
        ['==', ['get', 'ride_start_allowed'], false],
        ['==', ['get', 'ride_end_allowed'], false],
        ['==', ['get', 'ride_through_allowed'], false],
      ],
      '#e65100',
      '#388e3c',
    ],
    'line-width': 2,
    'line-dasharray': [2, 2],
  },
};

// ─── Error Overlay Layers ────────────────────────────────────────────────────

export const errorsClusterLayer: LayerProps = {
  id: 'errors-cluster',
  type: 'circle',
  source: 'errors',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': ERROR_COLOR,
    'circle-radius': ['step', ['get', 'point_count'], 14, 5, 20, 20, 26],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#fff',
    'circle-opacity': 0.8,
  },
};

export const errorsClusterCountLayer: LayerProps = {
  id: 'errors-cluster-count',
  type: 'symbol',
  source: 'errors',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': '{point_count_abbreviated}',
    'text-size': 11,
    'text-font': ['Open Sans Bold'],
  },
  paint: {
    'text-color': '#ffffff',
  },
};

export const errorsLayer: LayerProps = {
  id: 'errors',
  type: 'circle',
  source: 'errors',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': ERROR_COLOR,
    'circle-radius': 10,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#fff',
    'circle-opacity': 0.7,
  },
};

export const errorsCountLayer: LayerProps = {
  id: 'errors-count',
  type: 'symbol',
  source: 'errors',
  filter: ['!', ['has', 'point_count']],
  layout: {
    'text-field': '{errorCount}',
    'text-size': 10,
    'text-font': ['Open Sans Bold'],
  },
  paint: {
    'text-color': '#ffffff',
  },
};

// ─── Virtual Station Area Layers ─────────────────────────────────────────────

export const virtualStationAreaFillLayer: LayerProps = {
  id: 'virtual-station-areas-fill',
  type: 'fill',
  source: 'virtual-station-areas',
  paint: {
    'fill-color': STATION_COLORS.virtual,
    'fill-opacity': 0.2,
  },
};

export const virtualStationAreaOutlineLayer: LayerProps = {
  id: 'virtual-station-areas-outline',
  type: 'line',
  source: 'virtual-station-areas',
  paint: {
    'line-color': STATION_COLORS.virtual,
    'line-width': 2,
    'line-dasharray': [3, 2],
  },
};

// ─── SVG Icon Definitions ────────────────────────────────────────────────────

/** Renders an SVG string onto a canvas ImageData for MapLibre addImage */
async function svgToImageData(
  svgStr: string,
  size: number,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  return await new Promise((resolve, reject) => {
    const img = new Image(size, size);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx == null) {
        reject(new Error('no 2d context'));
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      const imageData = ctx.getImageData(0, 0, size, size);
      resolve({ width: size, height: size, data: imageData.data });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function makeMarkerSvg(iconPath: string, color: string): string {
  return `<svg fill="#000000" viewBox="0 0 32 32" width="32" height="32" version="1.1" xmlns="http://www.w3.org/2000/svg">
  <circle cx="16" cy="16" r="14" fill="${color}" stroke="#fff" stroke-width="2"/>
<path transform="translate(8,8) scale(0.667)" d="${iconPath}" fill="#fff"></path>
</svg>`;
} 

// MUI icon paths (simplified 24x24 viewBox)
const ICON_PATHS = {
  // PedalBike
  bicycle:
    'M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm14-8.5c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zM12 3.5l-3.5 5H12l1 3h-2.5L8 17h2l1.5-4H15l-1-3h3l-2-5h-3z',
  // ElectricScooter
  scooter:
    'M7.82 16H15v-1c0-2.21 1.79-4 4-4h.74l-1.9-8.44C17.63 1.65 16.78 1 15.79 1H12v2h3.79l1.61 7.14C16.01 10.65 15 11.72 15 13v1H7.82c-.48-1.72-2.04-3-3.82-3-2.21 0-4 1.79-4 4s1.79 4 4 4c1.78 0 3.34-1.28 3.82-3zM4 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm15-3c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2zM14 20v2h6v-2h-6z',
  // DirectionsCar
  car: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
  // TwoWheeler
  moped:
    'M19 7c0-1.1-.9-2-2-2h-3v2h3v2.65L13.52 14H10V9H6c-2.21 0-4 1.79-4 4v3h2c0 1.66 1.34 3 3 3s3-1.34 3-3h4.48L19 10.35V7zM7 17c-.55 0-1-.45-1-1h2c0 .55-.45 1-1 1zm10-3c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm0 4c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z',
  // LocalParking (station)
  parking:
    'M13 3H6v18h4v-6h3c3.31 0 6-2.69 6-6s-2.69-6-6-6zm.2 8H10V7h3.2c1.1 0 2 .9 2 2s-.9 2-2 2z',
  // Place/pin (fallback)
  other:
    'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
};

/** Register all custom marker icons on the MapLibre map instance */
export async function registerMapIcons(map: maplibregl.Map): Promise<void> {
  const size = 32;
  const icons: Array<[string, string]> = [
    // Station icons – colored by availability / capacity ratio
    [
      'station-high',
      makeMarkerSvg(ICON_PATHS.parking, STATION_CAPACITY_COLORS.high),
    ],
    [
      'station-medium',
      makeMarkerSvg(ICON_PATHS.parking, STATION_CAPACITY_COLORS.medium),
    ],
    [
      'station-low',
      makeMarkerSvg(ICON_PATHS.parking, STATION_CAPACITY_COLORS.low),
    ],
    [
      'station-empty',
      makeMarkerSvg(ICON_PATHS.parking, STATION_CAPACITY_COLORS.empty),
    ],
    [
      'station-unknown',
      makeMarkerSvg(ICON_PATHS.parking, STATION_CAPACITY_COLORS.unknown),
    ],
    // Virtual station icons – always purple, same capacity levels
    ['virtual-station-high', makeMarkerSvg(ICON_PATHS.parking, STATION_COLORS.virtual)],
    ['virtual-station-medium', makeMarkerSvg(ICON_PATHS.parking, STATION_COLORS.virtual)],
    ['virtual-station-low', makeMarkerSvg(ICON_PATHS.parking, STATION_COLORS.virtual)],
    ['virtual-station-empty', makeMarkerSvg(ICON_PATHS.parking, STATION_COLORS.virtual)],
    ['virtual-station-unknown', makeMarkerSvg(ICON_PATHS.parking, STATION_COLORS.virtual)],
    // Vehicle icons – unique color per form factor
    ['vehicle-bicycle', makeMarkerSvg(ICON_PATHS.bicycle, VEHICLE_FORM_FACTOR_COLORS.bicycle)],
    ['vehicle-scooter', makeMarkerSvg(ICON_PATHS.scooter, VEHICLE_FORM_FACTOR_COLORS.scooter)],
    ['vehicle-car', makeMarkerSvg(ICON_PATHS.car, VEHICLE_FORM_FACTOR_COLORS.car)],
    ['vehicle-moped', makeMarkerSvg(ICON_PATHS.moped, VEHICLE_FORM_FACTOR_COLORS.moped)],
    [
      'vehicle-cargo_bicycle',
      makeMarkerSvg(ICON_PATHS.bicycle, VEHICLE_FORM_FACTOR_COLORS.cargo_bicycle),
    ],
    ['vehicle-other', makeMarkerSvg(ICON_PATHS.other, VEHICLE_FORM_FACTOR_COLORS.other)],
  ];

  const imagePromises = icons.map(async ([name, svg]) => {
    const imgData = await svgToImageData(svg, size);
    if (!map.hasImage(name)) {
      map.addImage(name, imgData, { sdf: false });
    }
  });

  await Promise.all(imagePromises);
}
