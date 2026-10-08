import * as THREE from 'three';
import earcut from 'earcut';
import {
  type LonLat,
  type PolygonRings,
  type Ring,
  unwrapRingLongitudes,
} from './geo-shapes';

export {
  type CountryFeature,
  decodeCountries,
  easeInOutCubic,
  largestOuterRing,
  type LonLat,
  mainlandCentroid,
  normalizeAngle,
  type PolygonRings,
  type Ring,
  ringEncirclesPole,
  type Topology,
  unwrapRingLongitudes,
} from './geo-shapes';

// ---------- Spherical helpers ----------
export function lonLatToVec3(
  lon: number,
  lat: number,
  radius: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return target.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

// ---------- Polygon clipping (Sutherland–Hodgman) ----------
function clipPolygon(
  polygon: Ring,
  inside: (pt: LonLat) => boolean,
  intersect: (a: LonLat, b: LonLat) => LonLat,
): Ring {
  if (polygon.length === 0) return [];
  const output: Ring = [];
  let prev = polygon[polygon.length - 1];
  let prevInside = inside(prev);
  for (const curr of polygon) {
    const currInside = inside(curr);
    if (currInside) {
      if (!prevInside) output.push(intersect(prev, curr));
      output.push(curr);
    } else if (prevInside) {
      output.push(intersect(prev, curr));
    }
    prev = curr;
    prevInside = currInside;
  }
  return output;
}

function clipToBox(
  polygon: Ring,
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number,
): Ring {
  const atX =
    (x: number) =>
    (a: LonLat, b: LonLat): LonLat => [
      x,
      a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]),
    ];
  const atY =
    (y: number) =>
    (a: LonLat, b: LonLat): LonLat => [
      a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]),
      y,
    ];
  let p = clipPolygon(polygon, (pt) => pt[0] >= xMin, atX(xMin));
  if (p.length) p = clipPolygon(p, (pt) => pt[0] <= xMax, atX(xMax));
  if (p.length) p = clipPolygon(p, (pt) => pt[1] >= yMin, atY(yMin));
  if (p.length) p = clipPolygon(p, (pt) => pt[1] <= yMax, atY(yMax));
  return p;
}

function bboxOfRing(ring: Ring): [number, number, number, number] {
  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  for (const [x, y] of ring) {
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (x > xMax) xMax = x;
    if (y > yMax) yMax = y;
  }
  return [xMin, yMin, xMax, yMax];
}

/**
 * Triangulates a polygon's outer ring on a lat/lon grid so the fill hugs the
 * sphere instead of cutting through it. Returns flat xyz positions.
 */
export function polygonToSpherePositions(
  rings: PolygonRings,
  radius: number,
  gridSize = 2,
): number[] {
  const outer = rings[0] ? unwrapRingLongitudes(rings[0]) : null;
  if (!outer || outer.length < 4) return [];

  const [xMin, yMin, xMax, yMax] = bboxOfRing(outer);
  const gxMin = Math.floor(xMin / gridSize) * gridSize;
  const gyMin = Math.floor(yMin / gridSize) * gridSize;
  const gxMax = Math.ceil(xMax / gridSize) * gridSize;
  const gyMax = Math.ceil(yMax / gridSize) * gridSize;

  const positions: number[] = [];
  const v = new THREE.Vector3();
  for (let x = gxMin; x < gxMax; x += gridSize) {
    for (let y = gyMin; y < gyMax; y += gridSize) {
      const clipped = clipToBox(outer, x, y, x + gridSize, y + gridSize);
      if (clipped.length < 3) continue;
      const flat = clipped.flat();
      for (const idx of earcut(flat)) {
        lonLatToVec3(flat[idx * 2], flat[idx * 2 + 1], radius, v);
        positions.push(v.x, v.y, v.z);
      }
    }
  }
  return positions;
}

