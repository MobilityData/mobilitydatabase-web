'use client';

import * as React from 'react';
import ContextProviders from './components/Context';
import { RemoteConfigProvider } from './context/RemoteConfigProvider';
import { type RemoteConfigValues } from './interface/RemoteConfig';

// Look into this provider and see if it's client blocking. Niche provider might be able to isolate for single use
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

interface ProvidersProps {
  children: React.ReactNode;
  remoteConfig: RemoteConfigValues;
}

/// To revisit which providers are needed at this level
export function Providers({
  children,
  remoteConfig,
}: ProvidersProps): React.ReactElement {
  // Start MSW in mock mode to intercept API calls client-side
  React.useEffect(() => {
    if (process.env.NEXT_PUBLIC_API_MOCKING === 'enabled') {
      // Lazy-load the worker to avoid bundling in prod
      import('../mocks/browser')
        .then(async ({ worker }) => await worker.start())
        .catch((err) => {
          console.warn('MSW mock worker failed to start:', err);
        });
    }
  }, []);

  return (
    <ContextProviders>
      <RemoteConfigProvider config={remoteConfig}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          {children}
        </LocalizationProvider>
      </RemoteConfigProvider>
    </ContextProviders>
  );
}
