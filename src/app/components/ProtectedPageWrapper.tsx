'use client';

// TODO: Replace this wrapper with a (protected) route group layout that
// provides auth guarding at the layout level.
// targetStatus can be used to scope groups further (e.g. (authenticated), (unverified)).
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppDispatch } from '../hooks';
import { refreshApp, refreshAppSuccess } from '../store/profile-reducer';
import { selectUserProfileStatus } from '../store/selectors';
import { app } from '../../firebase';
import { SIGN_IN_TARGET } from '../constants/Navigation';
import { useAuthSession } from './AuthSessionProvider';

interface ProtectedPageWrapperProps {
  children: React.ReactNode;
  /**
   * The user profile status or statuses required to access this page.
   * Mirrors the `targetStatus` prop from the legacy ProtectedRoute component.
   * Defaults to 'registered'.
   */
  targetStatus?: string | string[];
  redirect?: string;
}

export function ProtectedPageWrapper({
  children,
  targetStatus = 'registered',
  redirect = SIGN_IN_TARGET,
}: ProtectedPageWrapperProps): React.ReactElement | null {
  const userProfileStatus = useSelector(selectUserProfileStatus);
  const { isAuthResolved } = useAuthSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();

  const allowedStatuses = Array.isArray(targetStatus)
    ? targetStatus
    : [targetStatus];

  useEffect(() => {
    app.auth();

    // Mirrors onAuthStateChanged logic from the legacy ProtectedRoute
    const unsubscribe = app.auth().onAuthStateChanged((user) => {
      if (user != null) {
        dispatch(refreshAppSuccess());
      }
    });

    if (app.auth().currentUser == null) {
      dispatch(refreshApp());
    }

    return () => {
      unsubscribe();
    };
  }, [dispatch]);

  const isAuthorized = allowedStatuses.includes(userProfileStatus);

  useEffect(() => {
    // Only redirect once auth state has resolved and profile is hydrated
    if (!isAuthResolved) return;
    if (userProfileStatus === 'idle' || userProfileStatus === 'loading') return;

    if (!isAuthorized) {
      const query = searchParams?.toString();
      const target =
        query && !redirect.includes('?') ? `${redirect}?${query}` : redirect;
      router.replace(target);
    }
  }, [
    isAuthResolved,
    userProfileStatus,
    isAuthorized,
    redirect,
    router,
    searchParams,
  ]);

  if (!isAuthResolved || !isAuthorized) {
    return null;
  }

  return <>{children}</>;
}
