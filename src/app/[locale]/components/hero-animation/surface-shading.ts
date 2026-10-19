import * as THREE from 'three';
import { RAMP_STOPS, type SurfacePalette } from './surface-palette';

// Shared look for every accessibility surface: theme color ramp by height,
// soft lighting, rim tint and iso-accessibility contours.

export const SHADING_GLSL = /* glsl */ `
  #define RAMP_STOPS ${RAMP_STOPS}
  uniform float uMaxHeight;
  uniform vec3 uRamp[RAMP_STOPS];
  uniform vec3 uRim;
  uniform vec3 uContour;
  uniform float uContourStrength;
  uniform vec3 uAccentA;
  uniform vec3 uAccentB;
  uniform float uAccentStrength;
  uniform float uAccentPhase;
  uniform float uShadow;

  vec3 ramp(float t) {
    float x = t * float(RAMP_STOPS - 1);
    int i = int(min(floor(x), float(RAMP_STOPS - 2)));
    // Smoothstep between stops avoids visible banding at each stop.
    float f = smoothstep(0.0, 1.0, x - float(i));
    return mix(uRamp[i], uRamp[i + 1], f);
  }

  vec3 shadeSurface(float height, vec3 normal, vec3 world) {
    float t = clamp(height / uMaxHeight, 0.0, 1.0);
    vec3 n = normalize(normal);
    vec3 lightDir = normalize(vec3(0.45, 1.0, 0.3));
    vec3 viewDir = normalize(cameraPosition - world);

    // Shade relative to flat ground, so flat areas keep their exact ramp
    // color (the base still matches the page) and only slopes turned away
    // from the light darken, by up to uShadow.
    float flatFacing = dot(vec3(0.0, 1.0, 0.0), lightDir);
    float facing = clamp(dot(n, lightDir) / flatFacing, 0.0, 1.1);
    float diffuse = 1.0 - uShadow * (1.0 - facing);
    float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    vec3 base = ramp(t);

    // Optional slow hue drift across the hills (background variant). Kept off
    // the lowest ground so the base still blends into the page.
    float band = 0.5 + 0.5 * sin(world.x * 0.45 + world.z * 0.3 + uAccentPhase);
    vec3 accent = mix(uAccentA, uAccentB, band);
    float accentMix = uAccentStrength * smoothstep(0.08, 0.7, t);
    base = mix(base, accent, accentMix);

    vec3 color = mix(base * diffuse, uRim, rim * 0.35);

    // Iso-accessibility contours, faded out on steep faces where they alias.
    float c = t * 10.0;
    float fw = max(fwidth(c), 1e-4);
    float line = abs(fract(c - 0.5) - 0.5) / fw;
    float steepFade = 1.0 - smoothstep(0.25, 0.8, fw);
    float contour = (1.0 - min(line, 1.0)) * steepFade;
    return mix(color, uContour, contour * uContourStrength);
  }
`;

export interface ShadingUniforms {
  uMaxHeight: { value: number };
  uRamp: { value: THREE.Color[] };
  uRim: { value: THREE.Color };
  uContour: { value: THREE.Color };
  uContourStrength: { value: number };
  uAccentA: { value: THREE.Color };
  uAccentB: { value: THREE.Color };
  uAccentStrength: { value: number };
  uAccentPhase: { value: number };
  uShadow: { value: number };
}

export function createShadingUniforms(
  maxHeight: number,
  contourStrength = 0.18,
  accentStrength = 0,
  shadow = 0.3,
): ShadingUniforms {
  return {
    uShadow: { value: shadow },
    uMaxHeight: { value: maxHeight },
    uContourStrength: { value: contourStrength },
    uAccentA: { value: new THREE.Color() },
    uAccentB: { value: new THREE.Color() },
    uAccentStrength: { value: accentStrength },
    uAccentPhase: { value: 0 },
    uRamp: {
      value: Array.from({ length: RAMP_STOPS }, () => new THREE.Color()),
    },
    uRim: { value: new THREE.Color() },
    uContour: { value: new THREE.Color() },
  };
}

export interface SceneColors {
  uniforms: ShadingUniforms;
  /** Overlay materials; omitted by scenes without lines or markers. */
  lineMaterial?: THREE.LineBasicMaterial;
  stationMaterial?: THREE.PointsMaterial;
  opportunityMaterial?: THREE.PointsMaterial;
  /** Requests a frame; needed when the animation is paused. */
  redraw: () => void;
  /** Extra per-scene recoloring (axes, labels, ...). */
  onPalette?: (palette: SurfacePalette) => void;
}

export function applyPalette(
  target: SceneColors,
  palette: SurfacePalette,
): void {
  // The raw ShaderMaterial writes colors straight to the sRGB canvas, so keep
  // uniform values unconverted. Built-in materials convert on their own.
  const setRaw = (color: THREE.Color, hex: string): void => {
    color.setStyle(hex, THREE.LinearSRGBColorSpace);
  };
  palette.ramp.forEach((hex, i) => {
    setRaw(target.uniforms.uRamp.value[i], hex);
  });
  setRaw(target.uniforms.uRim.value, palette.rim);
  setRaw(target.uniforms.uAccentA.value, palette.accents[0]);
  setRaw(target.uniforms.uAccentB.value, palette.accents[1]);
  setRaw(target.uniforms.uContour.value, palette.contour);
  target.lineMaterial?.color.set(palette.transitLine);
  target.stationMaterial?.color.set(palette.station);
  target.opportunityMaterial?.color.set(palette.opportunity);
  target.onPalette?.(palette);
  target.redraw();
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A Points cloud with a preallocated position buffer. */
export function createPointCloud(
  scene: THREE.Scene,
  count: number,
  size: number,
): {
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  points: THREE.Points;
} {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(count * 3), 3),
  );
  const material = new THREE.PointsMaterial({
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  return { geometry, material, points };
}
