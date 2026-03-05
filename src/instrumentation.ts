/**
 * Next.js Instrumentation
 *
 * This file handles:
 * 1. Sentry server-side initialization (via @sentry/nextjs)
 * 2. MSW (Mock Service Worker) for API mocking during e2e tests
 *
 * MSW is only enabled when NEXT_PUBLIC_API_MOCKING is set to 'enabled'
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Initialize Sentry for the Node.js runtime
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Initialize Sentry for the Edge runtime
    await import('../sentry.edge.config');
  }

  if (process.env.NEXT_PUBLIC_API_MOCKING === 'enabled') {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      const { server } = await import('./mocks/server');
      server.listen({
        onUnhandledRequest: 'bypass', // Don't warn about unhandled requests
      });
      console.log('🔶 MSW Server started for API mocking');
    }
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
