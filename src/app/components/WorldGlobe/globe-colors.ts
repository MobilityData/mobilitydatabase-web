import { darkPalette, lightPalette } from '../../Theme';

// Three.js needs concrete colour values rather than CSS variables, so the
// globe resolves its colours from the theme's raw palettes (the same
// approach as mapConfig in Theme.ts).
export interface GlobeColors {
  background: string;
  ocean: string;
  /** Countries with no feeds. */
  inactive: string;
  /** Shade for the smallest feed count; `high` is the largest. */
  low: string;
  high: string;
  selected: string;
  border: string;
  star: string;
  glow: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixHex(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return `#${a
    .map((v, i) =>
      Math.round(v + (b[i] - v) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export function resolveGlobeColors(isDark: boolean): GlobeColors {
  if (isDark) {
    const p = darkPalette;
    return {
      background: p.background.default,
      ocean: mixHex(p.background.default, p.primary.dark, 0.22),
      inactive: mixHex(p.background.paper, p.primary.main, 0.12),
      low: p.primary.dark,
      high: p.primary.main,
      selected: p.text.primary,
      border: mixHex(p.background.default, p.primary.main, 0.55),
      star: p.primary.main,
      glow: mixHex(p.background.default, p.primary.dark, 0.45),
    };
  }
  const p = lightPalette;
  return {
    background: p.background.default,
    ocean: mixHex(p.background.default, p.primary.light, 0.35),
    inactive: mixHex(p.background.default, p.primary.light, 0.12),
    low: p.primary.light,
    high: p.primary.dark,
    selected: p.text.lightContrast,
    border: p.primary.light,
    star: p.secondary.main,
    glow: p.primary.light,
  };
}
