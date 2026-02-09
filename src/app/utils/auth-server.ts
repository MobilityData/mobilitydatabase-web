import 'server-only';
import { cookies } from 'next/headers';
import { getAuth } from 'firebase-admin/auth';
import { getEnvConfig, nonEmpty } from './config';
import { getFirebaseAdminApp } from '../../lib/firebase-admin';
import { verifySessionToken, type SessionPayload } from './session-jwt';

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

// Per-cache-key token cache. The cache key is typically the user uid,
// or a fallback key like 'service' when no user is associated.
const cachedByKey = new Map<string, CachedToken>();
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
  const expiresInSec =
    data.expiresIn != null ? Number(data.expiresIn) : undefined;
  return { idToken: data.idToken, expiresInSec };
}

/**
 * Returns a GCIP ID token suitable for calling an IAP-protected API configured with Identity Platform.
 *
 * If a user uid is provided, the uid is embedded as a custom claim in the
 * underlying Firebase custom token, and the resulting GCIP ID token is cached
 * per-user. This ensures that user-specific tokens are not shared across
 * different users.
 *
 * When no uid is provided, a shared "service" token is used and cached
 * under a common key.
 */
export async function getGcipIdToken(
  userInfo: SessionPayload | undefined,
): Promise<string> {
  // Dev/mock bypass: allow local runs without Firebase Admin/service accounts
  const isMock =
    getEnvConfig('NEXT_PUBLIC_API_MOCKING') === 'enabled' ||
    getEnvConfig('LOCAL_DEV_NO_ADMIN') === '1';
  if (isMock) {
    return 'dev-mock-token';
  }
  const cacheKey = userInfo?.uid ?? 'service';

  // Use cached token if still valid for at least 60 seconds
  const cached = cachedByKey.get(cacheKey);
  if (cached != undefined && cached.expiresAt - now() > 60_000) {
    return cached.token;
  }

  // Ensure Admin app is initialized centrally
  const adminApp = getFirebaseAdminApp();
  const serviceUid =
    nonEmpty(getEnvConfig('GCIP_SERVICE_UID')) ??
    nonEmpty(getEnvConfig('NEXT_GCIP_SERVICE_UID')) ??
    'iap-service-caller';
  const customClaims: Record<string, unknown> = { service: true };
  if (userInfo?.uid != undefined) {
    // Attach the end-user session information as metadata so downstream
    // services can attribute calls without changing API signatures.
    customClaims.userUid = userInfo.uid;
    customClaims.email = userInfo.email;
    customClaims.sessionIat = userInfo.iat;
    customClaims.sessionExp = userInfo.exp;
    customClaims.isGuest = userInfo.isGuest === true;
  }
  const customToken = await getAuth(adminApp).createCustomToken(
    serviceUid,
    customClaims,
  );
  const { idToken, expiresInSec } =
    await exchangeCustomTokenForIdToken(customToken);
  // Default TTL ~ 55 minutes if expiresIn not present
  const ttlMs = (expiresInSec ?? 3600) * 1000;
  const safetyMs = 300_000; // refresh 5 minutes early
  const entry: CachedToken = {
    token: idToken,
    expiresAt: now() + ttlMs - safetyMs,
  };
  cachedByKey.set(cacheKey, entry);
  return idToken;
}

/**
 * Returns a GCIP ID token suitable for IAP-protected API calls.
 * This avoids trusting client tokens and keeps credentials server-side only.
 */
export async function getSSRAccessToken(): Promise<string> {
  // If a user session exists, embed the user uid as a custom claim so
  // downstream services can attribute the call. Otherwise, fall back to a
  // shared service token.
  let userInfo: SessionPayload | undefined;
  try {
    userInfo = await getCurrentUserFromCookie();
  } catch {
    console.warn('No cookie found');
  }
  return await getGcipIdToken(userInfo);
}

/**
 * Reads the HTTP-only session cookie set by /api/session, verifies the
 * server-signed session JWT, and returns basic user info.
 *
 * Server-only: do not import this helper from client components.
 */
export async function getCurrentUserFromCookie(): Promise<
  SessionPayload | undefined
> {
  try {
    // In newer Next.js versions, cookies() can be async and must be awaited.
    let cookieStore;
    try {
      cookieStore = await cookies();
    } catch {
      cookieStore = undefined;
    }

    if (cookieStore == undefined || typeof cookieStore.get !== 'function') {
      return undefined;
    }

    const token = cookieStore.get('md_session')?.value;
    if (token == null) {
      return undefined;
    }

    const session = verifySessionToken(token);
    if (session == null) {
      return undefined;
    }

    return session;
  } catch (error) {
    // Swallow errors and treat as unauthenticated; callers already handle
    // the undefined case and attach a service-level token instead.
    return undefined;
  }
}

/**
 * Returns the raw session JWT from the md_session cookie, but only if it
 * verifies successfully. This is intended for forwarding to backend services
 * via a header (e.g. x-mdb-user-context) so they can decode user identity
 * without directly accessing browser cookies.
 */
export async function getUserContextJwtFromCookie(): Promise<
  string | undefined
> {
  try {
    let cookieStore;
    try {
      cookieStore = await cookies();
    } catch {
      cookieStore = undefined;
    }

    if (cookieStore == undefined || typeof cookieStore.get !== 'function') {
      return undefined;
    }

    const token = cookieStore.get('md_session')?.value;
    if (token == null) {
      return undefined;
    }

    const verified = verifySessionToken(token);
    if (verified == null) {
      return undefined;
    }

    return token;
  } catch {
    return undefined;
  }
}
