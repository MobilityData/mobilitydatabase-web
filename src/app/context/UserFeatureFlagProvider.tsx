'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useAuthSession } from '../components/AuthSessionProvider';
import {
  FEATURE_FLAGS_CHANNEL,
  createBroadcastChannel,
} from '../services/channel-service';
import {
  defaultUserFeatureFlags,
  type UserFeatureFlags,
} from '../interface/UserFeatureFlags';

// Evaluated once at module load. False in production, so the Cypress
// exposure useEffect below is a no-op without any per-render window access.
const isCypress =
  typeof window !== 'undefined' &&
  (window as { Cypress?: unknown }).Cypress != null;

interface UserFeatureFlagContextValue {
  flags: UserFeatureFlags;
}

const UserFeatureFlagContext = createContext<UserFeatureFlagContextValue>({
  flags: defaultUserFeatureFlags,
});

interface UserFeatureFlagProviderProps {
  children: ReactNode;
  initialFlags: UserFeatureFlags;
}

/**
 * Client-side user feature flag provider.
 *
 * Holds feature flags in ephemeral React state — not persisted, not in Redux.
 * This avoids cross-session leakage and PersistGate concerns.
 *
 * Lifecycle:
 * - `initialFlags` is the SSR-hydrated value from layout.tsx (read from the
 *   httpOnly cookie server-side). The initial render is always flash-free.
 * - The service layer calls `broadcastExtendedMessage(FEATURE_FLAGS_CHANNEL, ...)`
 *   after writing the cookie, which delivers the flags to this tab and every
 *   other open tab through the channel registered below.
 * - On logout the flags reset to defaults when `isAuthenticated` becomes false.
 */
export function UserFeatureFlagProvider({
  children,
  initialFlags,
}: UserFeatureFlagProviderProps): React.ReactElement {
  const [flags, setFlags] = useState<UserFeatureFlags>(initialFlags);
  const { isAuthReady, isAuthenticated } = useAuthSession();

  // Listen for flag updates from this tab and other tabs through the shared
  // channel-service. Same-tab updates arrive via broadcastExtendedMessage,
  // cross-tab updates via the underlying BroadcastChannel.
  useEffect(() => {
    createBroadcastChannel<UserFeatureFlags>(FEATURE_FLAGS_CHANNEL, setFlags);
  }, []);

  // Expose the live flag values on window for Cypress e2e assertions.
  // Mirrors the window.store pattern in store.ts — test-only, no prod impact.
  useEffect(() => {
    if (!isCypress) return;
    (window as { __featureFlags?: UserFeatureFlags }).__featureFlags = flags;
  }, [flags]);

  useEffect(() => {
    if (!isAuthReady || isAuthenticated) return;
    setFlags({ ...defaultUserFeatureFlags });
  }, [isAuthReady, isAuthenticated]);

  return (
    <UserFeatureFlagContext.Provider value={{ flags }}>
      {children}
    </UserFeatureFlagContext.Provider>
  );
}

/**
 * Returns all user feature flags as a typed map.
 * Each property is resolved from the user's flag list, falling back to the
 * default value defined in defaultUserFeatureFlags.
 *
 * @example
 * const { isNotificationsEnabled } = useUserFeatureFlags();
 */
export function useUserFeatureFlags(): UserFeatureFlags {
  const { flags } = useContext(UserFeatureFlagContext);
  return flags;
}
