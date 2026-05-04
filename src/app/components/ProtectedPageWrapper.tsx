'use client';

// TODO: Replace this wrapper with a (protected) route group layout that
// provides auth guarding at the layout level.
// targetStatus can be used to scope groups further (e.g. (authenticated), (unverified)).
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { useAppDispatch } from '../hooks';
import { refreshApp, refreshAppSuccess } from '../store/profile-reducer';
import { selectUserProfileStatus } from '../store/selectors';
import { app } from '../../firebase';
import { SIGN_IN_TARGET } from '../constants/Navigation';

interface ProtectedPageWrapperProps {
  children: React.ReactNode;
  /**
   * The user profile status required to access this page.
   * Mirrors the `targetStatus` prop from the legacy ProtectedRoute component.
   * Defaults to 'registered'.
   */
  targetStatus?: string;
  redirect?: string;
}

export function ProtectedPageWrapper({
  children,
  targetStatus = 'registered',
  redirect = SIGN_IN_TARGET,
}: ProtectedPageWrapperProps): React.ReactElement | null {
  const userProfileStatus = useSelector(selectUserProfileStatus);
  const router = useRouter();
  const dispatch = useAppDispatch();

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

  useEffect(() => {
    if (userProfileStatus !== targetStatus) {
      router.replace(redirect);
    }
  }, [userProfileStatus, targetStatus, redirect, router]);

  if (userProfileStatus !== targetStatus) {
    return null;
  }

  return <>{children}</>;
}
