'use client';

import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import { useTheme } from '../../../context/ThemeProvider';
import { ThemeModeEnum } from '../../../Theme';
import { createBasemap } from './journey-basemap';
import {
  FOCUS,
  KM_PER_UNIT,
  MAP_HALF_DEPTH,
  MAP_HALF_WIDTH,
  TILE_ZOOM,
  tilesFor,
} from './journey-tiles';
import {
  buildCylinderGeometry,
  buildRibbonGeometry,
  createElevatedMaterial,
  createShadowMaterial,
  setRawColor,
  type ElevatedUniforms,
  type FadeUniforms,
  type RibbonOptions,
} from './journey-geometry';
import { getJourneyPalette, type JourneyPalette } from './journey-palette';
import { createJourneyPins, PIN_HEIGHT } from './journey-pins';
import JourneyStandardChips, {
  type ChipElements,
  type ChipId,
} from './JourneyStandardChips';
import {
  createProjection,
  createTimeline,
  DEFAULT_TIMING,
  distanceAlong,
  journeyAt,
  loadJourneyData,
  measurePath,
  pointAlong,
  type LegId,
  type LonLat,
  type MeasuredPath,
  type MontrealJourneyData,
  type Point2,
} from './montreal-journey';
import { straightenNetwork } from './journey-network';
import { HERO_PLACEHOLDER_ATTR } from './HeroGridPlaceholder';
import { prefersReducedMotion } from './surface-shading';
import { createFrameCap } from '../../../utils/frame-cap';

// Montréal journey version of the landing-page background: the app's basemap
// laid flat in a tilted, near-isometric view, with the transit network raised
// off it. One trip plays on a loop: a bike from a BIXI dock (GBFS, with its
// availability badge) along real streets to Vendôme, the Orange line past a
// (fake) GTFS-Realtime service alert at Lionel-Groulx, then the Yellow line
// from Berri-UQAM to Longueuil. Lines off the journey are faded. Chips name
// the open standard behind each piece (GBFS, GTFS-RT, GTFS) and link to the
// feeds search for it. The traveler shows a bike, then a train.

/** Elliptical edge fade (x and z radii) and its width, as a share of them. */
const FADE_RADIUS = new THREE.Vector2(7.5, 7.5);
const FADE_WIDTH = 0.4;
const MAX_PIXEL_RATIO = 1.5;

// Element sizes, in km. Heights exaggerate so the network "pops" off the map.
const LINE_WIDTH = 0.04;
const LINE_HEIGHT = 0.015;
const BACKGROUND_LINE_WIDTH = LINE_WIDTH * 0.8;
const BACKGROUND_LINE_HEIGHT = LINE_HEIGHT * 0.8;
/**
 * Rounded top edges on the metro lines, as a share of each line's
 * half-width: the walls stay vertical down to a flat base, only the top
 * corners curve (about 3 px on the journey legs at the desktop framing).
 */
const LINE_CORNER_RATIO = 0.7;
const BIKE_WIDTH = 0.035;
const BIKE_HEIGHT = 0.01;
const BIKE_DASH = 0.11;
const BIKE_DASH_RATIO = 0.6;
const STATION_RADIUS = 0.05;
const STATION_INNER_RADIUS = 0.03;
const STATION_HEIGHT = 0.025;
/** Journey stations brighten over the traveler's last this-many km to them. */
const STATION_LIGHT_KM = 0.15;
const BACKGROUND_STATION_RADIUS = STATION_RADIUS * 0.8;
const BACKGROUND_STATION_INNER_RADIUS = STATION_INNER_RADIUS * 0.8;
const BACKGROUND_STATION_HEIGHT = STATION_HEIGHT * 0.8;
const JOURNEY_DOCK_RADIUS = 0.05;
const JOURNEY_DOCK_HEIGHT = 0.04;
const DOCK_RADIUS = 0.02;
/** Only BIXI docks this close to the bike leg show (km). */
const NEARBY_DOCK_KM = 1.2;
const DOCK_HEIGHT = 0.015;
/** Shadows spread wider than their ribbon, so their edges stay soft. */
const SHADOW_SPREAD = 2.6;
const SHADOW_OFFSET: Point2 = [0.03, 0.035];
/** Light from the back left, so walls facing the camera read darker. */
const LIGHT_DIR = new THREE.Vector3(-0.45, 1, -0.35);
/** The traveler's puck floats this far above the element it rides. */
const TRAVELER_LIFT = 0.07;

