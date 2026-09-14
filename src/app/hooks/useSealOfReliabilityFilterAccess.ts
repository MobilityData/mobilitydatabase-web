import { useAuthSession } from '../components/AuthSessionProvider';
import { useRemoteConfig } from '../context/RemoteConfigProvider';
import { useUserFeatureFlags } from './useUserFeatureFlags';

export interface SealOfReliabilityFilterAccess {
  /** Global Remote Config switch — whether the feature is live at all. */
  isFeatureLive: boolean;
  /**
   * Entitlement is genuinely unknown until the user feature flags resolve —
   * on statically rendered routes they arrive as defaults and are re-fetched
   * client-side. Treat this as neither access nor no-access.
   */
  isPending: boolean;
  /** This specific user is entitled to filter by the Seal of Reliability. */
  hasAccess: boolean;
  /** Entitlement has resolved and this user is not entitled. */
  hasNoAccess: boolean;
}

/**
 * Combines the global `enableSealOfReliability` Remote Config flag with the
 * per-user `isSealFilterEnabled` feature flag, so every
 * consumer (the search filter checkbox, the active-filter chip, and the
 * search fetcher) agrees on whether a given user may filter by the seal.
 */
export function useSealOfReliabilityFilterAccess(): SealOfReliabilityFilterAccess {
  const { config } = useRemoteConfig();
  const { isAuthenticated } = useAuthSession();
  const {
    flags: { isSealFilterEnabled },
    isResolved,
  } = useUserFeatureFlags();

  const isPending = isAuthenticated && !isResolved;
  const hasNoAccess = !isPending && (!isAuthenticated || !isSealFilterEnabled);
  const hasAccess = !isPending && !hasNoAccess;

  return {
    isFeatureLive: config.enableSealOfReliability,
    isPending,
    hasAccess,
    hasNoAccess,
  };
}
