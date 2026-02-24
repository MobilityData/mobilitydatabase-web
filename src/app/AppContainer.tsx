'use client';

import * as React from 'react';
import { Box, LinearProgress } from '@mui/material';
import type ContextProviderProps from './interface/ContextProviderProps';
import { usePathname } from 'next/navigation';
import { selectLoadingApp } from './store/selectors';
import { useSelector } from 'react-redux';

const AppContainer: React.FC<ContextProviderProps> = ({ children }) => {
  const isAppLoading = useSelector(selectLoadingApp);
  const pathname = usePathname();

  React.useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return (
    <>
      <Box id='app-main-container'>
        {isAppLoading ? (
          <Box sx={{ width: '100%', mt: '-31px' }}>
            <LinearProgress />
          </Box>
        ) : (
          <>{children}</>
        )}
      </Box>
    </>
  );
};

export default AppContainer;
