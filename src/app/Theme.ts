'use client';

import { type PaletteColor, createTheme } from '@mui/material/styles';
import type {} from '@mui/material/themeCssVarsAugmentation';
import { type Property } from 'csstype';

declare module '@mui/material/styles' {
  interface Palette {
    boxShadow: string;
  }
  interface PaletteOptions {
    boxShadow?: string;
  }

  interface TypeText {
    lightContrast?: string;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    sectionTitle: true;
  }
}

declare module '@mui/material/styles/createMixins' {
  // Allow for custom mixins to be added
  interface Mixins {
    code: Partial<PaletteColor> & {
      command: { fontWeight: Property.FontWeight; color: string };
    };
  }
}

export enum ThemeModeEnum {
  light = 'light',
  dark = 'dark',
}

export const fontFamily = {
  // "Twemoji Country Flags" is loaded via a polyfill (polyfillCountryFlagEmojis in providers.tsx)
  // and uses unicode-range: U+1F1E6-1F1FF, so it only applies to flag emoji code points
  // and does not affect any other text rendering.
  primary: '"Twemoji Country Flags", var(--font-mulish)',
  secondary: 'var(--font-ibm-plex-mono)',
};

const lightPalette = {
  primary: {
    main: '#3959fa',
    dark: '#002eea',
    light: '#989ffc',
    contrastText: '#f9faff',
  },
  secondary: {
    main: '#5E56F7',
    dark: '#2B1EB8',
    light: '#D7D4FF',
    contrastText: '#FFFFFF',
  },
  info: {
    main: '#01579B',
  },
  warning: {
    main: '#E65100',
  },
  background: {
    default: '#ffffff',
    paper: '#F8F5F5',
  },
  text: {
    primary: '#474747',
    secondary: 'rgba(71, 71, 71, 0.8)',
    disabled: 'rgba(0,0,0,0.3)',
    lightContrast: '#1D1717',
  },
  divider: 'rgba(0, 0, 0, 0.23)',
  boxShadow: '0px 1px 4px 2px rgba(0,0,0,0.2)',
};

const darkPalette = {
  primary: {
    main: '#96a1ff',
    dark: '#4a5dff',
    light: '#e7e8ff',
    contrastText: '#1D1717',
  },
  secondary: {
    light: '#C4CCFF',
    main: '#5E6DD9',
    dark: '#3846A6',
    contrastText: '#FFFFFF',
  },
  info: {
    main: '#4FC3F7',
  },
  warning: {
    main: '#FFB74D',
  },
  background: {
    default: '#121212',
    paper: '#1E1E1E',
  },
  text: {
    primary: '#E3E3E3',
    secondary: 'rgba(255, 255, 255, 0.7)',
    disabled: 'rgba(255, 255, 255, 0.3)',
    lightContrast: '#1D1717',
  },
  divider: 'rgba(255, 255, 255, 0.23)',
  boxShadow: '0px 1px 4px 2px rgba(0,0,0,0.6)',
};

/**
 * Map configuration per color scheme.
 * Extracted from the theme because map tile URLs and canvas colors
 * need resolved JS values (not CSS variable references).
 * Use with `useColorScheme()` to pick the right config.
 */
export const mapConfig = {
  light: {
    basemapTileUrl:
      'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    basemapTileOverallColor: '#f6f6f6',
    routeColor: lightPalette.background.default,
    routeTextColor: lightPalette.text.primary,
    textPrimary: lightPalette.text.primary,
    backgroundPaper: lightPalette.background.paper,
    primaryMain: lightPalette.primary.main,
  },
  dark: {
    basemapTileUrl:
      'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    basemapTileOverallColor: '#0d0d0d',
    routeColor: darkPalette.background.default,
    routeTextColor: darkPalette.text.primary,
    textPrimary: darkPalette.text.primary,
    backgroundPaper: darkPalette.background.paper,
    primaryMain: darkPalette.primary.main,
  },
} as const;

export type MapConfig = (typeof mapConfig)[keyof typeof mapConfig];

export const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: 'class',
  },
  colorSchemes: {
    light: {
      palette: lightPalette,
    },
    dark: {
      palette: darkPalette,
    },
  },
  mixins: {
    code: {
      contrastText: '#f1fa8c',
      command: {
        fontWeight: 'bold',
        color: '#ff79c6',
      },
    },
  },
  typography: {
    fontFamily: fontFamily.primary,
  },
  components: {
    MuiInputAdornment: {
      styleOverrides: {
        root: {
          color: 'inherit',
        },
      },
    },
    MuiFormLabel: {
      styleOverrides: {
        root: {
          color: 'var(--mui-palette-text-primary)',
          fontWeight: 'bold',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '&.md-small-input': {
            input: { paddingTop: '7px', paddingBottom: '7px' },
          },
          '.MuiOutlinedInput-root fieldset': {
            borderColor: 'var(--mui-palette-divider)',
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          '.MuiSelect-select': { paddingTop: '7px', paddingBottom: '7px' },
          '.MuiSvgIcon-root': { color: 'var(--mui-palette-text-primary)' },
          '&.MuiInputBase-root fieldset': {
            borderColor: 'var(--mui-palette-divider)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          textTransform: 'none' as const,
          boxShadow: 'none',
          fontFamily: fontFamily.secondary,
          boxSizing: 'border-box' as const,
          '&.MuiButton-contained': {
            border: '2px solid transparent',
            color: 'var(--mui-palette-background-default)',
            '&.Mui-disabled': {
              backgroundColor: 'var(--mui-palette-text-disabled)',
            },
          },
          '&.MuiButton-containedPrimary:hover': {
            boxShadow: 'none',
            backgroundColor: 'transparent',
            border: '2px solid var(--mui-palette-primary-main)',
            color: 'var(--mui-palette-primary-main)',
          },
          '&.MuiButton-outlinedPrimary': {
            border: '2px solid var(--mui-palette-primary-main)',
            padding: '6px 16px',
          },
          '&.MuiButton-outlinedPrimary:hover': {
            backgroundColor: 'var(--mui-palette-primary-main)',
            color: 'var(--mui-palette-primary-contrastText)',
            ...theme.applyStyles('dark', {
              color: 'var(--mui-palette-background-default)',
            }),
          },
          '&.MuiButton-text.inline': {
            fontFamily: fontFamily.primary,
            fontSize: 'inherit',
            padding: '0 8px',
            lineHeight: 'normal',
            verticalAlign: 'baseline',
            '&.line-start': {
              paddingLeft: 0,
            },
            '.MuiButton-endIcon': {
              marginRight: 0,
              svg: {
                color: 'inherit',
              },
            },
          },
        }),
      },
    },
    MuiTypography: {
      variants: [
        {
          props: { variant: 'sectionTitle' },
          style: {
            color: 'var(--mui-palette-primary-main)',
            fontWeight: 'bold',
            fontSize: '1.5rem',
            marginBottom: '0.5rem',
            marginTop: '1rem',
          },
        },
      ],
      styleOverrides: {
        h1: {
          fontWeight: 700,
          color: 'var(--mui-palette-primary-main)',
          fontSize: '2.125rem', // h4 size
        },
      },
    },
  },
});
