import { app } from '../../firebase';

const STORED_SESSION_KEY = 'md_session_meta';
const SESSION_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
// Renew 5 minutes before expiry to avoid edge-case lapses.
const RENEWAL_BUFFER_MS = 5 * 60 * 1000;

interface SessionMeta {
  uid: string;
  expiresAt: number;
}

function isCookieFresh(uid: string): boolean {
  try {
    const raw = localStorage.getItem(STORED_SESSION_KEY);
    const meta = raw != null ? (JSON.parse(raw) as SessionMeta) : null;
    return (
      meta !== null &&
      meta.uid === uid &&
      Date.now() < meta.expiresAt - RENEWAL_BUFFER_MS
    );
  } catch {
    return false;
  }
}

/**
 * Establishes or renews the server-side `md_session` cookie.
 *
 * Skips the POST if localStorage shows the same user's cookie is still
 * fresh. Since localStorage is shared across all tabs of the same origin,
 * a renewal in any tab is immediately visible to all others.
 *
 * Identity changes (e.g. anonymous → authenticated) are handled
 * automatically: a different uid always triggers a fresh POST.
 */
export const setUserCookieSession = async (): Promise<void> => {
  if (typeof window === 'undefined') return;

  const user = app.auth().currentUser;
  if (user == null) return;

  if (isCookieFresh(user.uid)) return;

  const idToken = await user.getIdToken();
  const resp = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (resp.ok) {
    try {
      localStorage.setItem(
        STORED_SESSION_KEY,
        JSON.stringify({
          uid: user.uid,
          expiresAt: Date.now() + SESSION_MAX_AGE_MS,
        }),
      );
    } catch {
      // Private browsing or storage quota exceeded — best-effort.
    }
  }
};

/**
 * Clears the server-side session cookie on logout.
 * Also clears localStorage so the next anonymous sign-in always
 * issues a fresh cookie regardless of any prior expiry stored there.
 */
export const clearUserCookieSession = async (): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(STORED_SESSION_KEY);
  } catch {
    // Ignore
  }
  await fetch('/api/session', {
    method: 'DELETE',
  });
};
