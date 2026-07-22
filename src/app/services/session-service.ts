import { app } from '../../firebase';
import {
  type FeatureFlag,
  toUserFeatureFlags,
} from '../interface/UserFeatureFlags';
import {
  FEATURE_FLAGS_CHANNEL,
  broadcastExtendedMessage,
} from './channel-service';
import { retrieveUserInformation } from './profile-service';

const STORED_SESSION_KEY = 'md_session_meta';
const SESSION_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
// Renew 5 minutes before expiry to avoid edge-case lapses.
const RENEWAL_BUFFER_MS = 5 * 60 * 1000;

interface SessionMeta {
  uid: string;
  expiresAt: number;
}

type SessionStatus =
  /** Session is valid — no POST needed. */
  | 'fresh'
  /** Prior session for this user existed but expired — a renewal. */
  | 'renewal'
  /** No prior session for this user — first login or identity change. */
  | 'new';

function getSessionStatus(uid: string): SessionStatus {
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
 * Returns true when an existing session was renewed (same uid, cookie was
 * stale). Returns false when the session was freshly established (first login)
 * or was still fresh (no-op). Callers can use this signal to re-fetch
 * user-specific data (e.g. feature flags) that should stay in sync with the
 * session renewal cycle without fetching on every login.
 */
export const setUserCookieSession = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  const user = app.auth().currentUser;
  if (user == null) return false;

  const sessionStatus = getSessionStatus(user.uid);
  if (sessionStatus === 'fresh') return false;

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
    return sessionStatus === 'renewal';
  }

  return false;
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

/**
 * Re-fetches the user profile and applies the latest feature flags.
 * Called on session renewal (hourly) to keep flags current without re-login.
 * Login and sign-up sagas handle the initial flag fetch themselves.
 */
export const refreshUserFeatureFlags = async (): Promise<void> => {
  try {
    const userData = await retrieveUserInformation();
    if (userData != null) {
      await applyUserFeatureFlags(userData.features);
    }
  } catch {
    // Non-critical — best-effort flag refresh.
  }
};

/**
 * Sends the resolved user feature flags to POST /api/feature-flags, which
 * HMAC-signs them and sets the httpOnly md_features cookie.
 *
 * Follows the same pattern as setUserCookieSession → POST /api/session.
 * Called by login and token-refresh sagas after fetching the user profile.
 * Distributes the flags to all tabs via the feature-flags channel so the UserFeatureFlagProvider updates.
 */
export const applyUserFeatureFlags = async (
  features: FeatureFlag[],
): Promise<void> => {
  if (typeof window === 'undefined') return;

  // Sets the md_features cookie server-side, so it is httpOnly and not accessible to JS.
  const resp = await fetch('/api/feature-flags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(features),
  });

  if (resp.ok) {
    // Deliver the resolved flags to this tab and every other open tab through
    // the shared feature-flags channel (see UserFeatureFlagProvider listener).
    broadcastExtendedMessage(
      FEATURE_FLAGS_CHANNEL,
      toUserFeatureFlags(features),
    );
  }
};
