import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getEnvConfig } from '../../utils/config';
import { type FeatureFlag } from '../../interface/UserFeatureFlags';

const COOKIE_NAME = 'md_features';
const COOKIE_MAX_AGE_SEC = 60 * 60; // 1 hour — matches md_session TTL

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function getSecret(): string {
  const secret = getEnvConfig('NEXT_SESSION_JWT_SECRET');
  if (secret.length < 32) {
    throw new Error(
      'NEXT_SESSION_JWT_SECRET must be set and at least 32 characters long',
    );
  }
  return secret;
}

function sign(payload: string): string {
  const secret = getSecret();
  const encoded = Buffer.from(payload).toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(encoded)
    .digest()
    .toString('base64url');
  return `${encoded}.${sig}`;
}

/**
 * POST /api/feature-flags
 *
 * Accepts a FeatureFlag[] array from the login/refresh sagas, HMAC-signs it,
 * and stores it as the httpOnly md_features cookie.
 *
 * Security note: this endpoint does not verify the caller's identity, so an
 * authenticated user could inject arbitrary flag values via devtools. Feature
 * flags are UI hints only — the API enforces actual access independently.
 *
 * For paywalled flags, upgrade to the POST /api/session pattern: accept a
 * Firebase idToken, verify it server-side with Firebase Admin, and fetch the
 * flags directly from the user service rather than trusting the client body.
 * Using md_session for the check races with AuthSessionProvider setting it
 * concurrently during login, so that approach is not viable without a
 * dedicated auth token in the request.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const features = (await req.json()) as FeatureFlag[];
    const response = NextResponse.json({ status: 'ok' });
    response.cookies.set({
      name: COOKIE_NAME,
      value: sign(JSON.stringify(features)),
      httpOnly: true,
      secure: isProduction(),
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE_SEC,
    });
    return response;
  } catch (error) {
    console.error('Error setting feature flags cookie', error);
    return NextResponse.json(
      { error: 'Failed to set feature flags cookie' },
      { status: 500 },
    );
  }
}
