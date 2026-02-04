import { app } from '../../firebase';

/**
 * After Firebase login on the client, call this to establish
 * a server-side session via the /api/session endpoint.
 */
export const setUserCookieSession = async (): Promise<void> => {
  console.log('setting id into the cookie--');
  // Ensure this only runs in the browser
  if (typeof window === 'undefined') {
    return;
  }

  const user = app.auth().currentUser;
  if (user == null) {
    return;
  }

  const idToken = await user.getIdToken();
  console.log('setting id into the cookie' + idToken);
  await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
};
