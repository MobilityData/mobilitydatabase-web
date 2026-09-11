import { app } from '../../firebase';

const STORED_SESSION_KEY = 'md_session_meta';
const SESSION_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
// Renew 5 minutes before expiry to avoid edge-case lapses.
const RENEWAL_BUFFER_MS = 5 * 60 * 1000;

interface SessionMeta {
  uid: string;
  expiresAt: number;
}

/**
 * Outcome of {@link setUserCookieSession}.
 *
 * Callers use this to tell "the cookie was already good" from "we had to
 * establish one". The latter means the current document was rendered without
 * a valid `md_session`, and the proxy therefore routed it as a guest.
 */
export type SessionStatus =
  /** Session is valid — no POST needed. */
  | 'fresh'
  /** Prior session for this user existed but expired — a renewal. */
  | 'renewal'
  /** No prior session for this user — first login or identity change. */
  | 'new'
  /** The POST failed — no session was established. */
  | 'failed';

function getSessionStatus(uid: string): Exclude<SessionStatus, 'failed'> {
  try {
    const raw = localStorage.getItem(STORED_SESSION_KEY);
    const meta = raw != null ? (JSON.parse(raw) as SessionMeta) : null;
    if (meta === null || meta.uid !== uid) return 'new';
    if (Date.now() < meta.expiresAt - RENEWAL_BUFFER_MS) return 'fresh';
    return 'renewal';
  } catch {
    return 'new';
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
 *
 * Returns the status that was acted on: `'fresh'` when no POST was needed,
 * `'renewal'` or `'new'` when one succeeded, `'failed'` when it did not.
 * Anything other than `'fresh'` means the document currently on screen was
 * rendered without this user's session — see AuthSessionProvider.
 */
export const setUserCookieSession = async (): Promise<SessionStatus> => {
  if (typeof window === 'undefined') return 'fresh';

  const user = app.auth().currentUser;
  if (user == null) return 'fresh';

  const sessionStatus = getSessionStatus(user.uid);
  if (sessionStatus === 'fresh') return 'fresh';

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
    return sessionStatus;
  }

  return 'failed';
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
