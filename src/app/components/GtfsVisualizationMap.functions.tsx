'use client';

import {
  type GBFSFeedType,
  type GBFSVersionType,
} from '../services/feeds/utils';
import { type RouteIdsInput } from '../utils/precompute';
import {
  type ExpressionSpecification,
  type LngLatBoundsLike,
} from 'maplibre-gl';
import { type LngLatTuple } from '../types';

export interface LatestDatasetLite {
  hosted_url?: string;
  id?: string;
  stable_id?: string;
}

// Extract route_ids list from the PMTiles property (stringified JSON)
export function extractRouteIds(val: RouteIdsInput): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {}
    // fallback: pull "quoted" tokens
    const out: string[] = [];
    val.replace(/"([^"]+)"/g, (_: unknown, id: string) => {
      out.push(id);
      return '';
    });
    if (out.length > 0) return out;
    // fallback2: CSV-ish
    return val
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function generateStopColorExpression(
  routeIdToColor: Record<string, string>,
  mapBgColor: string,
  altColor: string,
  fallback: string = '#888',
): string | ExpressionSpecification {
  const expression: Array<string | ExpressionSpecification> = [];

  const isHex = (s: string): boolean =>
    /^[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(s);

  const toFullHex = (hex: string): string =>
    hex.length === 3
      ? `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
      : `#${hex}`;

  const contrastRatio = (lum1: number, lum2: number): number =>
    (Math.max(lum1, lum2) + 0.05) / (Math.min(lum1, lum2) + 0.05);

  const bgLum = linearLuminance(mapBgColor);
  const altLum = linearLuminance(altColor);

  for (const [routeId, raw] of Object.entries(routeIdToColor)) {
    if (raw == null) continue;
    const hex = String(raw).trim().replace(/^#/, '');
    if (!isHex(hex)) continue; // skip empty/invalid colors

    const fullHex = toFullHex(hex);
    const routeLum = linearLuminance(fullHex);
    const crBg = contrastRatio(routeLum, bgLum); // route vs map bg
    const crAlt = contrastRatio(routeLum, altLum); // route vs alt color

    // Same logic as route outline: use route color when it contrasts more against the bg,
    // fall back to altColor when altColor contrasts more against the route
    const chosenColor = crBg >= crAlt ? fullHex : altColor;

    // route_ids is a string of quoted ids; keep your quoted match style
    expression.push(['in', `"${routeId}"`, ['get', 'route_ids']], chosenColor);
  }

  // If nothing valid was added, just use the fallback color directly
  if (expression.length === 0) {
    return fallback;
  }

  expression.push(fallback);
  return ['case', ...expression] as ExpressionSpecification;
}

/**
 * Simplified relative luminance (linear approximation, 0–1 range).
 * Uses the Rec. 709 coefficients without sRGB gamma correction
 * (MapLibre expressions don't support `pow`).
 */
function linearLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Builds a MapLibre expression that picks the outline color for a route line
 * by computing simplified contrast ratios against two candidate colours
 * (`mapBgColor` and `altOutlineColor`) and choosing the one with the
 * higher contrast.
 *
 * This handles both light-on-light (e.g. white route on white map) and
 * dark-on-dark (e.g. black route on dark outline) scenarios.
 */
export function generateRouteOutlineColorExpression(
  mapBgColor: string,
  altOutlineColor: string,
): ExpressionSpecification {
  // Luminance of the two candidate outline colours (precomputed at build time)
  const bgLum = linearLuminance(mapBgColor);
  const altLum = linearLuminance(altOutlineColor);

  // Parse the feature's route_color (stored as hex without '#') into RGBA
  const routeColorExpr: ExpressionSpecification = [
    'to-color',
    ['concat', '#', ['get', 'route_color']],
    '#000000', // fallback when route_color is missing/invalid
  ];

  // Route luminance computed at render time (0–1)
  const lumExpr: ExpressionSpecification = [
    '/',
    [
      '+',
      ['*', 0.2126, ['at', 0, ['var', 'rgba']]],
      [
        '+',
        ['*', 0.7152, ['at', 1, ['var', 'rgba']]],
        ['*', 0.0722, ['at', 2, ['var', 'rgba']]],
      ],
    ],
    255,
  ];

  // Contrast ratio: CR = (Lmax + 0.05) / (Lmin + 0.05)
  const crBgExpr: ExpressionSpecification = [
    '/',
    ['+', ['max', ['var', 'lum'], bgLum], 0.05],
    ['+', ['min', ['var', 'lum'], bgLum], 0.05],
  ];

  const crAltExpr: ExpressionSpecification = [
    '/',
    ['+', ['max', ['var', 'lum'], altLum], 0.05],
    ['+', ['min', ['var', 'lum'], altLum], 0.05],
  ];

  // Bind intermediate values, then pick the outline with the higher contrast
  return [
    'let',
    'rgba',
    ['to-rgba', routeColorExpr],
    [
      'let',
      'lum',
      lumExpr,
      [
        'let',
        'crBg',
        crBgExpr,
        [
          'let',
          'crAlt',
          crAltExpr,
          [
            'case',
            ['>=', ['var', 'crBg'], ['var', 'crAlt']],
            mapBgColor,
            altOutlineColor,
          ],
        ],
      ],
    ],
  ];
}

export const getBoundsFromCoordinates = (
  coordinates: LngLatTuple[],
): LngLatBoundsLike => {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  coordinates.forEach(([lng, lat]) => {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  });

  return [minLng, minLat, maxLng, maxLat];
};

export const generatePmtilesUrls = (
  latestDataset: LatestDatasetLite | undefined,
  visualizationId: string,
): {
  stopsPmtilesUrl: string;
  routesPmtilesUrl: string;
} => {
  const baseUrl =
    latestDataset?.hosted_url != null
      ? latestDataset.hosted_url.replace(/[^/]+$/, '')
      : undefined;
  const updatedUrl = baseUrl
    ?.replace(/[^/]+$/, '')
    .replace(/\/[^/]+\/?$/, `/${visualizationId}/`);
  const stopsPmtilesUrl = `${updatedUrl ?? ''}pmtiles/stops.pmtiles`;
  const routesPmtilesUrl = `${updatedUrl ?? ''}pmtiles/routes.pmtiles`;
  return { stopsPmtilesUrl, routesPmtilesUrl };
};

export const getLatestGbfsVersion = (
  gbfsFeed: GBFSFeedType,
): GBFSVersionType | undefined => {
  const autodiscoveryVersion = gbfsFeed?.versions?.find(
    (v) => v.source === 'autodiscovery',
  );
  if (autodiscoveryVersion !== undefined) {
    return autodiscoveryVersion;
  }
  // Otherwise sort by version number and return the latest
  const sortedVersions = gbfsFeed?.versions
    ?.filter((v) => v.version !== undefined)
    .sort((a, b) => {
      if (a.version === undefined) return -1;
      if (b.version === undefined) return 1;
      if (a.version < b.version) return 1;
      if (a.version > b.version) return -1;
      return 0;
    });
  if (sortedVersions !== undefined && sortedVersions.length > 0) {
    return sortedVersions[0];
  }
  return undefined;
};
