import { type ReactElement } from 'react';
import { Box } from '@mui/material';

// Stands in for the globe between the section scrolling into view and the
// scene being built — roughly a chunk download plus a few hundred
// milliseconds of mesh building, which otherwise reads as a blank column
// that snaps to a finished globe.
//
// Pure CSS, so it costs nothing to fetch and is in the server-rendered
// markup rather than waiting on the globe's own client-only chunk.
//
// Sized from the scene's own camera rather than by eye: a 45deg vertical FOV
// at the globe's resting distance of 4.04 puts its unit sphere across 59.8%
// of a square canvas, and the atmospheric halo is the 1.5-radius shell
// around it, so 90%.
//
// It shows the lit sphere and its glow but no countries and no graticule:
// the real globe has no latitude lines either, and drawing the coastlines
// would mean shipping the topology this is meant to be covering for.

/** Sphere and glow diameters, as a share of the square canvas. */
const SPHERE = '59.8%';
const HALO = '90%';
/**
 * The glow falls off from the centre outward, like the scene's Gaussian
 * atmosphere, rather than being drawn as a ring. The sphere covers
 * everything inside 33.2% of the halo's own box, so what shows is the tail
 * of that falloff -- a soft corona rather than a hard rim, which is what a
 * ring gradient kept producing on whichever side had the darker sphere.
 */
const GLOW_STOPS = '0%, 46%, 70%';

export default function GlobePlaceholder(): ReactElement {
  return (
    <Box
      aria-hidden='true'
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        // Never in the way of dragging the globe once it is behind this.
        pointerEvents: 'none',
      }}
    >
      {/* Atmospheric glow, mostly hidden behind the sphere. */}
      <Box
        sx={(theme) => {
          const tint = theme.vars.palette.primary;
          const [a, b, c] = GLOW_STOPS.split(', ');
          const ring = (core: string, edge: string): string =>
            `radial-gradient(circle, ${core} ${a}, ${edge} ${b}, transparent ${c})`;
          const mix = (colour: string, pct: number): string =>
            `color-mix(in srgb, ${colour} ${pct}%, transparent)`;
          return {
            gridArea: '1 / 1',
            width: HALO,
            aspectRatio: '1 / 1',
            borderRadius: '50%',
            background: ring(mix(tint.light, 62), mix(tint.light, 26)),
            animation: 'mdbGlobePulse 2600ms ease-in-out infinite',
            '@keyframes mdbGlobePulse': {
              '0%, 100%': { opacity: 0.5 },
              '50%': { opacity: 1 },
            },
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'none',
              opacity: 0.75,
            },
            ...theme.applyStyles('dark', {
              background: ring(mix(tint.dark, 85), mix(tint.dark, 32)),
            }),
          };
        }}
      />
      {/* The sphere. Lit from the upper left, like the scene's own light, so
        it reads as a ball rather than a flat disc. */}
      <Box
        sx={(theme) => {
          const page = theme.vars.palette.background.default;
          const tint = theme.vars.palette.primary.light;
          const sphere = (
            highlight: string,
            mid: string,
            limb: string,
          ): string =>
            `radial-gradient(circle at 36% 28%, ${highlight} 0%, ${mid} 52%, ${limb} 100%)`;
          return {
            gridArea: '1 / 1',
            width: SPHERE,
            aspectRatio: '1 / 1',
            borderRadius: '50%',
            backgroundImage: sphere(
              page,
              `color-mix(in srgb, ${tint} 22%, ${page})`,
              `color-mix(in srgb, ${tint} 58%, ${page})`,
            ),
            ...theme.applyStyles('dark', {
              // Lighter than the page, not darker: in dark mode the sphere
              // has to read against near-black, or the glow becomes a ring
              // around a hole.
              backgroundImage: sphere(
                `color-mix(in srgb, ${theme.vars.palette.primary.main} 22%, ${page})`,
                `color-mix(in srgb, ${theme.vars.palette.primary.dark} 38%, ${page})`,
                `color-mix(in srgb, ${theme.vars.palette.primary.dark} 20%, ${page})`,
              ),
            }),
          };
        }}
      />
    </Box>
  );
}
