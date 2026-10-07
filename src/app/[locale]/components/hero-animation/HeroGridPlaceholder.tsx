import { type ReactElement } from 'react';

// The hero's ground plane, in CSS, for the moment before the scene exists.
//
// It stands in for exactly what the scene draws on its first frame: the
// basemap shader starts at `uMapReady = 0`, which paints the plane flat in
// the page's own colour with only the faint brand-coloured grid over it. So
// this is not an approximation of the finished hero but a copy of its
// opening frame, which is why handing over to the real scene reads as the
// map arriving rather than as one image swapping for another.
//
// Server-rendered, unlike the scene itself: `HeroBackground` is
// `ssr: false`, so anything inside it appears only once its chunk has loaded.
// Positioned exactly as the scene's own host is — `inset: 0` with no
// positioned ancestor, so both resolve against the initial containing block.

/** Marks the element for the scene to fade out on its first painted frame. */
export const HERO_PLACEHOLDER_ATTR = 'data-hero-placeholder';

// Derived from the scene's camera so the two line up. CAMERA_FOV 30deg over
// the viewport height h gives a perspective of (h / 2) / tan(15deg);
// CAMERA_ELEVATION 0.68 rad above the horizontal is a 51.04deg tilt off
// head-on, and CAMERA_YAW 0.64 rad spins the plane about its own normal.
const PERSPECTIVE_VH = 186.6;
const TILT_DEG = 51.04;
const YAW_DEG = 36.67;
/**
 * The shader's grid is 0.5 world units (500 m). At the camera's distance one
 * world unit covers about 79 px, so a cell is a touch under 40.
 */
const CELL_PX = 40;
/** FADE_RADIUS (7.5 world units) in the same pixels, and FADE_WIDTH of it. */
const FADE_PX = 593;
const FADE_INNER = '60%';
/** Matches the scene's own grid strength, between its light and dark values. */
const GRID_MIX = '6%';

export default function HeroGridPlaceholder(): ReactElement {
  const line = `color-mix(in srgb, var(--mui-palette-primary-main) ${GRID_MIX}, transparent)`;
  const fade = `radial-gradient(circle ${FADE_PX}px at 50% 50%, #000 ${FADE_INNER}, transparent 100%)`;

  return (
    <div
      {...{ [HERO_PLACEHOLDER_ATTR]: '' }}
      aria-hidden='true'
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: -1,
        overflow: 'hidden',
        perspective: `${PERSPECTIVE_VH}vh`,
        // The scene fades this out itself; the transition is the other half
        // of its own 1s fade-in, so the two cross rather than cut.
        opacity: 0.9,
        transition: 'opacity 1000ms ease-out',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: `${FADE_PX * 2}px`,
          height: `${FADE_PX * 2}px`,
          transform: `translate(-50%, -50%) rotateX(${TILT_DEG}deg) rotateZ(${YAW_DEG}deg)`,
          backgroundImage: `repeating-linear-gradient(0deg, ${line} 0 1px, transparent 1px ${CELL_PX}px), repeating-linear-gradient(90deg, ${line} 0 1px, transparent 1px ${CELL_PX}px)`,
          maskImage: fade,
          WebkitMaskImage: fade,
        }}
      />
    </div>
  );
}
