'use client';

import { Box, Typography } from '@mui/material';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import { type CountryStats, getCountryStats } from './feed-stats';
import {
  CountryStatsPopup,
  FeedLegend,
  monoLabelSx,
} from './CountryStatsPopup';
import {
  exitFullscreenDocument,
  requestFullscreenForElement,
} from './fullscreen';
import { type GlobeColors } from './globe-colors';
import { getGlobeData } from './globe-countries';
import {
  createStarLayer,
  easeInOutCubic,
  normalizeAngle,
  STAR_LAYERS,
} from './globe-geometry';
import { MapToolbar } from './MapToolbar';
import { createTourPicker, TOUR_DWELL_SECONDS } from './tour';
import { useGlobeColors } from './useGlobeColors';
import { useTourMode } from './useTourMode';
import { createFrameCap } from '../../utils/frame-cap';

interface CountryMesh {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial>;
  iso2: string;
  name: string;
  feedCount: number;
  /** 0..1 log-scaled shade; 0 for countries without feeds. */
  intensity: number;
  /** Globe-local point the popup is pinned to (main landmass). */
  anchor: THREE.Vector3;
}

const OCEAN_RADIUS = 0.998;
const COUNTRY_EMISSIVE_STRENGTH = 0.4;

const TOUR_TWEEN_SECONDS = 1.8;
const AMBIENT_ROTATION_SPEED = 0.06;
const TOUR_DWELL_ROTATION_SPEED = 0.015;

const MIN_ZOOM = 2.0;
const MAX_ZOOM = 6.0;
const BREATHE_AMPLITUDE = 0.12;
const CAMERA_FOV = 45;
const DEFAULT_ZOOM = 4;
const HALO_RADIUS = 1.5;
const BREATHE_SPEED = 0.12;
const DRAG_THRESHOLD = 4;

