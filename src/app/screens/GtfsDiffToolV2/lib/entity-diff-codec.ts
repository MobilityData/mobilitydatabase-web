/**
 * Encoded polylines for the geometry columns of the routes tables
 * (analysis/routes.parquet, analysis/shapes.parquet): Google's Encoded
 * Polyline Algorithm Format at precision 5, points stored latitude first as
 * the format specifies, through Google's own codec
 * (@googlemaps/polyline-codec). Any standard decoder reads the columns
 * (Python `polyline.decode(s, geojson=True)` for [lon, lat]).
 *
 * The app works in [lon, lat] (GeoJSON / MapLibre order): these two helpers
 * swap at the boundary.
 *
 * Type-strippable on purpose: the Node generators import this file directly.
 */

import { decode, encode } from '@googlemaps/polyline-codec';

/** Decimal places kept (1e-5 degrees, about 1 m). */
export const POLYLINE_PRECISION = 5;

/** [[lon, lat], …] as an encoded polyline. */
export function encodePolyline(points: number[][]): string {
  return encode(
    points.map(([lon, lat]) => [lat, lon]),
    POLYLINE_PRECISION,
  );
}

/** An encoded polyline as [[lon, lat], …]. */
export function decodePolyline(s: string): number[][] {
  return decode(s, POLYLINE_PRECISION).map(([lat, lon]) => [lon, lat]);
}
