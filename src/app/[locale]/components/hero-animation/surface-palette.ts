import { theme, ThemeModeEnum } from '../../../Theme';

// WebGL needs concrete colors, not CSS variables, so resolve them from the
// MUI color schemes (same approach as `mapConfig` / `useMapConfig`).

/** Number of color stops in the height ramp (matches the shader). */
export const RAMP_STOPS = 7;

export interface SurfacePalette {
  /** RAMP_STOPS colors from low to high accessibility. */
  ramp: string[];
  /**
   * Two hues the background variant drifts between across the hills,
   * layered on top of the height ramp.
   */
  accents: [string, string];
  rim: string;
  contour: string;
  transitLine: string;
  station: string;
  opportunity: string;
  axis: string;
  /** Any CSS color; used for canvas-drawn axis labels. */
  label: string;
}

export function getSurfacePalette(mode: ThemeModeEnum): SurfacePalette {
  const scheme = mode === ThemeModeEnum.dark ? 'dark' : 'light';
  const palette = theme.colorSchemes[scheme]?.palette ?? theme.palette;
  const { primary, secondary, text, warning, common } = palette;
  // The dark scheme's info color is the one bright cyan in the theme; it
  // reads well as an accent in both schemes.
  const cyan = theme.colorSchemes.dark?.palette.info.main ?? palette.info.main;

  // Dark to light, interleaving the violet secondary with the blue primary
  // so the ramp shifts hue as well as lightness.
  const darkToLight = [
    secondary.dark,
    primary.dark,
    secondary.main,
    primary.main,
    primary.light,
    secondary.light,
    common.white,
  ];
  // Dark mode: dark base rising to white peaks. Light mode flips it so the
  // base blends into the white page and peaks take the deepest brand color.
  const ramp = scheme === 'dark' ? darkToLight : [...darkToLight].reverse();

  return {
    ramp,
    accents: [cyan, secondary.main],
    rim: primary.main,
    contour: text.primary,
    transitLine: text.primary,
    station: text.primary,
    opportunity: warning.main,
    axis: text.primary,
    label: text.secondary,
  };
}