export default function WorldGlobeFeeds({
  allowFullscreen = false,
  preview = false,
  onReady,
}: {
  allowFullscreen?: boolean;
  /** Fired once the country meshes are built and the first frame can draw. */
  onReady?: () => void;
  /**
   * Embedded, page-friendly mode (landing page): no wheel/pinch zoom, so
   * scrolling over the globe scrolls the page, and it fills its parent
   * instead of enforcing a 500px minimum.
   */
  preview?: boolean;
}): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const { tourMode, tourModeRef, runTourTickRef, toggleTour, startTour } =
    useTourMode();
  const applyColorsRef = useRef<(colors: GlobeColors) => void>(() => {});
  // The popup's screen position is written straight to the DOM every frame
  // (see updatePopupPosition) rather than through React state, so the
  // rotating globe doesn't re-render this component 60x/second. Only the
  // popup's content goes through setSelected, and only when it changes.
  // Through a ref so the scene effect never re-runs when the parent passes a
  // fresh callback; rebuilding the globe would be the whole cost again.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const popupElRef = useRef<HTMLDivElement>(null);
  const popupPosRef = useRef({ x: 0, y: 0 });

  const [selected, setSelected] = useState<CountryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const colors = useGlobeColors();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const width = container.clientWidth;
    const height = container.clientHeight;
    // Cached so the per-frame popup projection never calls
    // getBoundingClientRect() right after a style write (layout thrash).
    const canvasSize = { width, height };

    const camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      width / height,
      0.1,
      1000,
    );
    camera.position.set(0, 0, DEFAULT_ZOOM);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cursor = 'grab';
    // In preview, vertical swipes scroll the page; horizontal drags still spin.
    renderer.domElement.style.touchAction = preview ? 'pan-y' : 'none';
    container.appendChild(renderer.domElement);

    // Neutral white lights so the theme colours render true.
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.68);
    keyLight.position.set(-4, 3, 5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.25);
    fillLight.position.set(4, -1, -3);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.15);
    rimLight.position.set(0, 0, -5);
    scene.add(rimLight);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // Unlit so the ocean stays one flat tone all the way round.
    const oceanMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.95,
    });
    globeGroup.add(
      new THREE.Mesh(new THREE.SphereGeometry(OCEAN_RADIUS, 64, 64), oceanMat),
    );

    // Atmospheric halo: a wide back-facing shell whose Gaussian falloff reads
    // as a soft haze rather than a hard ring.
    const atmosMat = new THREE.ShaderMaterial({
      uniforms: {
        uGlow: { value: new THREE.Color() },
        uFade: { value: new THREE.Color() },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uGlow;
        uniform vec3 uFade;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3 viewDir = normalize(-vPosition);
          float rim = clamp(-dot(viewDir, vNormal), 0.0, 1.0);
          float t = 1.0 - rim;
          float alpha = 0.3 + 0.6 * exp(-8.0 * t * t);
          gl_FragColor = vec4(mix(uFade, uGlow, rim), alpha);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: true,
    });
    scene.add(
      new THREE.Mesh(new THREE.SphereGeometry(HALO_RADIUS, 64, 64), atmosMat),
    );

    // Inner fresnel: subtle edge shading for depth.
    const innerAtmosMat = new THREE.ShaderMaterial({
      uniforms: { uEdge: { value: new THREE.Color() } },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uEdge;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3 viewDir = normalize(-vPosition);
          float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
          gl_FragColor = vec4(uEdge, pow(rim, 4.0) * 0.28);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    globeGroup.add(
      new THREE.Mesh(new THREE.SphereGeometry(1.002, 64, 64), innerAtmosMat),
    );

    // Starfield lives on the scene (not globeGroup) so each shell can follow
    // its own fraction of the globe's rotation — see animate().
    const starLayers = STAR_LAYERS.map((config) => {
      const points = createStarLayer(config);
      scene.add(points);
      return { points, parallax: config.parallax };
    });

    // ---- Countries ----
    const countries: CountryMesh[] = [];
    const countryByMesh = new Map<THREE.Object3D, CountryMesh>();
    const borderMat = new THREE.LineBasicMaterial();
    try {
      const data = getGlobeData();
      for (const c of data.countries) {
        // The typed arrays are shared with the module cache; only the
        // geometry wrapper is per-mount.
        const geom = new THREE.BufferGeometry();
        geom.setAttribute(
          'position',
          new THREE.BufferAttribute(c.positions, 3),
        );
        geom.setAttribute('normal', new THREE.BufferAttribute(c.normals, 3));
        // Opaque: transparent fills sort per-object and blink at the limb.
        const mat = new THREE.MeshPhongMaterial({
          shininess: c.feedCount > 0 ? 6 : 2,
          specular: 0x111122,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geom, mat);
        globeGroup.add(mesh);

        const country: CountryMesh = {
          mesh,
          iso2: c.iso2,
          name: c.name,
          feedCount: c.feedCount,
          intensity: c.intensity,
          anchor: new THREE.Vector3().fromArray(c.anchor),
        };
        countries.push(country);
        countryByMesh.set(mesh, country);
      }
      const borderGeom = new THREE.BufferGeometry();
      borderGeom.setAttribute(
        'position',
        new THREE.BufferAttribute(data.borderPositions, 3),
      );
      globeGroup.add(new THREE.LineSegments(borderGeom, borderMat));
      setLoading(false);
      onReadyRef.current?.();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to load');
      setLoading(false);
      onReadyRef.current?.();
    }
    const countryMeshes = countries.map((c) => c.mesh);
    const pickTourStop = createTourPicker(
      countries.filter((c) => c.feedCount > 0),
    );

    let selectedCountry: CountryMesh | null = null;
    let lastSelectionIso2: string | null = null;
    const selectedColor = new THREE.Color();
    const lowColor = new THREE.Color();
    const highColor = new THREE.Color();
    const inactiveColor = new THREE.Color();

    // Phong lighting alone renders fills at ~60% brightness, muddying the
    // theme colours; a matching emissive term keeps them true while the
    // lights still add some depth.
    function paintCountry(country: CountryMesh): void {
      const { color, emissive } = country.mesh.material;
      if (country === selectedCountry) color.copy(selectedColor);
      else if (country.feedCount > 0)
        color.copy(lowColor).lerp(highColor, country.intensity);
      else color.copy(inactiveColor);
      emissive.copy(color).multiplyScalar(COUNTRY_EMISSIVE_STRENGTH);
    }

    applyColorsRef.current = (c: GlobeColors) => {
      oceanMat.color.set(c.ocean);
      (atmosMat.uniforms.uGlow.value as THREE.Color).set(c.glow);
      (atmosMat.uniforms.uFade.value as THREE.Color).set(c.background);
      (innerAtmosMat.uniforms.uEdge.value as THREE.Color).set(c.high);
      borderMat.color.set(c.border);
      for (const { points } of starLayers) {
        (points.material.uniforms.uColor.value as THREE.Color).set(c.star);
      }
      selectedColor.set(c.selected);
      lowColor.set(c.low);
      highColor.set(c.high);
      inactiveColor.set(c.inactive);
      for (const country of countries) paintCountry(country);
    };

    // ---- Selection + popup ----
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const anchorScratch = new THREE.Vector3();
    const normalScratch = new THREE.Vector3();
    const cameraDirScratch = new THREE.Vector3();

    function updatePopupPosition(country: CountryMesh): void {
      anchorScratch.copy(country.anchor).applyMatrix4(globeGroup.matrixWorld);
      anchorScratch.project(camera);
      // Not rounded to whole pixels: on high-refresh displays the globe moves
      // well under a pixel per frame, and snapping reads as stair-stepping.
      const sx = (anchorScratch.x * 0.5 + 0.5) * canvasSize.width;
      const sy = (-anchorScratch.y * 0.5 + 0.5) * canvasSize.height;
      popupPosRef.current = { x: sx, y: sy };
      if (popupElRef.current) {
        popupElRef.current.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
      }
      if (country.iso2 === lastSelectionIso2) return;
      lastSelectionIso2 = country.iso2;
      setSelected(getCountryStats(country.iso2, country.name));
    }

    function selectCountry(
      country: CountryMesh,
      { freezeRotation = true }: { freezeRotation?: boolean } = {},
    ): void {
      const previous = selectedCountry;
      selectedCountry = country;
      if (previous && previous !== country) paintCountry(previous);
      paintCountry(country);
      // Tour mode keeps the globe turning through each stop; a manual click
      // parks it so the popup can be read.
      if (freezeRotation) rotating = false;
      updatePopupPosition(country);
    }

    function deselect(): void {
      const previous = selectedCountry;
      selectedCountry = null;
      if (previous) paintCountry(previous);
      lastSelectionIso2 = null;
      setSelected(null);
      rotating = true;
    }

    // ---- Auto tour ----
    // Swings a country with feeds to face the camera, dwells, then moves on.
    // A self-rescheduling timeout (not an interval) so the dwell is measured
    // from when the country settles, not from when the swing started.
    let rotating = true;
    let tourTweening = false;
    let tourFromX = 0;
    let tourFromY = 0;
    let tourToX = 0;
    let tourToY = 0;
    let tourStartTime = 0;
    let tourTarget: CountryMesh | null = null;
    let tourTimeoutId: ReturnType<typeof setTimeout> | undefined;

    function scheduleTourTick(delaySeconds: number): void {
      clearTimeout(tourTimeoutId);
      tourTimeoutId = setTimeout(runTourTick, delaySeconds * 1000);
    }

    function runTourTick(): void {
      if (!tourModeRef.current) return;
      const stop = pickTourStop();
      if (!stop) return;
      deselect();

      // Solve the rotation (same independent x/y model as dragging) that
      // puts the anchor dead-centre facing the camera (+Z).
      const { x, y, z } = stop.anchor;
      const targetY = Math.atan2(-x, z);
      const targetX = Math.atan2(y, Math.hypot(x, z));
      tourFromX = globeGroup.rotation.x;
      tourFromY = globeGroup.rotation.y;
      tourToX = targetX;
      tourToY =
        globeGroup.rotation.y + normalizeAngle(targetY - globeGroup.rotation.y);
      tourStartTime = elapsed;
      tourTarget = stop;
      tourTweening = true;
    }
    runTourTickRef.current = runTourTick;

    // ---- Pointer interaction ----
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragMoved = false;

    function onPointerDown(event: PointerEvent): void {
      isDragging = true;
      dragMoved = false;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      rotating = false;
      if (tourTweening) {
        // Hand control to the drag, but keep the tour going afterwards.
        tourTweening = false;
        scheduleTourTick(TOUR_DWELL_SECONDS);
      }
      renderer.domElement.style.cursor = 'grabbing';
    }

    function onPointerMove(event: PointerEvent): void {
      if (!isDragging) return;
      const dx = event.clientX - dragStartX;
      const dy = event.clientY - dragStartY;
      if (!dragMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragMoved = true;
      const scaleFactor = Math.PI / canvasSize.width;
      globeGroup.rotation.y += dx * scaleFactor;
      globeGroup.rotation.x = THREE.MathUtils.clamp(
        globeGroup.rotation.x + dy * scaleFactor,
        -Math.PI / 2,
        Math.PI / 2,
      );
      dragStartX = event.clientX;
      dragStartY = event.clientY;
    }

    function onPointerUp(event: PointerEvent): void {
      if (!isDragging) return;
      isDragging = false;
      renderer.domElement.style.cursor = 'grab';
      if (dragMoved) {
        if (!selectedCountry) rotating = true;
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      // The first hit can be on the far hemisphere (seen through open
      // ocean), so keep only hits whose surface faces the camera.
      const frontHit = raycaster
        .intersectObjects(countryMeshes, false)
        .find((hit) => {
          normalScratch.copy(hit.point).normalize();
          cameraDirScratch.copy(camera.position).sub(hit.point).normalize();
          return normalScratch.dot(cameraDirScratch) > 0;
        });
      const country = frontHit ? countryByMesh.get(frontHit.object) : undefined;
      if (country) selectCountry(country);
      else deselect();
    }

    function handleFullscreenChange(): void {
      const nowFullscreen = document.fullscreenElement === container;
      setIsFullscreen(nowFullscreen);
      // Fullscreen is the hands-off presentation mode, so it starts the tour.
      if (nowFullscreen) startTour();
    }

    function onDoubleClick(): void {
      if (!allowFullscreen) return;
      // The container (not the canvas) goes fullscreen so the React overlays
      // — popup, legend, buttons — stay visible.
      if (document.fullscreenElement === container) exitFullscreenDocument();
      else requestFullscreenForElement(container);
    }

    // Closest distance at which the whole halo fits the canvas. The FOV is
    // vertical, so a portrait canvas is narrower horizontally and would crop
    // the glow at the default distance.
    function haloFitZoom(aspect: number): number {
      // A collapsed (0-width) canvas would push the camera to infinity.
      if (!(aspect > 0)) return DEFAULT_ZOOM;
      const halfV = THREE.MathUtils.degToRad(CAMERA_FOV / 2);
      const halfH = Math.atan(Math.tan(halfV) * aspect);
      return HALO_RADIUS / Math.sin(Math.min(halfV, halfH)) + BREATHE_AMPLITUDE;
    }

    // The user's scroll-set distance; the camera's actual z adds a slow
    // breathing offset on top (see animate()). Preview has no zoom, so it
    // pulls back whenever the canvas is too narrow for the halo.
    let baseZoom = preview
      ? Math.max(DEFAULT_ZOOM, haloFitZoom(width / height))
      : DEFAULT_ZOOM;
    function onWheel(event: WheelEvent): void {
      event.preventDefault();
      baseZoom = THREE.MathUtils.clamp(
        baseZoom + event.deltaY * 0.002,
        MIN_ZOOM,
        MAX_ZOOM,
      );
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    // The browser cancels the pointer when a touch turns into a page scroll.
    function onPointerCancel(): void {
      if (!isDragging) return;
      isDragging = false;
      renderer.domElement.style.cursor = 'grab';
      if (!selectedCountry) rotating = true;
    }

    if (!preview) {
      renderer.domElement.addEventListener('wheel', onWheel, {
        passive: false,
      });
    }
    window.addEventListener('pointercancel', onPointerCancel);
    renderer.domElement.addEventListener('dblclick', onDoubleClick);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (preview) baseZoom = Math.max(DEFAULT_ZOOM, haloFitZoom(w / h));
      renderer.setSize(w, h);
      canvasSize.width = w;
      canvasSize.height = h;
    });
    ro.observe(container);

    // The globe can be mounted well before it is scrolled to, so that it is
    // ready on arrival. Rendering it while it is off screen would spin the
    // GPU and drain battery for a picture nobody is looking at.
    let onScreen = true;
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
    });
    visibility.observe(container);

    // ---- Render loop ----
    let raf = 0;
    let elapsed = 0;
    const clock = new THREE.Clock();
    const shouldDraw = createFrameCap();
    // Time skipped by the frame cap, carried into the next drawn frame so the
    // rotation keeps its speed rather than slowing to the capped rate.
    let carriedDt = 0;
    function animate(): void {
      // Always consumed, so a spell off screen can't arrive back as one huge
      // delta; `elapsed` only advances when the globe is actually drawn, so
      // it resumes exactly where it left off.
      const delta = clock.getDelta();
      if (!onScreen) {
        raf = requestAnimationFrame(animate);
        return;
      }
      carriedDt += delta;
      if (!shouldDraw(performance.now())) {
        raf = requestAnimationFrame(animate);
        return;
      }
      const dt = carriedDt;
      carriedDt = 0;
      elapsed += dt;

      if (tourTweening && tourTarget) {
        const progress = Math.min(
          1,
          (elapsed - tourStartTime) / TOUR_TWEEN_SECONDS,
        );
        const e = easeInOutCubic(progress);
        globeGroup.rotation.x = tourFromX + (tourToX - tourFromX) * e;
        globeGroup.rotation.y = tourFromY + (tourToY - tourFromY) * e;
        if (progress >= 1) {
          tourTweening = false;
          selectCountry(tourTarget, { freezeRotation: false });
          scheduleTourTick(TOUR_DWELL_SECONDS);
        }
      } else if (rotating) {
        // Ease off while a tour stop's popup is showing so it can be read.
        globeGroup.rotation.y +=
          dt *
          (tourModeRef.current && selectedCountry
            ? TOUR_DWELL_ROTATION_SPEED
            : AMBIENT_ROTATION_SPEED);
      }
      // Popup projection needs this frame's matrix, not last frame's.
      globeGroup.updateMatrixWorld();
      if (selectedCountry) updatePopupPosition(selectedCountry);

      camera.position.z =
        baseZoom + Math.sin(elapsed * BREATHE_SPEED) * BREATHE_AMPLITUDE;
      for (const { points, parallax } of starLayers) {
        points.material.uniforms.uTime.value = elapsed;
        points.rotation.y = globeGroup.rotation.y * parallax;
        points.rotation.x = globeGroup.rotation.x * parallax;
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(tourTimeoutId);
      visibility.disconnect();
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointercancel', onPointerCancel);
      renderer.domElement.removeEventListener('dblclick', onDoubleClick);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      applyColorsRef.current = () => {};
      runTourTickRef.current = () => {};
      scene.traverse((obj) => {
        if (
          obj instanceof THREE.Mesh ||
          obj instanceof THREE.Points ||
          obj instanceof THREE.LineSegments
        ) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  // Recolour in place on light/dark switches instead of rebuilding the scene
  // (which would reset rotation and selection).
  useEffect(() => {
    applyColorsRef.current(colors);
  }, [colors]);

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: preview ? 0 : 500,
        overflow: 'hidden',
        // Also covers the browser's black backdrop in fullscreen.
        bgcolor: 'background.default',
      }}
    >
      {loading && (
        <Typography
          sx={{
            ...monoLabelSx,
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
          }}
        >
          Loading globe…
        </Typography>
      )}
      {error != null && (
        <Typography
          color='error'
          sx={{ position: 'absolute', top: 12, left: 12, zIndex: 1 }}
        >
          {error}
        </Typography>
      )}

      {selected != null && (
        <CountryStatsPopup
          key={selected.iso2}
          ref={popupElRef}
          stats={selected}
          position={popupPosRef.current}
        />
      )}

      <MapToolbar
        preview={preview}
        allowFullscreen={allowFullscreen}
        isFullscreen={isFullscreen}
        tourMode={tourMode}
        onToggleTour={toggleTour}
        onFullscreen={() => {
          requestFullscreenForElement(containerRef.current);
        }}
      />

      {!preview && <FeedLegend low={colors.low} high={colors.high} />}
    </Box>
  );
}
