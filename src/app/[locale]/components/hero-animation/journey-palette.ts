import { Color } from 'three';
import { theme, ThemeModeEnum } from '../../../Theme';
import { type BasemapColors } from './journey-basemap';
import { type PinPalette } from './journey-pins';

// WebGL and canvas need concrete colors, so resolve them from the MUI color
// schemes (same approach as surface-palette). Metro line colors come from the
// GTFS feed itself (route_color), not from here.

export interface JourneyPalette {
  basemap: BasemapColors;
  /** Page background: untraveled journey segments blend toward it. */
  paper: string;
  /** How far an untraveled journey segment blends toward `paper`. */
  untraveledMix: number;
  /** Lines and stations off the journey: blend toward `paper`, opacity. */
  backgroundMix: number;
  backgroundOpacity: number;
  shadow: string;
  shadowOpacity: number;
  stationFill: string;
  bike: string;
  dock: string;
  dockOpacity: number;
  pins: PinPalette;
}

/** Canvas can't resolve CSS variables, so read the font's real name. */
function resolveFont(variable: string, fallback: string): string {
  const family =
    typeof document === 'undefined'
      ? ''
      : getComputedStyle(document.body).getPropertyValue(variable).trim();
  return family ? `${family}, ${fallback}` : fallback;
}

/** `hex` blended toward `toward` by `amount`, as a hex string. */
function mixHex(hex: string, toward: string, amount: number): string {
  return `#${new Color(hex).lerp(new Color(toward), amount).getHexString()}`;
}

/** Share of grey in the alert pin: it should read, not shout. */
const ALERT_DESATURATION = 0.45;

export function getJourneyPalette(mode: ThemeModeEnum): JourneyPalette {
  const scheme = mode === ThemeModeEnum.dark ? 'dark' : 'light';
  const palette = theme.colorSchemes[scheme]?.palette ?? theme.palette;
  const { primary, secondary, text, background, error, divider } = palette;
  const dark = scheme === 'dark';
  const paper = dark ? background.paper : '#ffffff';

  return {
    basemap: dark
      ? {
          low: background.default,
          high: secondary.dark,
          lumRange: [0.04, 0.55],
          tint: 0.85,
          grid: primary.main,
          gridStrength: 0.07,
        }
      : {
          low: secondary.dark,
          high: background.default,
          lumRange: [0.35, 0.98],
          tint: 0.8,
          grid: primary.main,
          gridStrength: 0.06,
        },
    paper: background.default,
    untraveledMix: dark ? 0.45 : 0.5,
    backgroundMix: dark ? 0.45 : 0.4,
    backgroundOpacity: dark ? 0.5 : 0.5,
    shadow: dark ? '#000000' : secondary.dark,
    shadowOpacity: dark ? 0.32 : 0.13,
    stationFill: dark ? text.primary : '#ffffff',
    bike: primary.main,
    dock: primary.main,
    dockOpacity: dark ? 0.55 : 0.45,
    pins: {
      pin: primary.main,
      alert: mixHex(
        error.main,
        dark ? '#9e9e9e' : '#8a8a8a',
        ALERT_DESATURATION,
      ),
      alertActive: error.main,
      traveler: primary.dark,
      badgeBackground: paper,
      badgeText: text.primary,
      badgeMuted: text.secondary,
      badgeTrack: divider,
      font: resolveFont('--font-mulish', 'sans-serif'),
    },
  };
}
