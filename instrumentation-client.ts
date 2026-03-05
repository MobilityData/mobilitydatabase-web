// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a user loads a page in their browser.
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
const replaysSessionSampleRate = parseSampleRate(
  process.env.NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE,
  0.0,
);
const replaysOnErrorSampleRate = parseSampleRate(
  process.env.NEXT_PUBLIC_SENTRY_REPLAY_ERROR_SAMPLE_RATE,
  1.0,
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

    replaysOnErrorSampleRate,
    replaysSessionSampleRate,

    // You can add integrations below. The Replay integration is enabled by
    // default when replaysSessionSampleRate or replaysOnErrorSampleRate > 0.
    integrations: [Sentry.replayIntegration()],

    ignoreErrors: [/ResizeObserver loop limit exceeded/i],

    beforeSend(event) {
      // Remove user IP and geo context for privacy
      if (event.user != null) {
        delete event.user.ip_address;
      }
      if (event.contexts?.geo != null) {
        delete event.contexts.geo;
      }
      return event;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
