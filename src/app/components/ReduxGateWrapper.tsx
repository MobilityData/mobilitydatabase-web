'use client';

// TODO: Once the [...slug] catch-all route is removed, replace this wrapper
// with a (store) route group layout that provides PersistGate at the layout level.
import { Suspense } from 'react';
import { PersistGate } from 'redux-persist/integration/react';
import { persistor } from '../store/store';
import { CircularProgress, Box } from '@mui/material';

export function ReduxGateWrapper({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <PersistGate
      loading={
        <Box display='flex' justifyContent='center' mt={8}>
          <CircularProgress />
        </Box>
      }
      persistor={persistor}
    >
      {/* Suspense is required for any child that calls useSearchParams(). */}
      <Suspense
        fallback={
          <Box display='flex' justifyContent='center' mt={8}>
            <CircularProgress />
          </Box>
        }
      >
        {children}
      </Suspense>
    </PersistGate>
  );
}
