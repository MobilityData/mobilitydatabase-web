import * as THREE from 'three';
import { type Peak } from './accessibility-model';

// Map-pin sprites with a transit glyph (bus, train or bike), parked on top of
// accessibility peaks. One sprite per fixed anchor (destination or station).
// A pin shows while its anchor sits on one of the most prominent peaks and
// fades out otherwise, so pins never slide across the map when one hill takes
// over from another.

export const CANVAS_W = 128;
export const CANVAS_H = 192;
const HEAD_X = CANVAS_W / 2;
const HEAD_Y = 62;
const HEAD_R = 50;
const TIP_Y = CANVAS_H - 6;
const INNER_R = 36;
const OUTLINE_PX = 7;

export interface PinIcon {
  /** Material Icons path (24x24 viewBox). */
  path: string;
  /** Glyph scale inside the pin's head; wider glyphs get less. */
  scale: number;
  /** Visual centre of the glyph in its viewBox. */
  cx: number;
  cy: number;
}

/** Material Icons "DirectionsBus", "Train" and "DirectionsBike". */
export const PIN_ICONS: PinIcon[] = [
  {
    path:
      'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 ' +
      '.55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4' +
      '-8-4s-8 .5-8 4zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 ' +
      '1.5S8.33 17 7.5 17m9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 ' +
      '1.5-.67 1.5-1.5 1.5m1.5-6H6V6h12z',
    scale: 2.3,
    cx: 12,
    cy: 11.5,
  },
  {
    path:
      'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 ' +
      '2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4M7.5 17c-.83 ' +
      '0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17m3.5-7H6V6h5' +
      'zm2 0V6h5v4zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 ' +
      '1.5-.67 1.5-1.5 1.5',
    scale: 2.3,
    cx: 12,
    cy: 11.5,
  },
  {
    path:
      'M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2M5 12c-2.8 0-5 2.2-5 ' +
      '5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5m0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 ' +
      '3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5m5.8-10 2.4-2.4.8.8c1.3 1.3 3 2.1 ' +
      '5.1 2.1V9c-1.5 0-2.7-.6-3.6-1.5l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6' +
      'L7.8 8.4c-.4.4-.6.9-.6 1.4 0 .6.2 1.1.6 1.4L11 14v5h2v-6.2zM19 12c-2.8 ' +
      '0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5m0 8.5c-1.9 0-3.5-1.6-3.5-3.5' +
      's1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5',
    scale: 1.8,
    cx: 12,
    cy: 11.75,
  },
];

/** Pin height in world units; width follows the canvas aspect. */
const PIN_HEIGHT = 0.3;
/** A peak further than this from its anchor belongs to another place. */
export const ANCHOR_RADIUS = 0.5;
/** Peaks closer than this (ground units) are treated as the same hill. */
const MERGE_DISTANCE = 0.25;
/** How many pins to aim for on the map at any time. */
export const MIN_PINS = 5;
export const MAX_PINS = 7;
/** Beyond MIN_PINS, peaks below this share of the tallest one get no pin. */
const MIN_RELATIVE_HEIGHT = 0.3;
const OPACITY_EASING = 0.08;
/** Per-frame easing of pin ground positions; smooths any residual jitter. */
const POSITION_EASING = 0.2;
/**
 * Hysteresis for the show/hide tests: a visible pin must fall this far past
 * the thresholds before it hides, so pins near a boundary don't flicker.
 */
const HIDE_MARGIN = 0.75;
/** Ranking bonus for visible pins, so near-ties don't swap pins back and forth. */
const SHOWN_BONUS = 1.15;

/**
 * Which anchors get a pin this frame. Anchors on a peak of their own compete
 * by peak height (currently shown ones get a bonus); the tallest distinct
 * hills win, up to MAX_PINS, and low ones only drop out while at least
 * MIN_PINS remain. Pure, so it can be unit-tested.
 */
export function selectPins(
  anchors: ReadonlyArray<{ x: number; y: number }>,
  peaks: ReadonlyArray<Peak | null>,
  shown: readonly boolean[],
): boolean[] {
  const candidates: Array<{ i: number; peak: Peak; score: number }> = [];
  peaks.forEach((peak, i) => {
    if (peak === null) return;
    const margin = shown[i] ? HIDE_MARGIN : 1;
    const anchor = anchors[i];
    const own =
      Math.hypot(peak.x - anchor.x, peak.y - anchor.y) < ANCHOR_RADIUS / margin;
    if (!own) return;
    candidates.push({
      i,
      peak,
      score: peak.value * (shown[i] ? SHOWN_BONUS : 1),
    });
  });
  // Tallest first, so the taller of two merged hills keeps the pin.
  candidates.sort((a, b) => b.score - a.score);

  const kept: typeof candidates = [];
  for (const candidate of candidates) {
    if (kept.length === MAX_PINS) break;
    const margin = shown[candidate.i] ? HIDE_MARGIN : 1;
    const duplicate = kept.some(
      (k) =>
        Math.hypot(k.peak.x - candidate.peak.x, k.peak.y - candidate.peak.y) <
        MERGE_DISTANCE * margin,
    );
    if (!duplicate) kept.push(candidate);
  }

  const tallest = kept[0]?.peak.value ?? 0;
  while (kept.length > MIN_PINS) {
    const last = kept[kept.length - 1];
    const margin = shown[last.i] ? HIDE_MARGIN : 1;
    if (last.peak.value >= tallest * MIN_RELATIVE_HEIGHT * margin) break;
    kept.pop();
  }

  const show = peaks.map(() => false);
  kept.forEach((k) => {
    show[k.i] = true;
  });
  return show;
}

