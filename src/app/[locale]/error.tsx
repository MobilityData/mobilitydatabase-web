'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import SentryErrorFallback from '../components/SentryErrorFallback';

/**
 * Next.js App Router error boundary for the [locale] segment.
 * Captures rendering errors and forwards them to Sentry.
 * See: https://nextjs.org/docs/app/building-your-application/routing/error-handling
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return <SentryErrorFallback error={error} resetError={reset} />;
}
