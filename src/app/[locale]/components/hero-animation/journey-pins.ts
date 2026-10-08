import * as THREE from 'three';
import {
  CANVAS_H,
  CANVAS_W,
  drawPin,
  PIN_ICONS,
  type PinIcon,
} from './stop-pins';

// Canvas-drawn sprites for the journey hero: the same teardrop pins as the
// other hero backgrounds (bike dock, service alert), the dock's
// live-availability badge, and the traveler's puck, which shows a bike or a
// train for the leg it's on. The standard chips (GBFS, GTFS-RT, GTFS) are
// HTML links over the canvas, not sprites, so they can be clicked.

const BIKE_ICON = PIN_ICONS[2];
const TRAIN_ICON = PIN_ICONS[1];
/** Material Icons "Warning". */
const ALERT_ICON: PinIcon = {
  path: 'M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z',
  scale: 2.1,
  cx: 12,
  cy: 12.5,
};

/** Pin height in world units (km); width follows the canvas aspect. */
export const PIN_HEIGHT = 0.5;

// Badge beside the dock pin's head: "16 / 23" over an availability bar.
const BADGE_W = 196;
const BADGE_H = 88;
/** Clear gap between the pin's head and the badge. */
const BADGE_X = CANVAS_W + 10;
const BADGE_Y = 18;
const BADGE_RADIUS = 18;
const BADGE_PAD = 22;
const DOCK_CANVAS_W = BADGE_X + BADGE_W + 6;

const PUCK_PX = 96;
const PUCK_SIZE = 0.26;
const PUCK_OUTER_R = 44;
const PUCK_INNER_R = 37;
/** Glyph scale in the puck, relative to the same glyph in a pin's head. */
const PUCK_ICON_SCALE = 0.78;

export interface PinPalette {
  pin: string;
  /** Alert pin at rest, and while the traveler is held at it. */
  alert: string;
  alertActive: string;
  traveler: string;
  badgeBackground: string;
  badgeText: string;
  badgeMuted: string;
  badgeTrack: string;
  /** Resolved CSS font family for canvas text. */
  font: string;
}

interface CanvasSprite {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
}