/** Deterministic icon per anchor, spread evenly over the three modes. */
function assignIcons(count: number): number[] {
  const icons = Array.from({ length: count }, (_, i) => i % PIN_ICONS.length);
  // Seeded Fisher-Yates shuffle so every viewer sees the same map.
  let s = 20260930;
  for (let i = icons.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [icons[i], icons[j]] = [icons[j], icons[i]];
  }
  return icons;
}

export function drawPin(
  canvas: HTMLCanvasElement,
  color: string,
  icon: PinIcon,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Teardrop: the head circle joined to the tip by its two tangent lines.
  const spread = Math.acos(HEAD_R / (TIP_Y - HEAD_Y));
  ctx.beginPath();
  ctx.moveTo(HEAD_X, TIP_Y);
  ctx.arc(HEAD_X, HEAD_Y, HEAD_R, Math.PI / 2 + spread, Math.PI / 2 - spread);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  // White outline keeps the pin legible on peaks of a similar hue.
  ctx.lineJoin = 'round';
  ctx.lineWidth = OUTLINE_PX;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(HEAD_X, HEAD_Y, INNER_R, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.save();
  ctx.translate(HEAD_X - icon.cx * icon.scale, HEAD_Y - icon.cy * icon.scale);
  ctx.scale(icon.scale, icon.scale);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(icon.path));
  ctx.restore();
}

export interface StopPins {
  /**
   * Move pins onto `peaks`, one per anchor (`null` when the anchor has no
   * peak nearby; see `findPeaks`). `heightAt` gives the surface's world
   * height at a ground point; `fade` (0..1) scales every pin's opacity. With
   * `instant`, opacities jump to their targets instead of easing (reduced
   * motion).
   */
  update: (
    anchors: ReadonlyArray<{ x: number; y: number }>,
    peaks: ReadonlyArray<Peak | null>,
    heightAt: (x: number, y: number) => number,
    fade: number,
    instant: boolean,
  ) => void;
  setColor: (color: string) => void;
  dispose: () => void;
}

export function createStopPins(scene: THREE.Scene, count: number): StopPins {
  // One texture per mode, shared by every pin that shows it.
  const textures = PIN_ICONS.map(() => {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return { canvas, texture };
  });
  const icons = assignIcons(count);

  const group = new THREE.Group();
  scene.add(group);

  const sprites = icons.map((icon) => {
    const material = new THREE.SpriteMaterial({
      map: textures[icon].texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    // Anchor at the pin's tip so it sits on the peak.
    sprite.center.set(0.5, 0);
    sprite.scale.set((PIN_HEIGHT * CANVAS_W) / CANVAS_H, PIN_HEIGHT, 1);
    // Drawn after the (transparent) terrain so hills in front still occlude.
    sprite.renderOrder = 1;
    sprite.visible = false;
    group.add(sprite);
    return sprite;
  });

  // Smoothed ground position and current show state, per sprite.
  const ground = sprites.map(() => new THREE.Vector2());
  let shown = sprites.map(() => false);

  return {
    update: (anchors, peaks, heightAt, fade, instant) => {
      shown = selectPins(anchors, peaks, shown);
      peaks.forEach((peak, i) => {
        const sprite = sprites[i];
        const show = shown[i] && peak !== null;

        const material = sprite.material;
        const target = show ? fade : 0;
        material.opacity = instant
          ? target
          : material.opacity + (target - material.opacity) * OPACITY_EASING;
        const wasVisible = sprite.visible;
        sprite.visible = material.opacity > 0.01;

        // Snap when (re)appearing; otherwise ease toward the peak. A fading
        // pin stays put instead of following the hill away from its anchor.
        const point = ground[i];
        if (show && (instant || !wasVisible)) {
          point.set(peak.x, peak.y);
        } else if (show) {
          point.x += (peak.x - point.x) * POSITION_EASING;
          point.y += (peak.y - point.y) * POSITION_EASING;
        }
        // Height is read live so the tip stays on the moving surface.
        sprite.position.set(point.x, heightAt(point.x, point.y), point.y);
      });
    },
    setColor: (color) => {
      textures.forEach(({ canvas, texture }, i) => {
        drawPin(canvas, color, PIN_ICONS[i]);
        texture.needsUpdate = true;
      });
    },
    dispose: () => {
      scene.remove(group);
      sprites.forEach((sprite) => {
        sprite.material.dispose();
      });
      textures.forEach(({ texture }) => {
        texture.dispose();
      });
    },
  };
}
