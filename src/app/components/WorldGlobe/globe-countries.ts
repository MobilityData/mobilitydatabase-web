import * as THREE from 'three';
import GeoData from './SummitGeoData.json';
import { FEED_COUNTS_BY_COUNTRY } from './feed-counts';
import { feedCountIntensity } from './feed-stats';
import {
  buildBorderGeometry,
  decodeCountries,
  lonLatToVec3,
  mainlandCentroid,
  polygonToSpherePositions,
  type Ring,
  ringEncirclesPole,
  type Topology,
} from './globe-geometry';
import { NUM_TO_ISO2 } from './iso-numeric';

export const COUNTRY_RADIUS = 1.0;
const ANCHOR_RADIUS_SCALE = 1.005;
const BORDER_RADIUS_SCALE = 1.001;

export interface GlobeCountryData {
  iso2: string;
  name: string;
  feedCount: number;
  /** 0..1 log-scaled shade; 0 for countries without feeds. */
  intensity: number;
  positions: Float32Array;
  normals: Float32Array;
  /** Globe-local point the popup is pinned to (main landmass), xyz. */
  anchor: [number, number, number];
}

export interface GlobeData {
  countries: GlobeCountryData[];
  borderPositions: Float32Array;
}

// Decoding the topology and triangulating ~180 countries on a 2-degree grid
// is the globe's whole startup cost, and the result never changes. It's
// built once per module and mounts only wrap the typed arrays in fresh
// BufferGeometries (sharing the arrays), as the flat map does for its paths.
let cached: GlobeData | null = null;

export function getGlobeData(): GlobeData {
  if (cached) return cached;
  const features = decodeCountries(GeoData as unknown as Topology, 'countries');
  const countries: GlobeCountryData[] = [];
  const borderRings: Ring[] = [];
  const anchor = new THREE.Vector3();
  for (const feat of features) {
    // Antarctica's pole-encircling ring triangulates into a polar cap
    // that reads as a false equator; it has no feeds, so skip it.
    if (feat.polygons.some((rings) => rings[0] && ringEncirclesPole(rings[0])))
      continue;
    for (const rings of feat.polygons) {
      if (rings[0] && rings[0].length >= 2) borderRings.push(rings[0]);
    }

    const iso2 = NUM_TO_ISO2[String(feat.id).padStart(3, '0')];
    const positions = feat.polygons.flatMap((rings) =>
      polygonToSpherePositions(rings, COUNTRY_RADIUS),
    );
    if (!iso2 || !positions.length) continue;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geom.computeVertexNormals();
    const normals = geom.getAttribute('normal').array as Float32Array;
    const positionArray = geom.getAttribute('position').array as Float32Array;
    geom.dispose();

    const feedCount = FEED_COUNTS_BY_COUNTRY[iso2]?.feedCount ?? 0;
    const [lon, lat] = mainlandCentroid(feat.polygons);
    lonLatToVec3(lon, lat, COUNTRY_RADIUS * ANCHOR_RADIUS_SCALE, anchor);
    countries.push({
      iso2,
      name: feat.name ?? FEED_COUNTS_BY_COUNTRY[iso2]?.name ?? iso2,
      feedCount,
      intensity: feedCountIntensity(feedCount),
      positions: positionArray,
      normals,
      anchor: [anchor.x, anchor.y, anchor.z],
    });
  }
  const borderGeom = buildBorderGeometry(
    borderRings,
    COUNTRY_RADIUS * BORDER_RADIUS_SCALE,
  );
  const borderPositions = borderGeom.getAttribute('position')
    .array as Float32Array;
  borderGeom.dispose();

  cached = { countries, borderPositions };
  return cached;
}
