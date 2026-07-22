import type { components } from '../services/user-service-api-types';

/** Raw feature flag shape returned by the user service API. */
export type FeatureFlag = components['schemas']['FeatureFlag'];

/**
 * Typed map of all known user feature flags.
 * Add new flags here — defaultUserFeatureFlags and UserFeatureFlagId update automatically.
 */
export interface UserFeatureFlags {
  /** Enable feed subscription / notifications UI */
  isNotificationsEnabled: boolean;
  /** Enable the Seal of Reliability filter in the feeds search */
  isSealOfReliabilityFilterEnabled: boolean;
}

/** Default values returned when the cookie is absent or a flag is not set for the user. */
export const defaultUserFeatureFlags: UserFeatureFlags = {
  isNotificationsEnabled: false,
  isSealOfReliabilityFilterEnabled: false,
};

/** Union of all known feature flag IDs — derived from UserFeatureFlags. */
export type UserFeatureFlagId = keyof UserFeatureFlags;

/**
 * Merges a FeatureFlag[] array from the API into the typed UserFeatureFlags map.
 * Unknown flag IDs (not in defaultUserFeatureFlags) are ignored.
 * Missing flags fall back to their default value.
 */
export function toUserFeatureFlags(apiFlags: FeatureFlag[]): UserFeatureFlags {
  const result: UserFeatureFlags = { ...defaultUserFeatureFlags };
  for (const flag of apiFlags) {
    if (flag.id in result) {
      (result as unknown as Record<string, unknown>)[flag.id] = flag.value;
    }
  }
  return result;
}
