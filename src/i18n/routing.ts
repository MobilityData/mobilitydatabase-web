import { defineRouting } from 'next-intl/routing';

export const AVAILABLE_LOCALES = ['en', 'fr'] as const;

/**
 * Centralized routing configuration for next-intl.
 *
 * - English (en): Default locale, no prefix in URL (/)
 * - French (fr): Prefixed URL (/fr)
 */
export const routing = defineRouting({
  locales: AVAILABLE_LOCALES,
  defaultLocale: 'en',
  // Don't show /en prefix for default locale
  localePrefix: 'as-needed',
  // Don't auto-detect locale from Accept-Language header
  // Users must explicitly navigate to /fr to get French
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
