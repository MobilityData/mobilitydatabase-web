'use client';

import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import { theme, ThemeModeEnum } from '../Theme';
import type ContextProviderProps from '../interface/ContextProviderProps';

export const ThemeProvider: React.FC<ContextProviderProps> = ({ children }) => {
  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {children}
    </MuiThemeProvider>
  );
};

/**
 * Hook to access the current color mode and toggle between light/dark.
 * Must be used within a component rendered inside `<ThemeProvider>`.
 * Delegates to MUI's built-in `useColorScheme` which handles
 * system preference detection and localStorage persistence.
 */
export const useTheme = (): {
  mode: ThemeModeEnum;
  toggleTheme: () => void;
} => {
  const { mode, setMode, systemMode } = useColorScheme();
  const resolvedMode = (mode === 'system' ? systemMode : mode) ?? 'light';
  const themeMode =
    resolvedMode === 'dark' ? ThemeModeEnum.dark : ThemeModeEnum.light;
  const toggleTheme = (): void => {
    setMode(resolvedMode === 'dark' ? 'light' : 'dark');
  };
  return { mode: themeMode, toggleTheme };
};
