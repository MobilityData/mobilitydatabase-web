import {
  AVAILABLE_LOCALES,
  routing,
  type Locale,
} from '../../../../../i18n/routing';

/**
 * Firebase routes every account email (verify email, password reset, email
 * recovery, ...) to the single "action URL" configured in the Firebase console
 * and tells them apart only by the `mode` query parameter. This module maps the
 * modes we support onto the pages that handle them.
 *
 * Everything here is pure so it can be unit tested without rendering.
 *
 * @see https://firebase.google.com/docs/auth/custom-email-handler
 */

/** The only `mode` values this app knows how to handle. */
export const SUPPORTED_AUTH_ACTION_MODES = [
  'verifyEmail',
  'resetPassword',
] as const;

export type SupportedAuthActionMode =
  (typeof SUPPORTED_AUTH_ACTION_MODES)[number];

/** Locale-agnostic page that handles each mode. */
const AUTH_ACTION_TARGETS: Record<SupportedAuthActionMode, string> = {
  verifyEmail: '/email-verification',
  resetPassword: '/reset-password',
};

export type AuthActionErrorReason = 'unsupportedMode' | 'missingCode';

export type AuthActionResolution =
  | {
      status: 'redirect';
      pathname: string;
      query: { mode: SupportedAuthActionMode; oobCode: string };
      locale: Locale;
    }
  | { status: 'error'; reason: AuthActionErrorReason };

export interface AuthActionSearchParams {
  mode?: string;
  oobCode?: string;
  /** Firebase appends the recipient's language, e.g. `en`, `fr` or `fr-CA`. */
  lang?: string;
}

export function isSupportedAuthActionMode(
  mode: string | undefined,
): mode is SupportedAuthActionMode {
  return (
    mode !== undefined &&
    (SUPPORTED_AUTH_ACTION_MODES as readonly string[]).includes(mode)
  );
}

export function isLocale(value: string): value is Locale {
  return (AVAILABLE_LOCALES as readonly string[]).includes(value);
}

/**
 * Picks the locale to hand the action page. The action URL is a single,
 * unprefixed URL, so the recipient's language only reaches us through
 * Firebase's `lang` parameter; anything we don't ship falls back to the locale
 * the request was already resolved to.
 */
export function resolveActionLocale(
  lang: string | undefined,
  fallbackLocale: Locale,
): Locale {
  if (lang === undefined) {
    return fallbackLocale;
  }
  // Firebase may send a region-qualified tag such as `fr-CA`.
  const language = lang.trim().toLowerCase().split('-')[0];
  return isLocale(language) ? language : fallbackLocale;
}

/** Narrows an unvalidated route param to a locale, defaulting when unknown. */
export function toLocale(value: string | undefined): Locale {
  return value !== undefined && isLocale(value) ? value : routing.defaultLocale;
}

export function resolveAuthAction(
  searchParams: AuthActionSearchParams,
  fallbackLocale: Locale,
): AuthActionResolution {
  const { mode, oobCode, lang } = searchParams;

  if (!isSupportedAuthActionMode(mode)) {
    return { status: 'error', reason: 'unsupportedMode' };
  }

  if (oobCode === undefined || oobCode.trim() === '') {
    return { status: 'error', reason: 'missingCode' };
  }

  return {
    status: 'redirect',
    pathname: AUTH_ACTION_TARGETS[mode],
    // `mode` is forwarded so the destination page can keep validating it.
    query: { mode, oobCode },
    locale: resolveActionLocale(lang, fallbackLocale),
  };
}