function createCanvasSprite(
  group: THREE.Group,
  width: number,
  height: number,
  worldHeight: number,
  center: [number, number],
): CanvasSprite {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(...center);
  sprite.scale.set((worldHeight * width) / height, worldHeight, 1);
  sprite.renderOrder = 10;
  group.add(sprite);
  return { sprite, canvas, texture };
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawDockPin(
  canvas: HTMLCanvasElement,
  scratch: HTMLCanvasElement,
  palette: PinPalette,
  bikes: number,
  capacity: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Badge first, so the pin's head overlaps its left edge.
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  roundedRect(ctx, BADGE_X, BADGE_Y, BADGE_W, BADGE_H, BADGE_RADIUS);
  ctx.fillStyle = palette.badgeBackground;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 4;
  ctx.strokeStyle = palette.pin;
  roundedRect(ctx, BADGE_X, BADGE_Y, BADGE_W, BADGE_H, BADGE_RADIUS);
  ctx.stroke();

  const textX = BADGE_X + BADGE_PAD + 16;
  const baseline = BADGE_Y + 50;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 44px ${palette.font}`;
  ctx.fillStyle = palette.badgeText;
  const count = String(bikes);
  ctx.fillText(count, textX, baseline);
  const countWidth = ctx.measureText(count).width;
  ctx.font = `600 30px ${palette.font}`;
  ctx.fillStyle = palette.badgeMuted;
  ctx.fillText(`/ ${capacity}`, textX + countWidth + 10, baseline);

  // Availability bar: bikes over capacity.
  const barX = textX;
  const barY = BADGE_Y + BADGE_H - 26;
  const barW = BADGE_X + BADGE_W - BADGE_PAD - barX;
  const barH = 10;
  roundedRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fillStyle = palette.badgeTrack;
  ctx.fill();
  roundedRect(
    ctx,
    barX,
    barY,
    Math.max(barW * (bikes / Math.max(capacity, 1)), barH),
    barH,
    barH / 2,
  );
  ctx.fillStyle = palette.pin;
  ctx.fill();

  drawPin(scratch, palette.pin, BIKE_ICON);
  ctx.drawImage(scratch, 0, 0);
}

/** The traveler: a white-ringed disc with the current mode's glyph. */
function drawPuck(
  canvas: HTMLCanvasElement,
  palette: PinPalette,
  icon: PinIcon,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const c = PUCK_PX / 2;
  ctx.clearRect(0, 0, PUCK_PX, PUCK_PX);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(c, c, PUCK_OUTER_R, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(c, c, PUCK_INNER_R, 0, Math.PI * 2);
  ctx.fillStyle = palette.traveler;
  ctx.fill();

  const scale = icon.scale * PUCK_ICON_SCALE;
  ctx.save();
  ctx.translate(c - icon.cx * scale, c - icon.cy * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fill(new Path2D(icon.path));
  ctx.restore();
}

export interface JourneyPins {
  dock: THREE.Sprite;
  alert: THREE.Sprite;
  /** Same pin in the full alert color, faded in over `alert`. */
  alertHighlight: THREE.Sprite;
  /** Same spot, crossfaded as the traveler switches mode. */
  traveler: { bike: THREE.Sprite; train: THREE.Sprite };
  setPalette: (palette: PinPalette) => void;
  /** Redraws the dock badge when availability changes. */
  setDockBikes: (bikes: number) => void;
  dispose: () => void;
}

export function createJourneyPins(
  scene: THREE.Scene,
  dock: { bikes: number; capacity: number },
): JourneyPins {
  const group = new THREE.Group();
  scene.add(group);

  // Pins anchor at their tip; the dock canvas is wider, tip still at x = 64.
  const dockSprite = createCanvasSprite(
    group,
    DOCK_CANVAS_W,
    CANVAS_H,
    PIN_HEIGHT,
    [CANVAS_W / 2 / DOCK_CANVAS_W, 0],
  );
  const alertSprite = createCanvasSprite(
    group,
    CANVAS_W,
    CANVAS_H,
    PIN_HEIGHT,
    [0.5, 0],
  );
  const alertHighlightSprite = createCanvasSprite(
    group,
    CANVAS_W,
    CANVAS_H,
    PIN_HEIGHT,
    [0.5, 0],
  );
  // Drawn over the resting pin so the crossfade only ever warms it.
  alertHighlightSprite.sprite.renderOrder = 10.5;
  const createPuck = (): CanvasSprite => {
    const puck = createCanvasSprite(
      group,
      PUCK_PX,
      PUCK_PX,
      PUCK_SIZE,
      [0.5, 0.5],
    );
    // Never hidden by the ribbon it rides on.
    puck.sprite.material.depthTest = false;
    puck.sprite.renderOrder = 11;
    return puck;
  };
  const bikePuck = createPuck();
  const trainPuck = createPuck();

  const scratch = document.createElement('canvas');
  scratch.width = CANVAS_W;
  scratch.height = CANVAS_H;

  let palette: PinPalette | null = null;
  let bikes = dock.bikes;

  const redrawDock = (): void => {
    if (!palette) return;
    drawDockPin(dockSprite.canvas, scratch, palette, bikes, dock.capacity);
    dockSprite.texture.needsUpdate = true;
  };

  const sprites = [
    dockSprite,
    alertSprite,
    alertHighlightSprite,
    bikePuck,
    trainPuck,
  ];

  return {
    dock: dockSprite.sprite,
    alert: alertSprite.sprite,
    alertHighlight: alertHighlightSprite.sprite,
    traveler: { bike: bikePuck.sprite, train: trainPuck.sprite },
    setPalette: (next) => {
      palette = next;
      redrawDock();
      drawPin(alertSprite.canvas, next.alert, ALERT_ICON);
      drawPin(alertHighlightSprite.canvas, next.alertActive, ALERT_ICON);
      drawPuck(bikePuck.canvas, next, BIKE_ICON);
      drawPuck(trainPuck.canvas, next, TRAIN_ICON);
      sprites.forEach(({ texture }) => {
        texture.needsUpdate = true;
      });
    },
    setDockBikes: (next) => {
      if (next === bikes) return;
      bikes = next;
      redrawDock();
    },
    dispose: () => {
      scene.remove(group);
      sprites.forEach(({ sprite, texture }) => {
        sprite.material.dispose();
        texture.dispose();
      });
    },
  };
}
