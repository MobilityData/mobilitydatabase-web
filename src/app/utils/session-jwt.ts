import crypto from 'node:crypto';
import { getEnvConfig, nonEmpty } from './config';

/**
 * Session JWT payload shape used internally when signing and verifying tokens.
 *
 * - uid: stable Firebase user identifier
 * - email: optional email when available
 * - isGuest: true when the user is an anonymous/guest session
 * - iat/exp: issued-at and expiry timestamps (seconds since epoch)
 */
export interface SessionPayload {
  uid: string;
  email?: string;
  isGuest?: boolean;
  iat: number;
  exp: number;
}

/**
 * Encode a Buffer or string to a URL-safe Base64 string (base64url) with padding removed.
 *
 * This follows the common "base64url" format used by JWTs:
 * - '+' => '-'
 * - '/' => '_'
 * - '=' padding removed
 *
 * @param input - The input Buffer or string to encode.
 * @returns The URL-safe Base64-encoded string without padding.
 */
function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Default time-to-live (TTL) for session JWTs, in seconds.
 *
 * Value: 60 * 60 (1 hour)
 */
const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Read the JWT secret from the environment.
 *
 * The secret is required to be present in the SESSION_JWT_SECRET environment variable
 * and must be at least 32 characters long to ensure sufficient HMAC key strength.
 *
 * @returns The raw secret string.
 * @throws {Error} If SESSION_JWT_SECRET is not set or is shorter than 32 characters.
 *
 * @internal
 */
function getSecret(): string {
  const secret = nonEmpty(getEnvConfig('NEXT_SESSION_JWT_SECRET'));
  if (secret == null || secret.length < 32) {
    throw new Error(
      'SESSION_JWT_SECRET must be set and at least 32 characters long',
    );
  }
  return secret;
}

/**
 * Create and sign a session JWT for a given user ID (uid).
 *
 * The token uses HS256 (HMAC-SHA256) with a base64url-encoded header and payload:
 * - Header: { alg: "HS256", typ: "JWT" }
 * - Payload: { uid, email?, isGuest?, iat, exp }
 *
 * The issued-at time (iat) and expiration time (exp) are expressed as UNIX timestamps
 * (seconds since epoch). If ttlSeconds is omitted, DEFAULT_TTL_SECONDS (1 hour) is used.
 *
 * @param uid - The unique identifier for the user (required).
 * @param email - Optional email address to include in the token payload.
 * @param options - Optional settings: TTL (seconds) and guest flag.
 * @returns A compact JWT string in the format: "<base64url(header)>.<base64url(payload)>.<base64url(signature)>".
 * @throws {Error} If the signing secret is missing or invalid.
 */
export function signSessionToken(
  uid: string,
  email?: string,
  options?: { ttlSeconds?: number; isGuest?: boolean },
): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (options?.ttlSeconds ?? DEFAULT_TTL_SECONDS);

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: SessionPayload = {
    uid,
    email,
    isGuest: options?.isGuest,
    iat: now,
    exp,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const secret = getSecret();
  const signature = crypto.createHmac('sha256', secret).update(data).digest();

  return `${data}.${base64url(signature)}`;
}

/**
 * Verify a session JWT previously created by signSessionToken.
 *
 * Verification steps:
 * 1. Ensure the token has three dot-separated parts.
 * 2. Recompute the HMAC-SHA256 signature using the same secret and compare.
 * 3. Decode and parse the payload, validating required fields (uid and exp).
 * 4. Ensure the token has not expired (payload.exp > current time).
 *
 * On success, returns the minimal payload { uid, email? }. On any failure (malformed token,
 * signature mismatch, missing/invalid claims, expired token, or runtime error), returns undefined.
 *
 * @param token - The compact JWT string to verify.
 * @returns The session identity { uid, email? } if verification succeeds, otherwise undefined.
 */
export function verifySessionToken(token: string): SessionPayload | undefined {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return undefined;
    const [encodedHeader, encodedPayload, signature] = parts;
    const data = `${encodedHeader}.${encodedPayload}`;

    const secret = getSecret();
    const expectedSig = base64url(
      crypto.createHmac('sha256', secret).update(data).digest(),
    );
    if (signature !== expectedSig) return undefined;

    const json = Buffer.from(encodedPayload, 'base64').toString('utf8');
    const payload = JSON.parse(json) as Partial<SessionPayload>;
    if (typeof payload.uid !== 'string') return undefined;
    if (typeof payload.exp !== 'number') return undefined;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return undefined;

    return payload as SessionPayload;
  } catch {
    return undefined;
  }
}
