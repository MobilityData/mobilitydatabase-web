// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import packageJson from './package.json';

// Helper to safely parse Sentry sample rates from environment variables
const parseSampleRate = (
  value: string | undefined,
  defaultValue: number,
): number => {
  const parsed = parseFloat(value ?? String(defaultValue));
  if (isNaN(parsed) || parsed < 0 || parsed > 1) {
    return defaultValue;
  }
  return parsed;
};

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? '';
const environment =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
  process.env.NODE_ENV ??
  'mobility-feeds-dev';
const release = packageJson.version;
const tracesSampleRate = parseSampleRate(
  process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  0.05,
);

if (dsn.length > 0) {
  Sentry.init({
    dsn,
    environment,
    release,

    // Adjust this value in production, or use tracesSampler for greater control
    tracesSampleRate,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,
  });
}
