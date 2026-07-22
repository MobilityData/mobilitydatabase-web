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
      // Writing through a union key requires widening to unknown — TypeScript
      // computes the required type as the intersection of all property types,
      // which collapses to never for mixed-type interfaces. value is unknown
      // in the schema; consumers receive the fully-typed UserFeatureFlags object.
      (result as Record<UserFeatureFlagId, unknown>)[
        flag.id as UserFeatureFlagId
      ] = flag.value;
    }
  }
  return result;
}