// Looking north-west across the island at a low, near-isometric angle: the
// yaw lines the screen up with the trip's own SW -> NE axis, so it runs left
// to right across the hero, with downtown and the mountain behind it.
const CAMERA_FOV = 30;
const CAMERA_DISTANCE = 17;
/** Camera elevation above the ground plane, in radians. */
const CAMERA_ELEVATION = 0.68;
/** Clockwise from looking due north, in radians. */
const CAMERA_YAW = 0.64;
/**
 * The camera looks this far past the focus, so the trip sits in the lower
 * part of the hero, below the search bar.
 */
const CAMERA_LOOK_AHEAD = 2.6;
/** Slow sway of the yaw, in radians, over DRIFT_SECONDS. */
const DRIFT = 0.05;
const DRIFT_SECONDS = 48;
/** Wider-than-this containers keep the base distance; narrower back off. */
const REFERENCE_ASPECT = 1.6;
const MAX_DISTANCE_SCALE = 2.8;

/** Final container opacity once the intro fade completes. */
const OPACITY = 0.9;
const FADE_MS = 1000;
/** The network rises off the map over this long, then pins drop in. */
const RISE_SECONDS = 1.4;
const PIN_STAGGER = 0.25;
const PIN_FADE_SECONDS = 0.45;
/** The trip starts once the intro has settled. */
const JOURNEY_DELAY = 2;
/** Reduced motion: a still frame with the traveler held at the alert. */
const FIXED_JOURNEY_TIME =
  DEFAULT_TIMING.bike +
  DEFAULT_TIMING.walk +
  DEFAULT_TIMING.toAlert +
  DEFAULT_TIMING.delay / 2;

/** Gap between a chip and its pin's head (or station), in CSS pixels. */
const CHIP_GAP_PX = 6;
/** Chips hung below a station sit further off it, clear of the line. */
const CHIP_BELOW_GAP_PX = CHIP_GAP_PX + 12;
/**
 * The GTFS chip hangs just under Square-Victoria–OACI, on the trip's Orange
 * line leg between the alert and the transfer.
 */
const GTFS_CHIP_STATION = 'STATION_M254';
/** The traveler's puck shrinks by this much mid-swap from bike to train. */
const MODE_SWAP_SHRINK = 0.35;

const RIPPLE_COUNT = 2;
/** Peak ripple opacity; kept low so the alert doesn't dominate the hero. */
const RIPPLE_OPACITY = 0.35;
const RIPPLE_SECONDS = 2.8;
const RIPPLE_MAX_RADIUS = 0.36;

const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);
const easeOutCubic = (x: number): number => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x: number): number => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

/** `hex` blended toward `toward` by `amount`, in the shaders' raw space. */
function rawMix(hex: string, toward: string, amount: number): THREE.Color {
  const a = new THREE.Color();
  const b = new THREE.Color();
  setRawColor(a, hex);
  setRawColor(b, toward);
  return a.lerp(b, amount);
}

interface SceneHandle {
  setPalette: (palette: JourneyPalette, mode: ThemeModeEnum) => void;
  dispose: () => void;
}

