import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSelector } from 'react-redux';
import { selectUserProfileStatus } from '../store/profile-selectors';
import {
  ACCOUNT_TARGET,
  ADD_FEED_TARGET,
  COMPLETE_REGISTRATION_TARGET,
  POST_REGISTRATION_TARGET,
} from '../constants/Navigation';

/**
 * Centralizes the post-sign-up navigation flow shared by the sign-up,
 * verify-email and complete-registration pages.
 *
 * Flow based on the user profile status:
 *  - unverified    -> verify-email page
 *  - authenticated -> complete-registration page (email verified, not registered)
 *  - registered    -> final destination (add feed form or account)
 *
 * The original query string is preserved across the verify-email and
 * complete-registration steps so the final destination can honour params
 * such as `add_feed` (set when arriving from the add feed form or the
 * subscribe button).
 */
export function useRegistrationFlowRedirect(): void {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const userProfileStatus = useSelector(selectUserProfileStatus);

  useEffect(() => {
    const query = params.toString();
    const withQuery = (path: string): string =>
      query.length > 0 ? `${path}?${query}` : path;

    let target: string | undefined;
    switch (userProfileStatus) {
      case 'unverified':
        target = withQuery(POST_REGISTRATION_TARGET);
        break;
      case 'authenticated':
        target = withQuery(COMPLETE_REGISTRATION_TARGET);
        break;
      case 'registered':
        {
          const redirectTo = params.get('redirect_to');
          if (
            redirectTo != null &&
            redirectTo.startsWith('/') &&
            !redirectTo.startsWith('//')
          ) {
            target = redirectTo;
          } else if (params.has('add_feed')) {
            target = ADD_FEED_TARGET;
          } else {
            target = ACCOUNT_TARGET;
          }
        }
        break;
      default:
        target = undefined;
    }

    if (target === undefined) {
      return;
    }

    // Avoid redirecting to the page the user is already on.
    const targetPath = target.split('?')[0];
    if (pathname.endsWith(targetPath)) {
      return;
    }

    router.push(target);
  }, [userProfileStatus]);
}
