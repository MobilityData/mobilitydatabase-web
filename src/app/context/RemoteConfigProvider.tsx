'use client';

import React, {
  createContext,
  useState,
  useEffect,
  type ReactNode,
  useContext,
} from 'react';
import {
  defaultRemoteConfigValues,
  matchesFeatureFlagBypass,
  type RemoteConfigValues,
} from '../interface/RemoteConfig';
import { useAuthSession } from '../components/AuthSessionProvider';

const RemoteConfigContext = createContext<{
  config: RemoteConfigValues;
}>({
  config: defaultRemoteConfigValues,
});

interface RemoteConfigProviderProps {
  children: ReactNode;
  config: RemoteConfigValues;
}

function applyAdminBypass(config: RemoteConfigValues): RemoteConfigValues {
  const overridden = { ...config };
  for (const key of Object.keys(overridden) as Array<
    keyof RemoteConfigValues
  >) {
    if (typeof overridden[key] === 'boolean') {
      (overridden as Record<string, unknown>)[key] = true;
    }
  }
  return overridden;
}

/**
 * Client-side Remote Config provider that hydrates server-fetched config into React Context.
 * Applies admin bypass for @mobilitydata.org users after client-side auth resolves,
 * which ensures correct flags even on statically generated pages.
 */
export const RemoteConfigProvider = ({
  children,
  config,
}: RemoteConfigProviderProps): React.ReactElement => {
  const { email, isAuthReady } = useAuthSession();
  const [effectiveConfig, setEffectiveConfig] = useState(config);

  useEffect(() => {
    if (!isAuthReady) return;
    setEffectiveConfig(
      matchesFeatureFlagBypass(email, config.featureFlagBypass)
        ? applyAdminBypass(config)
        : config,
    );
  }, [email, isAuthReady, config]);

  return (
    <RemoteConfigContext.Provider value={{ config: effectiveConfig }}>
      {children}
    </RemoteConfigContext.Provider>
  );
};

/**
 * Hook to access Remote Config values from any client component.
 */
export const useRemoteConfig = (): {
  config: RemoteConfigValues;
} => useContext(RemoteConfigContext);
