'use client';

import { useEffect, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch } from '../hooks';
import { logout } from '../store/profile-reducer';
import { SIGN_OUT_TARGET } from '../constants/Navigation';
import {
  LOGIN_CHANNEL,
  LOGOUT_CHANNEL,
  createBroadcastChannel,
} from '../services/channel-service';

/**
 * Registers the cross-tab auth broadcast channels once for the App Router tree.
 */
export function AuthBroadcastChannelSync(): ReactElement | null {
  const router = useRouter();
  const dispatch = useAppDispatch();

  useEffect(() => {
    createBroadcastChannel(LOGOUT_CHANNEL, () => {
      dispatch(
        logout({
          redirectScreen: SIGN_OUT_TARGET,
          navigateTo: (path) => {
            router.push(String(path));
          },
          propagate: false,
        }),
      );
    });

    createBroadcastChannel(LOGIN_CHANNEL, () => {
      window.location.reload();
    });
  }, [dispatch, router]);

  return null;
}
