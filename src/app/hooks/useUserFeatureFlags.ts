import { useEffect } from 'react';
import useSWR from 'swr';
import { useAuthSession } from '../components/AuthSessionProvider';
import {
  USER_FEATURE_FLAGS_SWR_KEY,
  fetchUserFeatureFlags,
} from '../services/user-feature-flag-service';
import {
  defaultUserFeatureFlags,
  type UserFeatureFlags,
} from '../interface/UserFeatureFlags';

// Evaluated once at module load. False in production, so the Cypress
// exposure effect below is a no-op without any per-render window access.
const isCypress =
  typeof window !== 'undefined' &&
  (window as { Cypress?: unknown }).Cypress != null;

export interface UseUserFeatureFlagsResult {
  flags: UserFeatureFlags;
  /**
   * False while entitlement is genuinely unknown — auth has not resolved yet, or
   * it has and the flags are still in flight. The flag values are placeholders
   * until this is true.
   */
  isResolved: boolean;
}

/**
 * Returns the signed-in user's feature flags, falling back to
 * defaultUserFeatureFlags for anything missing, together with whether those
 * values have been resolved yet.
 *
 * Flags are resolved entirely on the client, from the user service, keyed by the
 * live Firebase uid. There is deliberately no server-rendered seed: reading a
 * per-user cookie during render cannot work on statically rendered routes (Next
 * hands those an empty cookie store, so every read looks like a logged-out
 * user), and a value read in the root layout would go stale anyway, since
 * layouts are not re-rendered on client-side navigation.
 *
 * Every call shares one SWR cache entry per uid, so calling this from multiple
 * components triggers a single request rather than one per caller:
 * - The cache key includes the uid, so an identity change is a different key
 *   rather than a cache that must be invalidated. A signed-in user can never be
 *   shown flags resolved for someone else, and cross-tab login needs no
 *   coordination — this tab's Firebase listener changes the uid, and the new key
 *   fetches on its own.
 * - The entry is kept for the lifetime of the document rather than revalidated
 *   on mount.
 * - Refreshes come from a throttled revalidate on window focus, and from
 *   `revalidateUserFeatureFlags` when the auth session renews its token.
 *
 * While `isResolved` is false the flags are placeholders, so anything gating
 * visible UI should render a pending state rather than the not-entitled one.
 *
 * @example
 * const { flags, isResolved } = useUserFeatureFlags();
 */
export function useUserFeatureFlags(): UseUserFeatureFlagsResult {
  const { isAuthResolved, isAuthenticated, uid } = useAuthSession();

  // Null key = no fetch. Anonymous and signed-out users are not entitled to
  // anything, so defaults are the answer rather than a placeholder.
  const cacheKey =
    isAuthenticated && uid != null ? [USER_FEATURE_FLAGS_SWR_KEY, uid] : null;

  const { data, error } = useSWR(cacheKey, fetchUserFeatureFlags, {
    revalidateIfStale: false,
    revalidateOnFocus: true,
    focusThrottleInterval: 60_000,
    // Never carry one identity's flags into another's pending state.
    keepPreviousData: false,
  });

  const flags = data ?? defaultUserFeatureFlags;
  // A failed fetch settles as "resolved" with the safe defaults rather than
  // leaving consumers in a pending state forever.
  const isResolved =
    isAuthResolved &&
    (!isAuthenticated || data !== undefined || error !== undefined);

  // Expose the live values on window for Cypress e2e assertions.
  // Mirrors the window.store pattern in store.ts — test-only, no prod impact.
  useEffect(() => {
    if (!isCypress) return;
    const testWindow = window as {
      __featureFlags?: UserFeatureFlags;
      __featureFlagsResolved?: boolean;
    };
    testWindow.__featureFlags = flags;
    testWindow.__featureFlagsResolved = isResolved;
  }, [flags, isResolved]);

  return { flags, isResolved };
}
