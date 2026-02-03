import 'server-only';
import { getAuth } from 'firebase-admin/auth';
import { getEnvConfig, nonEmpty } from './config';
import { getFirebaseAdminApp } from '../../lib/firebase-admin';

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

let cached: CachedToken | undefined;
function now(): number {
  return Date.now();
}

async function exchangeCustomTokenForIdToken(
  customToken: string,
): Promise<{ idToken: string; expiresInSec?: number }> {
  // Accept multiple env var names for dev/prod convenience
  const apiKey =
    nonEmpty(getEnvConfig('GCIP_API_KEY')) ??
    nonEmpty(getEnvConfig('FIREBASE_API_KEY')) ??
    nonEmpty(getEnvConfig('NEXT_PUBLIC_FIREBASE_API_KEY'));
  if (apiKey == undefined) {
    throw new Error('GCIP/Firebase API key is not set');
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`;
  const body: Record<string, unknown> = {
    token: customToken,
    returnSecureToken: true,
  };

  const tenantId =
    nonEmpty(getEnvConfig('GCIP_TENANT_ID')) ??
    nonEmpty(getEnvConfig('NEXT_PUBLIC_GCIP_TENANT_ID'));
  if (tenantId != undefined) {
    body.tenantId = tenantId;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `GCIP signInWithCustomToken failed: ${resp.status} ${text}`,
    );
  }
  const data = (await resp.json()) as {
    idToken: string;
    expiresIn?: string; // seconds as string
  };
  const expiresInSec = data.expiresIn ? Number(data.expiresIn) : undefined;
  return { idToken: data.idToken, expiresInSec };
}

/**
 * Returns a GCIP ID token suitable for calling an IAP-protected API configured with Identity Platform.
 * Caches the token until near expiry to minimize exchanges.
 */
export async function getGcipIdToken(): Promise<string> {
  // Use cached token if still valid for at least 60 seconds
  if (cached != undefined && cached.expiresAt - now() > 60_000) {
    return cached.token;
  }

  // Ensure Admin app is initialized centrally
  const adminApp = getFirebaseAdminApp();
  const serviceUid =
    nonEmpty(getEnvConfig('GCIP_SERVICE_UID')) ??
    nonEmpty(getEnvConfig('NEXT_GCIP_SERVICE_UID')) ??
    'iap-service-caller';
  const customToken = await getAuth(adminApp).createCustomToken(serviceUid, {
    service: true,
  });
  const { idToken, expiresInSec } =
    await exchangeCustomTokenForIdToken(customToken);
  // Default TTL ~ 55 minutes if expiresIn not present
  const ttlMs = (expiresInSec ?? 3600) * 1000;
  const safetyMs = 300_000; // refresh 5 minutes early
  cached = {
    token: idToken,
    expiresAt: now() + ttlMs - safetyMs,
  };
  return idToken;
}

// export interface EndUserIdentity {
//   subject?: string;
//   email?: string;
// }

/**
 * Returns a GCIP ID token suitable for IAP-protected API calls.
 * This avoids trusting client tokens and keeps credentials server-side only.
 */
export async function getSSRAccessToken(): Promise<string> {
  return await getGcipIdToken();
}
