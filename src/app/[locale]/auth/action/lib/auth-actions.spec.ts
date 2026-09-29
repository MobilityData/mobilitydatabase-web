// `src/i18n/routing` pulls in next-intl's ESM build, which next/jest always
// leaves untransformed (it hard-codes /node_modules/ ahead of any custom
// transformIgnorePatterns). Same mock as proxy-helpers.spec.ts.
jest.mock('../../../../../i18n/routing', () => ({
  AVAILABLE_LOCALES: ['en', 'fr'],
  routing: {
    defaultLocale: 'en',
    locales: ['en', 'fr'],
  },
}));

import {
  isSupportedAuthActionMode,
  resolveActionLocale,
  resolveAuthAction,
  toLocale,
} from './auth-actions';

describe('isSupportedAuthActionMode', () => {
  it('accepts the modes the app handles', () => {
    expect(isSupportedAuthActionMode('verifyEmail')).toBe(true);
    expect(isSupportedAuthActionMode('resetPassword')).toBe(true);
  });

  it('rejects other Firebase modes and missing values', () => {
    expect(isSupportedAuthActionMode('recoverEmail')).toBe(false);
    expect(isSupportedAuthActionMode('revertSecondFactorAddition')).toBe(false);
    expect(isSupportedAuthActionMode('')).toBe(false);
    expect(isSupportedAuthActionMode(undefined)).toBe(false);
  });
});

describe('resolveActionLocale', () => {
  it('falls back when Firebase sends no language', () => {
    expect(resolveActionLocale(undefined, 'en')).toBe('en');
    expect(resolveActionLocale(undefined, 'fr')).toBe('fr');
  });

  it('uses a supported language', () => {
    expect(resolveActionLocale('fr', 'en')).toBe('fr');
  });

  it('strips the region from a qualified tag', () => {
    expect(resolveActionLocale('fr-CA', 'en')).toBe('fr');
    expect(resolveActionLocale('EN-GB', 'fr')).toBe('en');
  });

  it('falls back for a language the app does not ship', () => {
    expect(resolveActionLocale('de', 'en')).toBe('en');
    expect(resolveActionLocale('', 'fr')).toBe('fr');
  });
});

describe('toLocale', () => {
  it('passes through known locales', () => {
    expect(toLocale('fr')).toBe('fr');
  });

  it('defaults for unknown or missing values', () => {
    expect(toLocale('de')).toBe('en');
    expect(toLocale(undefined)).toBe('en');
  });
});

describe('resolveAuthAction', () => {
  it('routes email verification to the verification page', () => {
    expect(
      resolveAuthAction({ mode: 'verifyEmail', oobCode: 'abc' }, 'en'),
    ).toEqual({
      status: 'redirect',
      pathname: '/email-verification',
      query: { mode: 'verifyEmail', oobCode: 'abc' },
      locale: 'en',
    });
  });

  it('routes password reset to the reset page', () => {
    expect(
      resolveAuthAction({ mode: 'resetPassword', oobCode: 'abc' }, 'en'),
    ).toEqual({
      status: 'redirect',
      pathname: '/reset-password',
      query: { mode: 'resetPassword', oobCode: 'abc' },
      locale: 'en',
    });
  });

  it("honours the recipient's language over the request locale", () => {
    const resolution = resolveAuthAction(
      { mode: 'resetPassword', oobCode: 'abc', lang: 'fr' },
      'en',
    );
    expect(resolution).toMatchObject({ status: 'redirect', locale: 'fr' });
  });

  it('reports an unsupported mode', () => {
    expect(
      resolveAuthAction({ mode: 'recoverEmail', oobCode: 'abc' }, 'en'),
    ).toEqual({ status: 'error', reason: 'unsupportedMode' });
    expect(resolveAuthAction({ oobCode: 'abc' }, 'en')).toEqual({
      status: 'error',
      reason: 'unsupportedMode',
    });
  });

  it('reports a missing one-time code', () => {
    expect(resolveAuthAction({ mode: 'resetPassword' }, 'en')).toEqual({
      status: 'error',
      reason: 'missingCode',
    });
    expect(
      resolveAuthAction({ mode: 'resetPassword', oobCode: '   ' }, 'en'),
    ).toEqual({ status: 'error', reason: 'missingCode' });
  });

  it('checks the mode before the code so a junk link is not mislabelled', () => {
    expect(resolveAuthAction({}, 'en')).toEqual({
      status: 'error',
      reason: 'unsupportedMode',
    });
  });
});
