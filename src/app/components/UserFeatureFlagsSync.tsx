'use client';

import { type ReactElement } from 'react';
import { useUserFeatureFlags } from '../hooks/useUserFeatureFlags';

/**
 * Keeps the user feature flags SWR entry warm for the lifetime of the App
 * Router tree, independent of which page is mounted.
 *
 * useUserFeatureFlags() has no provider of its own — every caller shares the
 * same SWR cache entry per uid — but flags should still resolve (and expose
 * their state to Cypress) on pages that never render a consumer, e.g. so a
 * subsequent navigation to a page that does need them doesn't wait on a fresh
 * fetch. Mounting the hook here once, alongside AuthBroadcastChannelSync,
 * covers that case.
 */
export function UserFeatureFlagsSync(): ReactElement | null {
  useUserFeatureFlags();
  return null;
}
