import React, { type JSX } from 'react';
import {
  render,
  act,
  renderHook,
  type RenderResult,
} from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { AuthSessionProvider, useAuthSession } from './AuthSessionProvider';
import { setUserCookieSession } from '../services/session-service';
import { anonymousLogin } from '../store/profile-reducer';

const RENEWAL_INTERVAL_MS = 5 * 60 * 1000;

// ---------- Mock: firebase ----------

let capturedAuthCallback: (user: unknown) => void = () => {};
const mockUnsubscribe = jest.fn();

jest.mock('../../firebase', () => ({
  app: {
    auth: jest.fn(() => ({
      onIdTokenChanged: jest.fn((cb: (user: unknown) => void) => {
        capturedAuthCallback = cb;
        return mockUnsubscribe;
      }),
      currentUser: null,
    })),
  },
}));

// ---------- Mock: session-service ----------

jest.mock('../services/session-service', () => ({
  setUserCookieSession: jest.fn().mockResolvedValue('fresh'),
}));

// ---------- Mock: i18n navigation ----------

const mockRefresh = jest.fn();
jest.mock('../../i18n/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// ---------- Mock: user-feature-flag-service ----------
// Also keeps the real module's openapi-fetch client out of this suite's module
// graph, which needs browser globals jsdom does not provide.

jest.mock('../services/user-feature-flag-service', () => ({
  revalidateUserFeatureFlags: jest.fn().mockResolvedValue(undefined),
}));

// ---------- Mock: profile-reducer ----------

jest.mock('../store/profile-reducer', () => ({
  anonymousLogin: jest.fn(() => ({ type: 'profile/anonymousLogin' })),
}));

// ---------- Mock: react-redux (preserve Provider, stub useDispatch) ----------

const mockDispatch = jest.fn();
jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useDispatch: () => mockDispatch,
}));

// ---------- Helpers ----------

function makeStore(): ReturnType<typeof configureStore> {
  return configureStore({ reducer: { _: () => null } });
}

function wrapper({ children }: { children: React.ReactNode }): JSX.Element {
  return <Provider store={makeStore()}>{children}</Provider>;
}

function wrapperWithAuth({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Provider store={makeStore()}>
      <AuthSessionProvider>{children}</AuthSessionProvider>
    </Provider>
  );
}

function renderProvider(): RenderResult {
  return render(
    <Provider store={makeStore()}>
      <AuthSessionProvider>
        <span data-testid='child' />
      </AuthSessionProvider>
    </Provider>,
  );
}

const mockUser = { uid: 'user-1', isAnonymous: false };
const mockGuest = { uid: 'guest-1', isAnonymous: true };

function mockSessionStatus(status: string): void {
  (setUserCookieSession as jest.Mock).mockResolvedValue(status);
}

