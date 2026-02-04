import { app } from '../../firebase';

/**
 * After Firebase login on the client, call this to establish
 * a server-side session via the /api/session endpoint.
 */
export const setUserCookieSession = async (): Promise<void> => {
  // Ensure this only runs in the browser
  if (typeof window === 'undefined') {
    return;
  }

  const user = app.auth().currentUser;
  if (user == null) {
    return;
  }

  const idToken = await user.getIdToken();
  await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
};

/**
 * Clear the server-side session cookie on logout.
 */
export const clearUserCookieSession = async (): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }

  await fetch('/api/session', {
    method: 'DELETE',
  });
};
