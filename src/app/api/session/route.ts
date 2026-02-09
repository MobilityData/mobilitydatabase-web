import { type NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirebaseAdminApp } from '../../../lib/firebase-admin';
import { signSessionToken, verifySessionToken } from '../../utils/session-jwt';

const COOKIE_NAME = 'md_session';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { idToken?: string };
    const idToken = body?.idToken;

    if (idToken == null || typeof idToken !== 'string') {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    const app = getFirebaseAdminApp();
    const decoded = await getAuth(app).verifyIdToken(idToken);

    // Log the user id server-side for auditing/debugging
    console.info('Session established for user', {
      uid: decoded.uid,
      provider: decoded.firebase?.sign_in_provider,
    });

    const response = NextResponse.json({ status: 'ok' });

    // Create a short-lived server-signed session token that only contains
    // the user id and expiry, not the Firebase ID token itself.
    const sessionMaxAgeSec = 60 * 60; // 1 hour
    const isGuest = decoded.firebase?.sign_in_provider === 'anonymous';
    const sessionToken = signSessionToken(
      decoded.uid,
      decoded.email ?? undefined,
      {
        ttlSeconds: sessionMaxAgeSec,
        isGuest,
      },
    );
    console.info(decoded);
    response.cookies.set({
      name: COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      secure: isProduction(),
      sameSite: 'lax',
      path: '/',
      maxAge: sessionMaxAgeSec,
    });

    return response;
  } catch (error) {
    console.error('Error establishing session', error);
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 },
    );
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const cookie = req.cookies.get(COOKIE_NAME)?.value;
    if (cookie == null) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    const session = verifySessionToken(cookie);
    if (session == null) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    return NextResponse.json(
      {
        authenticated: true,
        uid: session.uid,
        isGuest: session.isGuest ?? false,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Error validating session', error);
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  // Clear the session cookie so that subsequent requests have no session.
  const response = NextResponse.json({ status: 'logged_out' });
  // Use the built-in delete helper to ensure the cookie is removed.
  response.cookies.delete(COOKIE_NAME);
  return response;
}
