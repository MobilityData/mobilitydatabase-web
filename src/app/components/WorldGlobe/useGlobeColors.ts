import { useColorScheme } from '@mui/material/styles';
import { useMemo } from 'react';
import { type GlobeColors, resolveGlobeColors } from './globe-colors';

export function useGlobeColors(): GlobeColors {
  const { mode, systemMode } = useColorScheme();
  const isDark = (mode === 'system' ? systemMode : mode) === 'dark';
  return useMemo(() => resolveGlobeColors(isDark), [isDark]);
}
