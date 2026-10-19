import * as THREE from 'three';
import {
  tileRangeBounds,
  tilesCovering,
  type Projection,
  type TileRange,
} from './montreal-journey';
import { EDGE_FADE_GLSL, type FadeUniforms } from './journey-geometry';
import { tileUrl } from './journey-tiles';

// The ground plane of the journey hero: the app's raster basemap (CARTO, via
// mapConfig) stitched into one canvas texture laid flat under the scene,
// recolored toward the brand palette and overlaid with the faint grid of the
// other hero backgrounds. Tiles are Web Mercator, as is the scene's
// projection, so the texture maps linearly onto the plane.

/** Retina tiles: 512 px each. */
const TILE_PX = 512;
/** Give up on tiles that haven't loaded by then; the rest still show. */
const TILE_TIMEOUT_MS = 8000;

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uMapReady;
  uniform vec3 uLow;
  uniform vec3 uHigh;
  uniform vec2 uLumRange;
  uniform float uTint;
  uniform vec3 uGrid;
  uniform float uGridStrength;
  uniform float uGridSize;
  uniform float uOpacity;
  ${EDGE_FADE_GLSL}
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vec3 tile = texture2D(uMap, vUv).rgb;
    // Recolor by lightness: map ink takes the brand hue, paper the page's.
    float lum = dot(tile, vec3(0.299, 0.587, 0.114));
    vec3 tinted = mix(uLow, uHigh, smoothstep(uLumRange.x, uLumRange.y, lum));
    vec3 color = mix(uHigh, mix(tile, tinted, uTint), uMapReady);

    vec2 cell = vWorld.xz / uGridSize;
    vec2 g = abs(fract(cell - 0.5) - 0.5) / max(fwidth(cell), vec2(1e-4));
    float grid = 1.0 - min(min(g.x, g.y), 1.0);
    color = mix(color, uGrid, grid * uGridStrength);

    gl_FragColor = vec4(color, uOpacity * edgeFade(vWorld));
  }
`;

export interface BasemapColors {
  /** Map ink (darkest tile color) and paper (lightest). */
  low: string;
  high: string;
  /** Tile lightness mapped to low..high. */
  lumRange: [number, number];
  /** 0 = raw tiles, 1 = fully recolored. */
  tint: number;
  grid: string;
  gridStrength: number;
}

export interface Basemap {
  mesh: THREE.Mesh;
  /**
   * Loads a tile style (a `{z}/{x}/{y}{r}` URL template) and swaps it in
   * once every tile has settled, so a theme change never shows half-loaded
   * tiles. Resolves after the swap.
   */
  load: (urlTemplate: string) => Promise<void>;
  setColors: (colors: BasemapColors) => void;
  dispose: () => void;
}

function loadTile(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // CARTO serves CORS headers; without this the canvas would be tainted.
    image.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => {
      reject(new Error('tile timeout'));
    }, TILE_TIMEOUT_MS);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error(`tile failed: ${url}`));
    };
    image.src = url;
  });
}

export function createBasemap(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  projection: Projection,
  coverage: { zoom: number; halfWidth: number; halfDepth: number },
  fade: FadeUniforms,
  onChange: () => void,
): Basemap {
  const range: TileRange = tilesCovering(
    projection,
    coverage.zoom,
    coverage.halfWidth,
    coverage.halfDepth,
  );
  const cols = range.maxX - range.minX + 1;
  const rows = range.maxY - range.minY + 1;
  const [west, north, east, south] = tileRangeBounds(projection, range);

  const canvas = document.createElement('canvas');
  canvas.width = cols * TILE_PX;
  canvas.height = rows * TILE_PX;
  const texture = new THREE.CanvasTexture(canvas);
  // Sampled raw and written raw, like the shader's uniforms.
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.minFilter = THREE.LinearMipmapLinearFilter;

  const geometry = new THREE.PlaneGeometry(east - west, south - north);
  // Plane +y becomes -z (north), matching the canvas's top row at v = 1.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((west + east) / 2, 0, (north + south) / 2);

  const uniforms = {
    uMap: { value: texture },
    uMapReady: { value: 0 },
    uLow: { value: new THREE.Color() },
    uHigh: { value: new THREE.Color() },
    uLumRange: { value: new THREE.Vector2(0, 1) },
    uTint: { value: 1 },
    uGrid: { value: new THREE.Color() },
    uGridStrength: { value: 0 },
    uGridSize: { value: 0.5 },
    uOpacity: { value: 1 },
    uFadeRadius: fade.uFadeRadius,
    uFadeWidth: fade.uFadeWidth,
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 0;
  scene.add(mesh);

  let generation = 0;

  return {
    mesh,
    load: async (urlTemplate) => {
      const current = ++generation;
      const jobs: Array<
        Promise<{ image: HTMLImageElement; x: number; y: number }>
      > = [];
      for (let y = range.minY; y <= range.maxY; y++) {
        for (let x = range.minX; x <= range.maxX; x++) {
          jobs.push(
            loadTile(tileUrl(urlTemplate, range.zoom, x, y)).then((image) => ({
              image,
              x,
              y,
            })),
          );
        }
      }
      const results = await Promise.allSettled(jobs);
      // A newer style (theme toggle) started meanwhile; it wins.
      if (current !== generation) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let loaded = 0;
      results.forEach((result) => {
        if (result.status !== 'fulfilled') return;
        const { image, x, y } = result.value;
        ctx.drawImage(
          image,
          (x - range.minX) * TILE_PX,
          (y - range.minY) * TILE_PX,
          TILE_PX,
          TILE_PX,
        );
        loaded++;
      });
      if (loaded === 0) throw new Error('No basemap tiles loaded');
      texture.needsUpdate = true;
      uniforms.uMapReady.value = 1;
      onChange();
    },
    setColors: (colors) => {
      uniforms.uLow.value.setStyle(colors.low, THREE.LinearSRGBColorSpace);
      uniforms.uHigh.value.setStyle(colors.high, THREE.LinearSRGBColorSpace);
      uniforms.uLumRange.value.set(...colors.lumRange);
      uniforms.uTint.value = colors.tint;
      uniforms.uGrid.value.setStyle(colors.grid, THREE.LinearSRGBColorSpace);
      uniforms.uGridStrength.value = colors.gridStrength;
      onChange();
    },
    dispose: () => {
      generation++;
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
