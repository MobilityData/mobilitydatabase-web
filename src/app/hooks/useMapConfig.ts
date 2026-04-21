'use client';

import { useColorScheme } from '@mui/material/styles';
import { mapConfig, type MapConfig } from '../Theme';

/**
 * Returns the map configuration resolved for the current color scheme.
 * Map canvas components (MapLibre, deck.gl) need actual color values,
 * not CSS variable references, so this hook provides resolved values.
 */
export function useMapConfig(): MapConfig {
  const { mode, systemMode } = useColorScheme();
  const resolvedMode = (mode === 'system' ? systemMode : mode) ?? 'light';
  return mapConfig[resolvedMode === 'dark' ? 'dark' : 'light'];
}
