'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
} from 'react';
import { useDispatch } from 'react-redux';
import { app } from '../../firebase';
import { anonymousLogin } from '../store/profile-reducer';
import { setUserCookieSession } from '../services/session-service';

interface AuthSession {
  isAuthReady: boolean;
  email: string | null;
  isAuthenticated: boolean;
}

const AuthReadyContext = createContext<AuthSession>({
  isAuthReady: false,
  email: null,
  isAuthenticated: false,
});

/**
 * Returns the current auth session state once Firebase has resolved.
 * Use this instead of registering your own `onAuthStateChanged` listener.
 */
export function useAuthSession(): AuthSession {
  return useContext(AuthReadyContext);
}

/**
 * Global auth session provider. Renders inside the Redux provider tree
 * and manages a single `onAuthStateChanged` listener that:
 *
 * 1. Triggers anonymous sign-in when no user exists.
 * 2. Re-establishes the `md_session` cookie on return visits (Firebase
 *    restores auth from IndexedDB but the 1-hour cookie has expired).
 * 3. Schedules the next renewal at exactly `expiresAt - 5 min` using
 *    a setTimeout derived from the value stored in localStorage.
 * 4. Deduplicates POSTs across tabs — localStorage is shared across all
 *    tabs, so a renewal written by any tab is immediately visible to all
 *    others via the `isCookieFresh` check in setUserCookieSession.
 * 5. Exposes `isAuthReady` via context.
 */
export function AuthSessionProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const dispatch = useDispatch();
  const [session, setSession] = useState<AuthSession>({
    isAuthReady: false,
    email: null,
    isAuthenticated: false,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const unsubscribe = app.auth().onIdTokenChanged((user) => {
      if (intervalRef.current != null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (user != null) {
        setSession({
          isAuthReady: true,
          email: user.email ?? null,
          isAuthenticated: !user.isAnonymous,
        });
        setUserCookieSession().catch(() => {
          console.error('Failed to establish session cookie');
        });

        // Check every 5 minutes; the cookie lasts 60 minutes, so this ensures renewal well before expiry
        // If the cookie is not expired, it will return early and skip the POST
        // The token will refresh 5 minutes before expiry which is why the 5 minute interval is used here.
        intervalRef.current = setInterval(
          () => {
            setUserCookieSession().catch(() => {
              console.error('Failed to establish session cookie');
            });
          },
          5 * 60 * 1000,
        ); // 5 minutes
      } else {
        setSession({ isAuthReady: false, email: null, isAuthenticated: false });
        dispatch(anonymousLogin());
      }
    });

    return () => {
      unsubscribe();
      if (intervalRef.current != null) clearInterval(intervalRef.current);
    };
  }, [dispatch]);

  return (
    <AuthReadyContext.Provider value={session}>
      {children}
    </AuthReadyContext.Provider>
  );
}
