import * as THREE from 'three';
import { type Point2 } from './montreal-journey';

// Raised transit elements for the journey hero: routes and the bike path are
// ribbons extruded off the basemap (metro lines with rounded top edges),
// stations and docks are short cylinders.
// Geometry is built with y in [0, 1]; the shader scales it to the element's
// height (times the intro rise), so one cylinder serves every marker.

/** Longest miter, in half-widths, before a sharp corner gets clipped. */
const MITER_LIMIT = 2.5;

interface RibbonBuffers {
  positions: number[];
  normals: number[];
  dists: number[];
  sides: number[];
  indices: number[];
}

/** Unit left-hand normal of segment a -> b, in x/z. */
function segmentNormal(a: Point2, b: Point2): Point2 {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  return [-dz / len, dx / len];
}

/**
 * Per-point offset directions with miter joins, scaled so the ribbon keeps
 * its width through corners (up to MITER_LIMIT).
 */
function miterOffsets(points: Point2[]): Point2[] {
  return points.map((point, i) => {
    const before = i > 0 ? segmentNormal(points[i - 1], point) : null;
    const after =
      i < points.length - 1 ? segmentNormal(point, points[i + 1]) : null;
    const a = before ?? after ?? [0, 0];
    const b = after ?? before ?? [0, 0];
    const mx = a[0] + b[0];
    const mz = a[1] + b[1];
    const len = Math.hypot(mx, mz);
    if (len < 1e-6) return a;
    const nx = mx / len;
    const nz = mz / len;
    const scale = Math.min(
      1 / Math.max(nx * a[0] + nz * a[1], 1e-6),
      MITER_LIMIT,
    );
    return [nx * scale, nz * scale];
  });
}

/** Drops consecutive duplicates, which would give zero-length segments. */
function dedupe(points: Point2[]): Point2[] {
  return points.filter(
    (p, i) =>
      i === 0 ||
      Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1e-6,
  );
}

/** One vertex of a ribbon's cross-section. */
interface ProfilePoint {
  /** Offset across the ribbon (world units, + toward the miter normal). */
  across: number;
  /** Height, normalized to [0, 1] of the ribbon's height. */
  y: number;
  /** Outward normal in the cross-section plane: (across, up). */
  normal: [number, number];
}

/** Quarter-circle steps in each rounded top edge. */
const ARC_SEGMENTS = 5;

/**
 * Cross-section, from the + side's foot, over the top, to the - side's foot.
 * Each inner array is shaded smoothly; separate arrays meet at a hard edge.
 */
function ribbonProfile(
  half: number,
  height: number,
  radius: number,
  flat: boolean,
): ProfilePoint[][] {
  if (flat) {
    return [
      [
        { across: half, y: 1, normal: [0, 1] },
        { across: -half, y: 1, normal: [0, 1] },
      ],
    ];
  }
  const r = Math.min(Math.max(radius, 0), half, height);
  if (r <= 0) {
    return [
      [
        { across: half, y: 0, normal: [1, 0] },
        { across: half, y: 1, normal: [1, 0] },
      ],
      [
        { across: half, y: 1, normal: [0, 1] },
        { across: -half, y: 1, normal: [0, 1] },
      ],
      [
        { across: -half, y: 1, normal: [-1, 0] },
        { across: -half, y: 0, normal: [-1, 0] },
      ],
    ];
  }
  // Walls run tangent into the arcs, so the whole section is one smooth strip.
  const points: ProfilePoint[] = [{ across: half, y: 0, normal: [1, 0] }];
  const arc = (centerAcross: number, from: number, to: number): void => {
    for (let k = 0; k <= ARC_SEGMENTS; k++) {
      const angle = from + ((to - from) * k) / ARC_SEGMENTS;
      const c = Math.cos(angle);
      const sn = Math.sin(angle);
      points.push({
        across: centerAcross + r * c,
        y: (height - r + r * sn) / height,
        normal: [c, sn],
      });
    }
  };
  arc(half - r, 0, Math.PI / 2);
  arc(-(half - r), Math.PI / 2, Math.PI);
  points.push({ across: -half, y: 0, normal: [-1, 0] });
  return [points];
}

export interface RibbonOptions {
  /** Only the top face (for shadows). */
  flat?: boolean;
  /** Real height in world units; needed to round the top edges. */
  height?: number;
  /** Radius of the rounded top edges, clamped to the half-width and height. */
  radius?: number;
}

/**
 * Ribbon along a polyline in world x/z, swept from a box (or rounded-top)
 * cross-section, with end caps. `aDist` is the distance along the path (for
 * the traveled highlight and dashes); `aSide` runs -1..1 across it (for soft
 * shadow edges).
 */