/** Every country border as one LineSegments geometry (one draw call). */
export function buildBorderGeometry(
  outerRings: Ring[],
  radius: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (const ring of outerRings) {
    for (let i = 1; i < ring.length; i++) {
      lonLatToVec3(ring[i - 1][0], ring[i - 1][1], radius, a);
      lonLatToVec3(ring[i][0], ring[i][1], radius, b);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geom;
}

// ---------- Background starfield ----------
export interface StarLayerConfig {
  count: number;
  radiusMin: number;
  radiusMax: number;
  size: number;
  opacity: number;
  /** Fraction of the globe's rotation this shell follows. */
  parallax: number;
}

// Three shells rotated at different fractions of the globe's rotation —
// rotating in lockstep would read as fixed to the globe.
export const STAR_LAYERS: StarLayerConfig[] = [
  {
    count: 140,
    radiusMin: 5,
    radiusMax: 7,
    size: 3,
    opacity: 0.55,
    parallax: 0.05,
  },
  {
    count: 90,
    radiusMin: 1,
    radiusMax: 8,
    size: 1.5,
    opacity: 0.4,
    parallax: 0.1,
  },
  {
    count: 40,
    radiusMin: 2,
    radiusMax: 10,
    size: 2,
    opacity: 0.28,
    parallax: 0.18,
  },
];

/**
 * The sparkle's half-width and half-height as a share of the point's quad.
 * It used to be a 740x592 screenshot whose 242px star left wide margins and
 * came out a touch taller than wide once stretched onto the square quad;
 * these keep that framing.
 */
const STAR_HALF_W = 0.327 / 2;
const STAR_HALF_H = 0.409 / 2;

/**
 * The four-point sparkle, as an implicit curve rather than a texture.
 *
 * Each arm of the original artwork was a quadratic from one tip to the next
 * with the centre as its control point. Writing that out, a point at
 * parameter t sits at (t^2, -(1-t)^2) of the arm's extent, so t = sqrt(x) and
 * 1 - t = sqrt(-y), and the curve is exactly sqrt(|x|) + sqrt(|y|) = 1 once
 * normalised. Evaluating that per fragment gives the same shape the PNG had,
 * but resolution-free: a star near the camera (the inner parallax shell
 * brings some close) stays crisp instead of magnifying a few dozen texels.
 */
const STAR_SHAPE_GLSL = /* glsl */ `
  // gl_PointCoord spans the quad; rescale so the sparkle's own extent is the
  // unit square, then the curve above is simply d = 1.
  vec2 p = (gl_PointCoord - 0.5) / vec2(${STAR_HALF_W}, ${STAR_HALF_H});
  float d = sqrt(abs(p.x)) + sqrt(abs(p.y));
  // One fragment either side of the edge, so it antialiases at every size.
  float aa = max(fwidth(d), 1e-4);
  float shape = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
`;

export function createStarLayer({
  count,
  radiusMin,
  radiusMax,
  size,
  opacity,
}: StarLayerConfig): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const scales = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // acos(2v-1) gives uniform coverage rather than clustering at the poles.
    const theta = 2 * Math.PI * Math.random();
    const phi = Math.acos(2 * Math.random() - 1);
    const r = radiusMin + Math.random() * (radiusMax - radiusMin);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    phases[i] = Math.random() * Math.PI * 2;
    scales[i] = 0.5 + Math.random() * 0.5;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
  geom.setAttribute('aScale', new THREE.Float32BufferAttribute(scales, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color() },
      uSize: { value: size },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      attribute float aPhase;
      attribute float aScale;
      uniform float uTime;
      uniform float uSize;
      varying float vTwinkle;
      void main() {
        vTwinkle = 0.55 + 0.45 * sin(uTime * 1.6 + aPhase);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * aScale * vTwinkle * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vTwinkle;
      void main() {
        ${STAR_SHAPE_GLSL}
        if (shape <= 0.0) discard;
        gl_FragColor = vec4(uColor, shape * uOpacity * vTwinkle);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geom, mat);
}