function mountScene(
  host: HTMLDivElement,
  data: MontrealJourneyData,
  palette: JourneyPalette,
  mode: ThemeModeEnum,
  chips: ChipElements,
): SceneHandle {
  const projection = createProjection(FOCUS, KM_PER_UNIT);
  const toWorld = (p: LonLat): Point2 => projection.toWorld(p);
  const { journey } = data;
  const lineColor = (id: string): string =>
    data.lines.find((l) => l.id === id)?.color ?? palette.bike;
  const stationById = new Map(data.stations.map((s) => [s.id, s]));

  const width = host.clientWidth || 1;
  const height = host.clientHeight || 1;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV,
    width / height,
    0.1,
    200,
  );

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const reducedMotion = prefersReducedMotion();
  if (reducedMotion) host.style.transition = 'none';
  let dirty = true;
  const redraw = (): void => {
    dirty = true;
  };

  const fade: FadeUniforms = {
    uFadeRadius: { value: FADE_RADIUS },
    uFadeWidth: { value: FADE_WIDTH },
  };
  const rise = { value: reducedMotion ? 1 : 0 };
  const shared = { ...fade, rise, light: LIGHT_DIR };

  // --- Basemap ---
  const basemap = createBasemap(
    scene,
    renderer,
    projection,
    { zoom: TILE_ZOOM, halfWidth: MAP_HALF_WIDTH, halfDepth: MAP_HALF_DEPTH },
    fade,
    redraw,
  );
  let mapReady = false;
  const loadTiles = (template: string): void => {
    basemap
      .load(template)
      .catch(() => {})
      .finally(() => {
        // Without tiles the plane still shows its grid; never block on it.
        mapReady = true;
        redraw();
      });
  };

  // --- Ribbons ---
  const addRibbon = (
    points: Point2[],
    ribbonWidth: number,
    material: THREE.ShaderMaterial,
    renderOrder: number,
    options: RibbonOptions = {},
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(
      track(buildRibbonGeometry(points, ribbonWidth, options)),
      track(material),
    );
    mesh.renderOrder = renderOrder;
    scene.add(mesh);
    return mesh;
  };
  const addShadow = (
    points: Point2[],
    ribbonWidth: number,
  ): THREE.ShaderMaterial => {
    const material = track(createShadowMaterial(palette.shadowOpacity, fade));
    const shifted = points.map(
      ([x, z]): Point2 => [x + SHADOW_OFFSET[0], z + SHADOW_OFFSET[1]],
    );
    const mesh = new THREE.Mesh(
      track(
        buildRibbonGeometry(shifted, ribbonWidth * SHADOW_SPREAD, {
          flat: true,
        }),
      ),
      material,
    );
    mesh.renderOrder = 1;
    scene.add(mesh);
    return material;
  };

  // Every line, faded; the journey's own legs are drawn over them.
  const backgroundLines = data.lines.map((line) => {
    const material = createElevatedMaterial(
      { height: BACKGROUND_LINE_HEIGHT, opacity: palette.backgroundOpacity },
      shared,
    );
    addRibbon(line.path.map(toWorld), BACKGROUND_LINE_WIDTH, material, 2, {
      height: BACKGROUND_LINE_HEIGHT,
      radius: (BACKGROUND_LINE_WIDTH / 2) * LINE_CORNER_RATIO,
    });
    return { color: line.color, material };
  });

  const [orangeLeg, yellowLeg] = journey.metro;
  const vendome = stationById.get(orangeLeg.from);
  const bikePoints = journey.bike.path.map(toWorld);
  const walkPoints: Point2[] = [
    toWorld(journey.bike.to.point),
    toWorld(vendome?.point ?? journey.bike.to.point),
  ];
  const orangePoints = orangeLeg.path.map(toWorld);
  const yellowPoints = yellowLeg.path.map(toWorld);

  const paths: Record<LegId, MeasuredPath> = {
    bike: measurePath(bikePoints),
    walk: measurePath(walkPoints),
    orange: measurePath(orangePoints),
    yellow: measurePath(yellowPoints),
  };
  const timeline = createTimeline(
    {
      bike: paths.bike.length,
      walk: paths.walk.length,
      orange: paths.orange.length,
      yellow: paths.yellow.length,
    },
    distanceAlong(paths.orange, toWorld(journey.alert.point)),
  );
  /** Top of the element each leg rides on, for the traveler's height. */
  const legTop: Record<LegId, number> = {
    bike: BIKE_HEIGHT,
    walk: 0,
    orange: LINE_HEIGHT,
    yellow: LINE_HEIGHT,
  };

  interface JourneyRibbon {
    leg: LegId;
    color: string;
    uniforms: ElevatedUniforms;
    shadow: THREE.ShaderMaterial;
  }
  const journeyRibbon = (
    leg: LegId,
    points: Point2[],
    color: string,
    options: { width: number; height: number; dash?: number; radius?: number },
  ): JourneyRibbon => {
    const material = createElevatedMaterial(
      {
        height: options.height,
        dash: options.dash,
        dashRatio: BIKE_DASH_RATIO,
      },
      shared,
    );
    addRibbon(points, options.width, material, 4, {
      height: options.height,
      radius: options.radius,
    });
    return {
      leg,
      color,
      uniforms: material.uniforms,
      shadow: addShadow(points, options.width),
    };
  };
  const journeyRibbons = [
    journeyRibbon('bike', bikePoints, palette.bike, {
      width: BIKE_WIDTH,
      height: BIKE_HEIGHT,
      dash: BIKE_DASH,
    }),
    journeyRibbon('orange', orangePoints, lineColor(orangeLeg.line), {
      width: LINE_WIDTH,
      height: LINE_HEIGHT,
      radius: (LINE_WIDTH / 2) * LINE_CORNER_RATIO,
    }),
    journeyRibbon('yellow', yellowPoints, lineColor(yellowLeg.line), {
      width: LINE_WIDTH,
      height: LINE_HEIGHT,
      radius: (LINE_WIDTH / 2) * LINE_CORNER_RATIO,
    }),
  ];

  // --- Stations and docks: instanced unit cylinders ---
  const cylinder = track(buildCylinderGeometry());
  const matrix = new THREE.Matrix4();
  const addDiscs = (
    points: Point2[],
    radius: number,
    material: THREE.ShaderMaterial,
    renderOrder: number,
    colors?: string[],
  ): THREE.InstancedMesh => {
    const mesh = new THREE.InstancedMesh(
      cylinder,
      track(material),
      points.length,
    );
    points.forEach(([x, z], i) => {
      matrix.makeScale(radius, 1, radius).setPosition(x, 0, z);
      mesh.setMatrixAt(i, matrix);
      if (colors) {
        const color = new THREE.Color();
        setRawColor(color, colors[i]);
        mesh.setColorAt(i, color);
      }
    });
    mesh.renderOrder = renderOrder;
    // Instances span the whole map; the default bounds are the unit cylinder.
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };

  const journeyStationIds = new Set(journey.metro.flatMap((l) => l.stations));
  const metroLegs = ['orange', 'yellow'] as const;
  const journeyStations = journey.metro.flatMap((leg, i) =>
    // A transfer station belongs to the earlier leg.
    leg.stations
      .filter(
        (id, j) => i === 0 || j > 0 || !journey.metro[0].stations.includes(id),
      )
      .map((id) => ({ id, color: lineColor(leg.line), leg: metroLegs[i] })),
  );
  const otherStations = data.stations.filter(
    (s) => !journeyStationIds.has(s.id),
  );

  const backgroundStationOuter = createElevatedMaterial(
    { height: BACKGROUND_STATION_HEIGHT, opacity: palette.backgroundOpacity },
    shared,
  );
  const backgroundStationInner = createElevatedMaterial(
    {
      height: BACKGROUND_STATION_HEIGHT * 1.05,
      opacity: palette.backgroundOpacity,
    },
    shared,
  );
  addDiscs(
    otherStations.map((s) => toWorld(s.point)),
    BACKGROUND_STATION_RADIUS,
    backgroundStationOuter,
    3,
    otherStations.map((s) => lineColor(s.lines[0])),
  );
  addDiscs(
    otherStations.map((s) => toWorld(s.point)),
    BACKGROUND_STATION_INNER_RADIUS,
    backgroundStationInner,
    3,
  );

  // Journey stations get their own materials, so each one can stay faded
  // until the traveler reaches it. `at` is its distance along the whole trip.
  const legOffset: Record<LegId, number> = {
    bike: 0,
    walk: paths.bike.length,
    orange: paths.bike.length + paths.walk.length,
    yellow: paths.bike.length + paths.walk.length + paths.orange.length,
  };
  const journeyStationDiscs = journeyStations.map(({ id, color, leg }) => {
    const point = toWorld(stationById.get(id)?.point ?? FOCUS);
    const outer = createElevatedMaterial({ height: STATION_HEIGHT }, shared);
    const inner = createElevatedMaterial(
      { height: STATION_HEIGHT * 1.04 },
      shared,
    );
    addDiscs([point], STATION_RADIUS, outer, 5, [color]);
    addDiscs([point], STATION_INNER_RADIUS, inner, 5);
    return {
      at: legOffset[leg] + distanceAlong(paths[leg], point),
      outer,
      inner,
    };
  });
  let stationFadedOpacity = palette.backgroundOpacity;

  const dockMaterial = createElevatedMaterial(
    { height: DOCK_HEIGHT, opacity: palette.dockOpacity },
    shared,
  );
  // The GBFS network around the ride, not the whole system.
  const bikeSamples = Array.from(
    { length: Math.ceil(paths.bike.length / 0.2) + 1 },
    (_, i) => pointAlong(paths.bike, i * 0.2),
  );
  const nearbyDocks = data.docks
    .map(toWorld)
    .filter(([x, z]) =>
      bikeSamples.some(
        ([bx, bz]) => Math.hypot(x - bx, z - bz) < NEARBY_DOCK_KM,
      ),
    );
  addDiscs(nearbyDocks, DOCK_RADIUS, dockMaterial, 3);
  const journeyDockMaterial = createElevatedMaterial(
    { height: JOURNEY_DOCK_HEIGHT },
    shared,
  );
  addDiscs(
    [toWorld(journey.bike.from.point), toWorld(journey.bike.to.point)],
    JOURNEY_DOCK_RADIUS,
    journeyDockMaterial,
    5,
  );

  // --- Alert ripples ---
  const rippleGeometry = track(new THREE.RingGeometry(0.82, 1, 48));
  rippleGeometry.rotateX(-Math.PI / 2);
  const [alertX, alertZ] = toWorld(journey.alert.point);
  const ripples = Array.from({ length: RIPPLE_COUNT }, () => {
    const material = track(
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    const mesh = new THREE.Mesh(rippleGeometry, material);
    mesh.position.set(alertX, 0.004, alertZ);
    mesh.renderOrder = 6;
    scene.add(mesh);
    return { mesh, material };
  });

  // --- Pins ---
  const fullDock = journey.bike.from.bikesAvailable;
  const pins = createJourneyPins(scene, {
    bikes: fullDock,
    capacity: journey.bike.from.capacity,
  });
  const [dockX, dockZ] = toWorld(journey.bike.from.point);
  pins.dock.position.set(dockX, JOURNEY_DOCK_HEIGHT, dockZ);
  pins.alert.position.set(alertX, STATION_HEIGHT, alertZ);
  pins.alertHighlight.position.copy(pins.alert.position);
  const pinBase = {
    dock: pins.dock.scale.clone(),
    alert: pins.alert.scale.clone(),
  };
  const puckBase = pins.traveler.bike.scale.clone();
  const [gtfsChipX, gtfsChipZ] = toWorld(
    stationById.get(GTFS_CHIP_STATION)?.point ?? FOCUS,
  );
  const gtfsChipAnchor = new THREE.Vector3(
    gtfsChipX,
    STATION_HEIGHT,
    gtfsChipZ,
  );

  // Chips are HTML over the canvas: project each anchor to CSS pixels. Pins
  // are billboards, so "above the pin" is along the camera's up axis.
  const cameraUp = new THREE.Vector3();
  const projected = new THREE.Vector3();
  let viewWidth = width;
  let viewHeight = height;
  const placeChip = (
    id: ChipId,
    anchor: THREE.Vector3,
    lift: number,
    placement: 'above' | 'below',
    opacity: number,
  ): void => {
    const element = chips[id];
    if (!element) return;
    cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    projected.copy(anchor).addScaledVector(cameraUp, lift).project(camera);
    const x = ((projected.x + 1) / 2) * viewWidth;
    const y = ((1 - projected.y) / 2) * viewHeight;
    const offsetY =
      placement === 'above'
        ? `calc(-100% - ${CHIP_GAP_PX}px)`
        : `${CHIP_BELOW_GAP_PX}px`;
    element.style.transform = `translate(${x}px, ${y}px) translate(-50%, ${offsetY})`;
    element.style.opacity = String(opacity);
    // Hidden chips must not take clicks or focus.
    element.style.visibility = opacity > 0.01 ? 'visible' : 'hidden';
  };

  // --- Colors ---
  const applyPalette = (next: JourneyPalette): void => {
    basemap.setColors(next.basemap);
    backgroundLines.forEach(({ color, material }) => {
      material.uniforms.uColor.value.copy(
        rawMix(color, next.paper, next.backgroundMix),
      );
      material.uniforms.uOpacity.value = next.backgroundOpacity;
    });
    journeyRibbons.forEach(({ color, uniforms, shadow }) => {
      uniforms.uColor.value.copy(rawMix(color, next.paper, next.untraveledMix));
      setRawColor(uniforms.uFillColor.value, color);
      setRawColor(shadow.uniforms.uColor.value as THREE.Color, next.shadow);
      shadow.uniforms.uOpacity.value = next.shadowOpacity;
    });
    setRawColor(backgroundStationOuter.uniforms.uColor.value, '#ffffff');
    setRawColor(backgroundStationInner.uniforms.uColor.value, next.stationFill);
    journeyStationDiscs.forEach(({ outer, inner }) => {
      setRawColor(outer.uniforms.uColor.value, '#ffffff');
      setRawColor(inner.uniforms.uColor.value, next.stationFill);
    });
    stationFadedOpacity = next.backgroundOpacity;
    [backgroundStationOuter, backgroundStationInner].forEach((m) => {
      m.uniforms.uOpacity.value = next.backgroundOpacity;
    });
    setRawColor(dockMaterial.uniforms.uColor.value, next.dock);
    dockMaterial.uniforms.uOpacity.value = next.dockOpacity;
    setRawColor(journeyDockMaterial.uniforms.uColor.value, next.dock);
    ripples.forEach(({ material }) => {
      material.color.set(next.pins.alert);
    });
    pins.setPalette(next.pins);
    redraw();
  };
  applyPalette(palette);
  loadTiles(tilesFor(mode));

  // --- Camera ---
  let aspect = width / height;
  const target = new THREE.Vector3();
  const placeCamera = (yaw: number): void => {
    // Narrow containers back off so the whole trip fits across them. The
    // look-ahead grows with the distance, which keeps the trip at the same
    // height on screen.
    const scale = Math.min(
      Math.max(REFERENCE_ASPECT / aspect, 1),
      MAX_DISTANCE_SCALE,
    );
    const distance = CAMERA_DISTANCE * scale;
    target.set(
      -Math.sin(CAMERA_YAW) * CAMERA_LOOK_AHEAD * scale,
      0,
      -Math.cos(CAMERA_YAW) * CAMERA_LOOK_AHEAD * scale,
    );
    const horizontal = Math.cos(CAMERA_ELEVATION) * distance;
    camera.position.set(
      target.x + Math.sin(yaw) * horizontal,
      Math.sin(CAMERA_ELEVATION) * distance,
      target.z + Math.cos(yaw) * horizontal,
    );
    camera.lookAt(target);
  };

  // --- Frame ---
  let introStart: number | null = null;

  const renderAt = (seconds: number): void => {
    introStart ??= seconds;
    const elapsed = reducedMotion ? Infinity : seconds - introStart;
    rise.value = reducedMotion
      ? 1
      : Math.max(easeOutCubic(clamp01(elapsed / RISE_SECONDS)), 1e-3);
    const pinIn = (i: number): number =>
      reducedMotion
        ? 1
        : clamp01(
            (elapsed - RISE_SECONDS * 0.6 - i * PIN_STAGGER) / PIN_FADE_SECONDS,
          );

    const journeyTime = reducedMotion
      ? FIXED_JOURNEY_TIME
      : Math.max(elapsed - JOURNEY_DELAY, 0);
    const state = journeyAt(timeline, journeyTime);
    const started = reducedMotion || elapsed >= JOURNEY_DELAY;
    const presence = state.presence * pinIn(3);

    journeyRibbons.forEach(({ leg, uniforms }) => {
      uniforms.uFill.value = state.traveled[leg];
      uniforms.uFillAmount.value = presence;
    });

    // Stations light up as the traveler reaches them, and dim again with the
    // trail at the loop seam. `traveled` is full for past legs, so its sum is
    // the distance covered over the whole trip.
    const covered =
      state.traveled.bike +
      state.traveled.walk +
      state.traveled.orange +
      state.traveled.yellow;
    journeyStationDiscs.forEach(({ at, outer, inner }) => {
      const lit = clamp01((covered - at) / STATION_LIGHT_KM + 1) * presence;
      const opacity =
        stationFadedOpacity + (1 - stationFadedOpacity) * easeOutCubic(lit);
      outer.uniforms.uOpacity.value = opacity;
      inner.uniforms.uOpacity.value = opacity;
    });

    // Traveler puck on top of whatever it rides: a bike, swapping to a
    // train during the walk into the station (shrink, crossfade, grow).
    const [tx, tz] = pointAlong(paths[state.leg], state.distance);
    const onTrain =
      state.leg === 'bike' ? 0 : state.leg === 'walk' ? state.stepProgress : 1;
    const swapScale = 1 - MODE_SWAP_SHRINK * Math.sin(Math.PI * onTrain);
    (['bike', 'train'] as const).forEach((mode) => {
      const puck = pins.traveler[mode];
      const share = mode === 'train' ? onTrain : 1 - onTrain;
      puck.position.set(tx, legTop[state.leg] * rise.value + TRAVELER_LIFT, tz);
      puck.scale.copy(puckBase).multiplyScalar(swapScale);
      puck.material.opacity = presence * share;
      puck.visible = puck.material.opacity > 0.01;
    });

    // GBFS badge: one bike leaves the dock with the traveler.
    pins.setDockBikes(
      started && state.phase !== 'reset' ? fullDock - 1 : fullDock,
    );

    // Pins drop in after the rise. While the traveler is held at the alert,
    // the pin warms to its full alert color (no growing).
    const t = reducedMotion ? 0 : seconds;
    const delayed = state.phase === 'delayed';
    const alertHighlight = delayed ? Math.sin(Math.PI * state.stepProgress) : 0;
    const drop = (i: number): number =>
      reducedMotion ? 1 : easeOutBack(pinIn(i));
    const dockScale = Math.max(drop(0), 1e-3);
    const alertScale = Math.max(drop(1), 1e-3);
    pins.dock.material.opacity = pinIn(0);
    pins.dock.scale.copy(pinBase.dock).multiplyScalar(dockScale);
    pins.alert.material.opacity = pinIn(1);
    pins.alert.scale.copy(pinBase.alert).multiplyScalar(alertScale);
    pins.alertHighlight.scale.copy(pins.alert.scale);
    pins.alertHighlight.material.opacity = pinIn(1) * alertHighlight;
    pins.alertHighlight.visible = pins.alertHighlight.material.opacity > 0.01;
    pins.dock.visible = pins.dock.material.opacity > 0.01;
    pins.alert.visible = pins.alert.material.opacity > 0.01;

    // Real-time alert: ripples spread slowly from the station.
    ripples.forEach(({ mesh, material }, i) => {
      const phase = reducedMotion
        ? 0.45
        : (t / RIPPLE_SECONDS + i / RIPPLE_COUNT) % 1;
      const radius = 0.06 + RIPPLE_MAX_RADIUS * phase;
      mesh.scale.set(radius, 1, radius);
      material.opacity = (1 - phase) * RIPPLE_OPACITY * pinIn(1);
    });

    placeCamera(
      CAMERA_YAW +
        (reducedMotion
          ? 0
          : Math.sin((seconds * Math.PI * 2) / DRIFT_SECONDS) * DRIFT),
    );
    camera.updateMatrixWorld();

    // Chips ride on their pin's head, through its drop-in and pulse.
    placeChip(
      'gbfs',
      pins.dock.position,
      PIN_HEIGHT * dockScale,
      'above',
      pinIn(0),
    );
    placeChip(
      'gtfsRt',
      pins.alert.position,
      PIN_HEIGHT * alertScale,
      'above',
      pinIn(1),
    );
    placeChip('gtfs', gtfsChipAnchor, 0, 'below', pinIn(2));

    renderer.render(scene, camera);
    if (host.style.opacity !== String(OPACITY)) {
      host.style.opacity = String(OPACITY);
      // The CSS stand-in fades out over the same interval the scene fades in,
      // so the grid the two share never doubles up or blinks.
      document
        .querySelector<HTMLElement>(`[${HERO_PLACEHOLDER_ATTR}]`)
        ?.style.setProperty('opacity', '0');
    }
  };

  // With reduced motion the scene is still, so only redraw on changes
  // (resize, theme, tiles). Offscreen, nothing renders at all. Nothing shows
  // until the basemap has settled, so the map never pops in tile by tile.
  let onScreen = true;
  const visibility = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    dirty = true;
  });
  visibility.observe(host);

  let raf = 0;
  const shouldDraw = createFrameCap();
  const animate = (): void => {
    const now = performance.now();
    // `shouldDraw` last, so a frame the scene wasn't going to draw anyway
    // doesn't consume a slot in the cap's schedule.
    if (mapReady && onScreen && (!reducedMotion || dirty) && shouldDraw(now)) {
      renderAt(now / 1000);
      dirty = false;
    }
    raf = requestAnimationFrame(animate);
  };
  animate();

  const onResize = (): void => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    aspect = w / h;
    viewWidth = w;
    viewHeight = h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    dirty = true;
  };
  onResize();
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(host);

  return {
    setPalette: (next, nextMode) => {
      applyPalette(next);
      loadTiles(tilesFor(nextMode));
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      visibility.disconnect();
      pins.dispose();
      basemap.dispose();
      disposables.forEach((item) => {
        item.dispose();
      });
      renderer.dispose();
      host.removeChild(renderer.domElement);
    },
  };
}