export function buildRibbonGeometry(
  input: Point2[],
  width: number,
  options: RibbonOptions = {},
): THREE.BufferGeometry {
  const points = dedupe(input);
  const offsets = miterOffsets(points);
  const half = width / 2;
  const flat = options.flat ?? false;
  const profile = ribbonProfile(
    half,
    options.height ?? 1,
    options.height ? (options.radius ?? 0) : 0,
    flat,
  );
  const b: RibbonBuffers = {
    positions: [],
    normals: [],
    dists: [],
    sides: [],
    indices: [],
  };
  const dists = [0];
  for (let i = 1; i < points.length; i++) {
    dists.push(
      dists[i - 1] +
        Math.hypot(
          points[i][0] - points[i - 1][0],
          points[i][1] - points[i - 1][1],
        ),
    );
  }

  const vertex = (
    i: number,
    p: ProfilePoint,
    normal: [number, number, number],
  ): number => {
    const [ox, oz] = offsets[i];
    b.positions.push(
      points[i][0] + ox * p.across,
      p.y,
      points[i][1] + oz * p.across,
    );
    b.normals.push(...normal);
    b.dists.push(dists[i]);
    b.sides.push(-p.across / half);
    return b.positions.length / 3 - 1;
  };

  // Each smooth strip: one row of vertices per path point, quads between
  // neighbouring rows. Normals turn with the (unit) miter direction, so
  // walls shade smoothly around bends. Winding faces outward.
  profile.forEach((strip) => {
    const rows = points.map((_, i) => {
      const len = Math.hypot(offsets[i][0], offsets[i][1]) || 1;
      const ux = offsets[i][0] / len;
      const uz = offsets[i][1] / len;
      return strip.map((p) =>
        vertex(i, p, [ux * p.normal[0], p.normal[1], uz * p.normal[0]]),
      );
    });
    for (let i = 0; i < points.length - 1; i++) {
      for (let k = 0; k < strip.length - 1; k++) {
        const a0 = rows[i][k];
        const a1 = rows[i][k + 1];
        const b0 = rows[i + 1][k];
        const b1 = rows[i + 1][k + 1];
        b.indices.push(a0, b0, a1, a1, b0, b1);
      }
    }
  });

  if (!flat) {
    // Caps: the (convex) cross-section, fanned from its first point.
    const outline = profile
      .flat()
      .filter(
        (p, k, all) =>
          k === 0 || p.across !== all[k - 1].across || p.y !== all[k - 1].y,
      );
    const cap = (i: number, sign: 1 | -1): void => {
      const neighbour = points[i + (sign === 1 ? -1 : 1)] ?? points[i];
      const dx = (points[i][0] - neighbour[0]) * sign;
      const dz = (points[i][1] - neighbour[1]) * sign;
      const len = Math.hypot(dx, dz) || 1;
      const n: [number, number, number] = [
        (dx / len) * sign,
        0,
        (dz / len) * sign,
      ];
      const v = outline.map((p) => vertex(i, p, n));
      for (let k = 1; k < v.length - 1; k++) {
        if (sign === 1) b.indices.push(v[0], v[k + 1], v[k]);
        else b.indices.push(v[0], v[k], v[k + 1]);
      }
    };
    cap(0, -1);
    cap(points.length - 1, 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(b.positions, 3),
  );
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(b.normals, 3),
  );
  geometry.setAttribute('aDist', new THREE.Float32BufferAttribute(b.dists, 1));
  geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(b.sides, 1));
  geometry.setIndex(b.indices);
  return geometry;
}

/** Unit-height cylinder (y in [0, 1]) with the ribbon's extra attributes. */
export function buildCylinderGeometry(segments = 24): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(1, 1, 1, segments);
  geometry.translate(0, 0.5, 0);
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute(
    'aDist',
    new THREE.Float32BufferAttribute(new Float32Array(count), 1),
  );
  geometry.setAttribute(
    'aSide',
    new THREE.Float32BufferAttribute(new Float32Array(count), 1),
  );
  return geometry;
}

// Everything on the map fades out toward the scene's edge the same way as
// the basemap: an ellipse around the focus (x and z radii), so the far side
// of the tilted view doesn't end in a hard line.
export const EDGE_FADE_GLSL = /* glsl */ `
  uniform vec2 uFadeRadius;
  uniform float uFadeWidth;
  float edgeFade(vec3 world) {
    float r = length(world.xz / uFadeRadius);
    return 1.0 - smoothstep(1.0 - uFadeWidth, 1.0, r);
  }
`;

