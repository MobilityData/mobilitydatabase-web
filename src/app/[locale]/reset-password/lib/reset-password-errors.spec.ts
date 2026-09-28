import { isLinkUnusable, mapResetPasswordError } from './reset-password-errors';

describe('mapResetPasswordError', () => {
  it.each([
    ['auth/expired-action-code', 'expiredCode'],
    ['auth/invalid-action-code', 'invalidCode'],
    ['auth/user-disabled', 'userDisabled'],
    ['auth/user-not-found', 'userNotFound'],
    ['auth/weak-password', 'weakPassword'],
    ['auth/too-many-requests', 'tooManyRequests'],
    ['auth/network-request-failed', 'networkError'],
  ])('maps %s to %s', (code, expected) => {
    expect(mapResetPasswordError({ code })).toBe(expected);
  });

  it('falls back to a generic message for unknown Firebase codes', () => {
    expect(mapResetPasswordError({ code: 'auth/internal-error' })).toBe(
      'generic',
    );
  });

  it('falls back for values that are not Firebase errors', () => {
    expect(mapResetPasswordError(new Error('boom'))).toBe('generic');
    expect(mapResetPasswordError(undefined)).toBe('generic');
    expect(mapResetPasswordError(null)).toBe('generic');
    expect(mapResetPasswordError('auth/expired-action-code')).toBe('generic');
    expect(mapResetPasswordError({ code: 42 })).toBe('generic');
  });
});

describe('isLinkUnusable', () => {
  it('marks spent or rejected links as unusable', () => {
    expect(isLinkUnusable('expiredCode')).toBe(true);
    expect(isLinkUnusable('invalidCode')).toBe(true);
    expect(isLinkUnusable('userDisabled')).toBe(true);
    expect(isLinkUnusable('userNotFound')).toBe(true);
  });

  it('keeps the form retryable for transient failures', () => {
    expect(isLinkUnusable('weakPassword')).toBe(false);
    expect(isLinkUnusable('tooManyRequests')).toBe(false);
    expect(isLinkUnusable('networkError')).toBe(false);
    expect(isLinkUnusable('generic')).toBe(false);
  });
});
