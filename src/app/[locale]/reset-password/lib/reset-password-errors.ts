/**
 * Maps Firebase auth error codes raised by `verifyPasswordResetCode` and
 * `confirmPasswordReset` onto translation keys under the `resetPassword.errors`
 * namespace.
 *
 * Pure so it can be unit tested without rendering or a Firebase app.
 *
 * @see https://firebase.google.com/docs/reference/js/auth#autherrorcodes
 */

export type ResetPasswordErrorKey =
  | 'expiredCode'
  | 'invalidCode'
  | 'userDisabled'
  | 'userNotFound'
  | 'weakPassword'
  | 'tooManyRequests'
  | 'networkError'
  | 'generic';

const ERROR_CODE_TO_KEY: Record<string, ResetPasswordErrorKey> = {
  'auth/expired-action-code': 'expiredCode',
  'auth/invalid-action-code': 'invalidCode',
  'auth/user-disabled': 'userDisabled',
  'auth/user-not-found': 'userNotFound',
  'auth/weak-password': 'weakPassword',
  'auth/too-many-requests': 'tooManyRequests',
  'auth/network-request-failed': 'networkError',
};

/**
 * Errors that mean the link itself is spent: retrying the form cannot help, so
 * the user has to request a fresh reset email.
 */
const UNUSABLE_LINK_KEYS = new Set<ResetPasswordErrorKey>([
  'expiredCode',
  'invalidCode',
  'userDisabled',
  'userNotFound',
]);

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  const { code } = error as { code: unknown };
  return typeof code === 'string' ? code : undefined;
}

export function mapResetPasswordError(error: unknown): ResetPasswordErrorKey {
  const code = getErrorCode(error);
  if (code === undefined) {
    return 'generic';
  }
  return ERROR_CODE_TO_KEY[code] ?? 'generic';
}

export function isLinkUnusable(key: ResetPasswordErrorKey): boolean {
  return UNUSABLE_LINK_KEYS.has(key);
}
