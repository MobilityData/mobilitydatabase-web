import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withSentryConfig(withNextIntl(nextConfig), {
  // For all available options, see:

  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Upload source maps for readable stack traces (only when auth token is present)
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Prevents Sentry from attempting to build when there is no auth token
  silent: !process.env.SENTRY_AUTH_TOKEN,
});
