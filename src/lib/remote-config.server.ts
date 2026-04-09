import 'server-only';

import { cache } from 'react';
import { unstable_cache, revalidateTag } from 'next/cache';
import { getRemoteConfig } from 'firebase-admin/remote-config';
import { getFirebaseAdminApp } from './firebase-admin';
import { getEnvConfig } from '../app/utils/config';
import {
  defaultRemoteConfigValues,
  matchesFeatureFlagBypass,
  type RemoteConfigValues,
} from '../app/interface/RemoteConfig';
import { getCurrentUserFromCookie } from '../app/utils/auth-server';

/**
 * Cache duration for Remote Config fetches (in seconds).
 * - Development: 5 minutes (300 seconds)
 * - Production: 1 hour (3600 seconds)
 */
const CACHE_DURATION_SECONDS =
  process.env.NODE_ENV === 'development' ? 300 : 3600;

/**
 * Parse a Remote Config parameter value into the appropriate type.
 */
function parseConfigValue(
  value: string,
  defaultValue: boolean | number | string,
): boolean | number | string {
  const valueLower = value.toLowerCase();

  // Boolean
  if (valueLower === 'true' || valueLower === 'false') {
    return valueLower === 'true';
  }

  // Number
  if (!isNaN(Number(value)) && value.trim() !== '') {
    return Number(value);
  }

  // Default to string
  return value;
}

/**
 * Fetch Remote Config from Firebase Admin SDK.
 * Returns the template parameters merged with defaults.
 */
async function fetchRemoteConfigFromFirebase(): Promise<RemoteConfigValues> {
  // Dev/mock bypass: return defaults without touching Admin SDK
  const isMock =
    getEnvConfig('NEXT_PUBLIC_API_MOCKING') === 'enabled' ||
    getEnvConfig('LOCAL_DEV_NO_ADMIN') === '1';
  if (isMock) {
    return defaultRemoteConfigValues;
  }
  const app = getFirebaseAdminApp();
  const remoteConfigAdmin = getRemoteConfig(app);

  try {
    const template = await remoteConfigAdmin.getTemplate();
    const fetchedConfig = { ...defaultRemoteConfigValues };

    // Process each parameter from the template
    for (const [key, parameter] of Object.entries(template.parameters)) {
      if (
        key in defaultRemoteConfigValues &&
        parameter.defaultValue != undefined
      ) {
        const defaultVal = parameter.defaultValue as { value?: string };
        if (defaultVal.value !== undefined) {
          const parsedValue = parseConfigValue(
            defaultVal.value,
            defaultRemoteConfigValues[key as keyof RemoteConfigValues],
          );
          (fetchedConfig as Record<string, unknown>)[key] = parsedValue;
        }
      }
    }

    return fetchedConfig;
  } catch (error) {
    console.error('Failed to fetch Remote Config from Firebase:', error);
    // Return defaults on error
    return defaultRemoteConfigValues;
  }
}

/**
 * Fetch Remote Config from Firebase, backed by Next.js Data Cache.
 * On Vercel, this cache is shared across all function instances and persists
 * across invocations, unlike in-memory caching.
 * Tagged with 'remote-config' for on-demand revalidation via revalidateTag().
 */
const fetchRemoteConfigCached = unstable_cache(
  fetchRemoteConfigFromFirebase,
  ['remote-config'],
  { revalidate: CACHE_DURATION_SECONDS, tags: ['remote-config'] },
);

/**
 * Get Remote Config values with server-side caching.
 * This function is safe to call from Server Components and Server Actions.
 *
 * Caching strategy:
 * - react cache() deduplicates calls within the same request (e.g., layout + page)
 * - unstable_cache persists across requests and Vercel function instances
 * - Cache revalidates after CACHE_DURATION_SECONDS
 * - On error, returns defaults
 */
export const getRemoteConfigValues = cache(
  async (): Promise<RemoteConfigValues> => {
    // Dev/mock bypass: skip cache entirely
    const isMock =
      getEnvConfig('NEXT_PUBLIC_API_MOCKING') === 'enabled' ||
      getEnvConfig('LOCAL_DEV_NO_ADMIN') === '1';
    if (isMock) {
      return defaultRemoteConfigValues;
    }

    try {
      return await fetchRemoteConfigCached();
    } catch (error) {
      console.error('Error fetching Remote Config:', error);
      return defaultRemoteConfigValues;
    }
  },
);

/**
 * Force refresh the Remote Config cache.
 * Useful for admin operations or webhooks that need immediate updates.
 */
export async function refreshRemoteConfig(): Promise<RemoteConfigValues> {
  revalidateTag('remote-config', 'max');
  return await getRemoteConfigValues();
}

/**
 * Returns a copy of the config with all boolean flags set to `true`.
 * Used to give specific users ex: internal @mobilitydata.org users access to all features.
 * Exported for use in server components that receive isAdmin as a prop.
 */
export function applyAdminBypass(
  config: RemoteConfigValues,
): RemoteConfigValues {
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
 * Get Remote Config values for a specific user.
 * Specific users ex: @mobilitydata.org users receive all boolean feature flags enabled.
 */
export async function getRemoteConfigValuesForUser(
  email?: string,
): Promise<RemoteConfigValues> {
  const config = await getRemoteConfigValues();
  if (matchesFeatureFlagBypass(email, config.featureFlagBypass)) {
    return applyAdminBypass(config);
  }
  return config;
}

/**
 * Get Remote Config values for the current request's authenticated user.
 * Reads the session cookie internally — no prop threading required.
 * Safe to call from any server component; cookies() is request-scoped.
 */
export async function getUserRemoteConfigValues(): Promise<RemoteConfigValues> {
  const [config, currentUser] = await Promise.all([
    getRemoteConfigValues(),
    getCurrentUserFromCookie(),
  ]);
  return matchesFeatureFlagBypass(currentUser?.email, config.featureFlagBypass)
    ? applyAdminBypass(config)
    : config;
}
