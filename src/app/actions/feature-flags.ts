'use server';

import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { getEnvConfig } from '../utils/config';
import {
  defaultUserFeatureFlags,
  toUserFeatureFlags,
  type FeatureFlag,
  type UserFeatureFlags,
} from '../interface/UserFeatureFlags';

const COOKIE_NAME = 'md_features';

function getSecret(): string {
  const secret = getEnvConfig('NEXT_SESSION_JWT_SECRET');
  if (secret.length < 32) {
    throw new Error(
      'NEXT_SESSION_JWT_SECRET must be set and at least 32 characters long',
    );
  }
  return secret;
}

/**
 * Verifies a signed cookie value. Returns the decoded JSON string on success,
 * or undefined if the signature is invalid or the value is malformed.
 * Uses a constant-time comparison to prevent timing attacks.
 */
function verify(cookie: string): string | undefined {
  try {
    const dot = cookie.indexOf('.');
    if (dot === -1) return undefined;

    const encoded = cookie.slice(0, dot);
    const sigB64 = cookie.slice(dot + 1);

    const secret = getSecret();
    const expectedSigBuffer = crypto
      .createHmac('sha256', secret)
      .update(encoded)
      .digest();

    const sigBuffer = Buffer.from(sigB64, 'base64url');
    if (sigBuffer.length !== expectedSigBuffer.length) return undefined;
    if (!crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) return undefined;

    return Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }
}

/**
 * Reads and verifies the user feature flags from the httpOnly cookie.
 * Returns defaultUserFeatureFlags when the cookie is absent, expired, or invalid.
 *
 * Dual-use:
 * - Called directly from Server Components (e.g. layout.tsx) for SSR hydration.
 */
export async function getServerFlags(): Promise<UserFeatureFlags> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (raw == null) return { ...defaultUserFeatureFlags };

  const json = verify(raw);
  if (json == null) return { ...defaultUserFeatureFlags };

  try {
    return toUserFeatureFlags(JSON.parse(json) as FeatureFlag[]);
  } catch {
    return { ...defaultUserFeatureFlags };
  }
}

