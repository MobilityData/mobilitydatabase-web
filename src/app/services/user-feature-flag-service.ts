import { mutate } from 'swr';
import {
  defaultUserFeatureFlags,
  toUserFeatureFlags,
  type FeatureFlag,
  type UserFeatureFlags,
} from '../interface/UserFeatureFlags';
import { retrieveUserInformation } from './profile-service';

/**
 * SWR cache key prefix for the current user's feature flags.
 *
 * Always pair it with the Firebase uid — `[USER_FEATURE_FLAGS_SWR_KEY, uid]` —
 * so an identity change lands on a different key instead of needing explicit
 * invalidation. That makes it structurally impossible to hand one user the
 * flags resolved for another.
 */
export const USER_FEATURE_FLAGS_SWR_KEY = 'user-feature-flags';

/**
 * Fetches the signed-in user's feature flags from the user service.
 *
 * Authenticated with the caller's Firebase ID token (see getUserAccessToken),
 * not a cookie, so it does not depend on `md_session` having been established
 * yet and is safe to call as soon as Firebase reports a user.
 *
 * Returns defaults when the profile has no flags, so callers always receive a
 * complete map. Rejections propagate for SWR to expose as `error`.
 */
export const fetchUserFeatureFlags = async (): Promise<UserFeatureFlags> => {
  const userData = await retrieveUserInformation();
  if (userData == null) return { ...defaultUserFeatureFlags };
  return toUserFeatureFlags(userData.features);
};

/**
 * Re-fetches the given user's feature flags, updating every mounted consumer.
 *
 * Exists so callers can trigger a refresh without importing the cache key or
 * knowing that SWR is involved — the auth session uses it to keep entitlements
 * in step with token renewals. An identity *change* needs no call: the uid is
 * part of the key, so the new identity resolves on its own.
 */
export const revalidateUserFeatureFlags = async (
  uid: string,
): Promise<void> => {
  await mutate([USER_FEATURE_FLAGS_SWR_KEY, uid]);
};

/**
 * Seeds the SWR cache for the given user with flags already fetched elsewhere
 * (e.g. the login/signup sagas' own `GET /v1/user` call), instead of letting
 * `useUserFeatureFlags` fire a redundant duplicate request for data the
 * caller already has. Passing `revalidate: false` accepts the seeded value as
 * fresh rather than immediately re-fetching to confirm it.
 */
export const setUserFeatureFlagsCache = (
  uid: string,
  apiFlags: FeatureFlag[],
): void => {
  void mutate([USER_FEATURE_FLAGS_SWR_KEY, uid], toUserFeatureFlags(apiFlags), {
    revalidate: false,
  });
};