export default function AccessibilityBackgroundSurface(): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);

  const { mode: themeMode } = useTheme();
  const palette = useMemo(() => getJourneyPalette(themeMode), [themeMode]);
  const latest = useRef({ palette, themeMode });
  latest.current = { palette, themeMode };
  const sceneRef = useRef<SceneHandle | null>(null);
  // Filled by JourneyStandardChips' refs; read by the scene every frame.
  const chipsRef = useRef<ChipElements>({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    // Decorative only: if the data fails to load, the hero stays plain.
    loadJourneyData()
      .then((data) => {
        if (cancelled) return;
        sceneRef.current = mountScene(
          container,
          // Straight runs between stations, every station on its lines.
          straightenNetwork(data),
          latest.current.palette,
          latest.current.themeMode,
          chipsRef.current,
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Recolor in place (and swap light/dark tiles) instead of rebuilding.
  useEffect(() => {
    sceneRef.current?.setPalette(palette, themeMode);
  }, [palette]);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: -1,
          opacity: 0,
          transition: `opacity ${FADE_MS}ms ease-out`,
          overflow: 'hidden',
        }}
        aria-hidden='true'
      >
        <span
          style={{
            position: 'absolute',
            right: 8,
            bottom: 4,
            fontSize: 10,
            opacity: 0.6,
            color: palette.pins.badgeMuted,
            pointerEvents: 'none',
          }}
        >
          © OpenStreetMap contributors © CARTO · STM · BIXI
        </span>
      </div>
      <JourneyStandardChips elements={chipsRef.current} />
    </>
  );
}
