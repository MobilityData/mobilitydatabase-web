'use client';

import { createContext, useState, useMemo, useContext, useEffect } from 'react';
import {
  ThemeProvider as MuiThemeProvider,
  CssBaseline,
  useMediaQuery,
} from '@mui/material';
import { getTheme, ThemeModeEnum } from '../Theme';
import type ContextProviderProps from '../interface/ContextProviderProps';

// TODO: Revisit theme for best SSR practices

const ThemeContext = createContext({
  mode: ThemeModeEnum.light,
  toggleTheme: () => {},
});

export const ThemeProvider: React.FC<ContextProviderProps> = ({ children }) => {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');

  // Initialize with system preference for SSR, then check localStorage on client
  const [mode, setMode] = useState<ThemeModeEnum>(
    prefersDarkMode ? ThemeModeEnum.dark : ThemeModeEnum.light,
  );

  // Load theme from localStorage only on client side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (
        savedTheme != null &&
        savedTheme !== '' &&
        Object.values(ThemeModeEnum).includes(savedTheme as ThemeModeEnum)
      ) {
        setMode(savedTheme as ThemeModeEnum);
      }
    }
  }, []);

  const toggleTheme = (): void => {
    const newMode =
      mode === ThemeModeEnum.light ? ThemeModeEnum.dark : ThemeModeEnum.light;
    setMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', newMode);
    }
  };

  const theme = useMemo(() => getTheme(mode), [mode]);

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};

export const useTheme = (): { mode: ThemeModeEnum; toggleTheme: () => void } =>
  useContext(ThemeContext);
