import { defineRouting } from 'next-intl/routing';

/**
 * Centralized routing configuration for next-intl.
 * 
 * - English (en): Default locale, no prefix in URL (/)
 * - French (fr): Prefixed URL (/fr)
 */
export const routing = defineRouting({
  locales: ['en', 'fr'],
  defaultLocale: 'en',
  // Don't show /en prefix for default locale
  localePrefix: 'as-needed',
  // Don't auto-detect locale from Accept-Language header
  // Users must explicitly navigate to /fr to get French
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