const ELEVATED_VERTEX_SHADER = /* glsl */ `
  uniform float uHeight;
  uniform float uBase;
  uniform float uRise;
  attribute float aDist;
  attribute float aSide;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vTint;
  varying float vDist;
  varying float vSide;

  void main() {
    vec3 p = vec3(position.x, uBase + position.y * uHeight * uRise, position.z);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      p = (instanceMatrix * vec4(p, 1.0)).xyz;
      n = normalize(mat3(instanceMatrix) * n);
    #endif
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #else
      vTint = vec3(1.0);
    #endif
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * n);
    vDist = aDist;
    vSide = aSide;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ELEVATED_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uFillColor;
  uniform float uFill;
  uniform float uFillAmount;
  uniform float uOpacity;
  uniform float uDash;
  uniform float uDashRatio;
  uniform vec3 uLightDir;
  ${EDGE_FADE_GLSL}
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vTint;
  varying float vDist;
  varying float vSide;

  void main() {
    if (uDash > 0.0 && fract(vDist / uDash) > uDashRatio) discard;
    float traveled = step(vDist, uFill) * uFillAmount;
    vec3 base = mix(uColor, uFillColor, traveled) * vTint;
    // Bright tops, darker walls: reads as raised off the map at a glance.
    float diffuse = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
    vec3 color = base * (0.72 + 0.33 * diffuse);
    gl_FragColor = vec4(color, uOpacity * edgeFade(vWorld));
  }
`;

const SHADOW_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  ${EDGE_FADE_GLSL}
  varying vec3 vWorld;
  varying float vSide;

  void main() {
    // Soft edges across the ribbon's width: densest under the line, fading
    // smoothly to nothing (squared, so no visible rim).
    float falloff = 1.0 - vSide * vSide;
    falloff *= falloff;
    gl_FragColor = vec4(uColor, uOpacity * falloff * edgeFade(vWorld));
  }
`;

export interface FadeUniforms {
  uFadeRadius: { value: THREE.Vector2 };
  uFadeWidth: { value: number };
}

export interface ElevatedUniforms extends FadeUniforms {
  uHeight: { value: number };
  uBase: { value: number };
  uRise: { value: number };
  uColor: { value: THREE.Color };
  uFillColor: { value: THREE.Color };
  /** Distance along the path up to which `uFillColor` shows; -1 for none. */
  uFill: { value: number };
  uFillAmount: { value: number };
  uOpacity: { value: number };
  /** Dash period along the path (0 = solid) and the drawn share of it. */
  uDash: { value: number };
  uDashRatio: { value: number };
  uLightDir: { value: THREE.Vector3 };
}

export interface ElevatedOptions {
  height: number;
  base?: number;
  opacity?: number;
  dash?: number;
  dashRatio?: number;
}

/**
 * Lit material for ribbons and cylinders. `rise` and `fade` are shared
 * objects, so the intro rise and the edge fade drive every element at once.
 */
export function createElevatedMaterial(
  options: ElevatedOptions,
  shared: { rise: { value: number }; light: THREE.Vector3 } & FadeUniforms,
): THREE.ShaderMaterial & { uniforms: ElevatedUniforms } {
  const opacity = options.opacity ?? 1;
  const uniforms: ElevatedUniforms = {
    uHeight: { value: options.height },
    uBase: { value: options.base ?? 0 },
    uRise: shared.rise,
    uColor: { value: new THREE.Color() },
    uFillColor: { value: new THREE.Color() },
    uFill: { value: -1 },
    uFillAmount: { value: 1 },
    uOpacity: { value: opacity },
    uDash: { value: options.dash ?? 0 },
    uDashRatio: { value: options.dashRatio ?? 0.5 },
    uLightDir: { value: shared.light },
    uFadeRadius: shared.uFadeRadius,
    uFadeWidth: shared.uFadeWidth,
  };
  const material = new THREE.ShaderMaterial({
    uniforms: { ...uniforms },
    vertexShader: ELEVATED_VERTEX_SHADER,
    fragmentShader: ELEVATED_FRAGMENT_SHADER,
    transparent: true,
    // Faded background elements must not hide each other's overlaps.
    depthWrite: opacity >= 1,
  });
  return material as THREE.ShaderMaterial & { uniforms: ElevatedUniforms };
}

/** Flat, soft-edged shadow under a ribbon. */
export function createShadowMaterial(
  opacity: number,
  fade: FadeUniforms,
): THREE.ShaderMaterial & {
  uniforms: { uColor: { value: THREE.Color }; uOpacity: { value: number } };
} {
  const uniforms = {
    uHeight: { value: 0 },
    uBase: { value: 0.002 },
    uRise: { value: 1 },
    uColor: { value: new THREE.Color() },
    uOpacity: { value: opacity },
    uFadeRadius: fade.uFadeRadius,
    uFadeWidth: fade.uFadeWidth,
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: ELEVATED_VERTEX_SHADER,
    fragmentShader: SHADOW_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });
  return material as THREE.ShaderMaterial & {
    uniforms: typeof uniforms;
  };
}

/**
 * The raw ShaderMaterials write straight to the sRGB canvas, so uniform
 * colors stay unconverted (same as surface-shading's applyPalette).
 */
export function setRawColor(color: THREE.Color, hex: string): void {
  color.setStyle(hex, THREE.LinearSRGBColorSpace);
}
