/**
 * @jest-environment node
 */
import { decodePolyline, encodePolyline } from './entity-diff-codec';

describe('polylines', () => {
  it('round-trips [lon, lat] coordinates exact at 1e-5', () => {
    const line = [
      [2.36916, 48.75552],
      [2.36929, 48.75529],
      [-73.6024, 45.44672],
      [0, 0],
    ];
    expect(decodePolyline(encodePolyline(line))).toEqual(line);
  });

  it("stores points latitude first, as Google's documented example", () => {
    // developers.google.com/maps/documentation/utilities/polylinealgorithm
    const lonLat = [
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ];
    expect(encodePolyline(lonLat)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual(lonLat);
  });

  it('is empty for an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});
