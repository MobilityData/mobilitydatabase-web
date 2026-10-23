import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** GTFS diff v2 files, read from disk at runtime (src/lib/gtfs-diff-datasets.ts). */
const GTFS_DIFF_FILES = [
  './src/app/screens/GtfsDiffTool/data/v2/**/*.json',
  './src/app/screens/GtfsDiffTool/data/v2/**/*.parquet',
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Serverless functions only bundle files they import; the diff files are
  // read by path, so list them for the routes that read them: the file API
  // (Parquet range reads) and the diff pages rendered on demand.
  outputFileTracingIncludes: {
    '/api/gtfs-diff-v2/**': GTFS_DIFF_FILES,
    '/*/gtfs-diff-tool-v2/**': GTFS_DIFF_FILES,
  },
};

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
