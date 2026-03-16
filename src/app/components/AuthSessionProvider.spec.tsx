import React, { type JSX } from 'react';
import {
  render,
  act,
  renderHook,
  type RenderResult,
} from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { AuthSessionProvider, useAuthReady } from './AuthSessionProvider';
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
  setUserCookieSession: jest.fn().mockResolvedValue(undefined),
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

const mockUser = { uid: 'user-1' };

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
  describe('useAuthReady', () => {
    it('returns false before any auth state change', () => {
      const { result } = renderHook(() => useAuthReady(), { wrapper });
      expect(result.current).toBe(false);
    });

    it('returns true after onIdTokenChanged fires with a user', async () => {
      const { result } = renderHook(() => useAuthReady(), {
        wrapper: wrapperWithAuth,
      });

      await act(async () => {
        capturedAuthCallback(mockUser);
      });

      expect(result.current).toBe(true);
    });

    it('returns false after onIdTokenChanged fires with null', async () => {
      const { result } = renderHook(() => useAuthReady(), {
        wrapper: wrapperWithAuth,
      });

      await act(async () => {
        capturedAuthCallback(null);
      });

      expect(result.current).toBe(false);
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