// ---------- Tests ----------

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  capturedAuthCallback = () => {};
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AuthSessionProvider', () => {
  describe('useAuthSession', () => {
    it('returns false before any auth state change', () => {
      const { result } = renderHook(() => useAuthSession(), { wrapper });
      expect(result.current.isAuthReady).toBe(false);
    });

    it('returns true after onIdTokenChanged fires with a user', async () => {
      const { result } = renderHook(() => useAuthSession(), {
        wrapper: wrapperWithAuth,
      });

      await act(async () => {
        capturedAuthCallback(mockUser);
      });

      expect(result.current.isAuthReady).toBe(true);
    });

    it('returns false after onIdTokenChanged fires with null', async () => {
      const { result } = renderHook(() => useAuthSession(), {
        wrapper: wrapperWithAuth,
      });

      await act(async () => {
        capturedAuthCallback(null);
      });

      expect(result.current.isAuthReady).toBe(false);
    });
  });

  describe('when a user signs in', () => {
    it('calls setUserCookieSession immediately', async () => {
      renderProvider();

      await act(async () => {
        capturedAuthCallback(mockUser);
      });

      expect(setUserCookieSession).toHaveBeenCalledTimes(1);
    });

    it('calls setUserCookieSession again after 5 minutes', async () => {
      renderProvider();

      await act(async () => {
        capturedAuthCallback(mockUser);
      });

      await act(async () => {
        jest.advanceTimersByTime(RENEWAL_INTERVAL_MS);
      });

      expect(setUserCookieSession).toHaveBeenCalledTimes(2);
    });

    it('keeps calling setUserCookieSession every 5 minutes', async () => {
      renderProvider();

      await act(async () => {
        capturedAuthCallback(mockUser);
      });

      await act(async () => {
        jest.advanceTimersByTime(RENEWAL_INTERVAL_MS * 3);
      });

      expect(setUserCookieSession).toHaveBeenCalledTimes(4); // 1 immediate + 3 ticks
    });

    it('clears the interval when auth state changes', async () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      renderProvider();

      await act(async () => {
        capturedAuthCallback(mockUser);
      });

      await act(async () => {
        capturedAuthCallback(null);
      });

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it('does not call setUserCookieSession after auth state changes to null', async () => {
      renderProvider();

      await act(async () => {
        capturedAuthCallback(mockUser);
      });

      await act(async () => {
        capturedAuthCallback(null);
      });

      (setUserCookieSession as jest.Mock).mockClear();

      await act(async () => {
        jest.advanceTimersByTime(RENEWAL_INTERVAL_MS);
      });

      expect(setUserCookieSession).not.toHaveBeenCalled();
    });
  });

  // The proxy routes a request with no valid `md_session` to the guest
  // `static/` tree, so a document rendered before the cookie was established is
  // an anonymous view. Refreshing re-runs the proxy with the cookie in place.
  describe('refreshing after the session cookie is established', () => {
    it('refreshes when an expired cookie is renewed', async () => {
      mockSessionStatus('renewal');
      renderProvider();

      await act(async () => {
        capturedAuthCallback(mockUser);
      });

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it('refreshes when a session is established for a new identity', async () => {
      mockSessionStatus('new');
      renderProvider();

      await act(async () => {
        capturedAuthCallback(mockUser);
      });

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it('does not refresh when the cookie was already fresh', async () => {
      mockSessionStatus('fresh');
      renderProvider();

      await act(async () => {
        capturedAuthCallback(mockUser);
      });

      expect(mockRefresh).not.toHaveBeenCalled();
    });

    it('does not refresh when the POST failed', async () => {
      mockSessionStatus('failed');
      renderProvider();

      await act(async () => {
        capturedAuthCallback(mockUser);
      });

      expect(mockRefresh).not.toHaveBeenCalled();
    });

    // Guests are routed to `static/` with or without a cookie, so a refresh
    // would land on the very same tree.
    it('does not refresh for an anonymous user', async () => {
      mockSessionStatus('new');
      renderProvider();

      await act(async () => {
        capturedAuthCallback(mockGuest);
      });

      expect(mockRefresh).not.toHaveBeenCalled();
    });

    // The hourly renewal on a long-open tab is a page that already rendered
    // under the right tree.
    it('does not refresh again on a later renewal for the same user', async () => {
      mockSessionStatus('fresh');
      renderProvider();

      await act(async () => {
        capturedAuthCallback(mockUser);
      });

      mockSessionStatus('renewal');
      await act(async () => {
        jest.advanceTimersByTime(RENEWAL_INTERVAL_MS);
      });

      expect(setUserCookieSession).toHaveBeenCalledTimes(2);
      expect(mockRefresh).not.toHaveBeenCalled();
    });

    // A failed POST leaves no cookie, so the route on screen is still the
    // guest one - the retry that finally establishes the session has to be the
    // one that refreshes it.
    it('refreshes on the retry after the first POST failed', async () => {
      mockSessionStatus('failed');
      renderProvider();

      await act(async () => {
        capturedAuthCallback(mockUser);
      });
      expect(mockRefresh).not.toHaveBeenCalled();

      mockSessionStatus('new');
      await act(async () => {
        jest.advanceTimersByTime(RENEWAL_INTERVAL_MS);
      });

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it('refreshes on the retry after the first POST rejected', async () => {
      (setUserCookieSession as jest.Mock).mockRejectedValueOnce(
        new Error('network'),
      );
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      renderProvider();

      await act(async () => {
        capturedAuthCallback(mockUser);
      });
      expect(mockRefresh).not.toHaveBeenCalled();

      mockSessionStatus('new');
      await act(async () => {
        jest.advanceTimersByTime(RENEWAL_INTERVAL_MS);
      });

      expect(mockRefresh).toHaveBeenCalledTimes(1);
      consoleError.mockRestore();
    });

    // Releasing the uid must not resurrect a refresh for a sync that already
    // succeeded - only the failed one is rolled back.
    it('does not refresh again when a later renewal fails', async () => {
      mockSessionStatus('new');
      renderProvider();

      await act(async () => {
        capturedAuthCallback(mockUser);
      });
      expect(mockRefresh).toHaveBeenCalledTimes(1);

      mockSessionStatus('failed');
      await act(async () => {
        jest.advanceTimersByTime(RENEWAL_INTERVAL_MS);
      });

      mockSessionStatus('renewal');
      await act(async () => {
        jest.advanceTimersByTime(RENEWAL_INTERVAL_MS);
      });

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    // Signing in on a page that was rendered for a guest is a wrong-tree
    // render too, even though it is not the first sync of this page's life.
    it('refreshes when the identity changes from guest to signed in', async () => {
      mockSessionStatus('new');
      renderProvider();

      await act(async () => {
        capturedAuthCallback(mockGuest);
      });
      expect(mockRefresh).not.toHaveBeenCalled();

      await act(async () => {
        capturedAuthCallback(mockUser);
      });

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('when no user is present', () => {
    it('dispatches anonymousLogin', async () => {
      renderProvider();

      await act(async () => {
        capturedAuthCallback(null);
      });

      expect(mockDispatch).toHaveBeenCalledWith(
        (anonymousLogin as unknown as jest.Mock).mock.results[0].value,
      );
    });

    it('does not call setUserCookieSession', async () => {
      renderProvider();

      await act(async () => {
        capturedAuthCallback(null);
      });

      expect(setUserCookieSession).not.toHaveBeenCalled();
    });
  });

  describe('cleanup on unmount', () => {
    it('unsubscribes from onIdTokenChanged', () => {
      const { unmount } = renderProvider();
      unmount();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });

    it('cancels the renewal interval on unmount', async () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      const { unmount } = renderProvider();

      await act(async () => {
        capturedAuthCallback(mockUser);
      });

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it('does not call setUserCookieSession after unmount', async () => {
      const { unmount } = renderProvider();

      await act(async () => {
        capturedAuthCallback(mockUser);
      });

      unmount();
      (setUserCookieSession as jest.Mock).mockClear();

      await act(async () => {
        jest.advanceTimersByTime(RENEWAL_INTERVAL_MS);
      });

      expect(setUserCookieSession).not.toHaveBeenCalled();
    });
  });
});
