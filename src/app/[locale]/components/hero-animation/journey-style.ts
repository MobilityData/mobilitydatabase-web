// Tunable sizes and timings for the journey hero's route rendering. Colors
// live in journey-palette (theme-aware); geometry simplification lives in
// scripts/preprocess-montreal-journey.mjs (SIMPLIFY_M).

export const JOURNEY_STYLE = {
  /** Route line widths in CSS pixels (screen space). */
  activeLineWidthPx: 4,
  inactiveLineWidthPx: 2,
  /** Station circles on the active route: diameter and stroke, CSS px. */
  stationSizePx: 7,
  stationStrokePx: 1.5,
  /** The trip's two BIXI docks (stroked circles) and nearby docks (dots). */
  journeyDockSizePx: 8,
  journeyDockStrokePx: 2,
  dockSizePx: 3.5,
  /** Bike leg: dot diameter (CSS px) and spacing along the path (km). */
  bikeDotSizePx: 2.5,
  bikeDotSpacingKm: 0.05,
  /** Soft glow under the active route: full width in km. */
  glowWidthKm: 0.32,
  /** Light pulse along the active route; off under reduced motion. */
  pulse: {
    enabled: true,
    periodSeconds: 8,
    /** Gaussian half-width of the pulse along the route, in km. */
    widthKm: 0.45,
  },
} as const;
