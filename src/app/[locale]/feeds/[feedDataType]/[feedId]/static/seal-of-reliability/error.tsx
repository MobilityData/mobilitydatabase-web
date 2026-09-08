'use client';

import SealReliabilityError from '../../components/SealReliabilityError';

/**
 * Next.js App Router error boundary for this segment.
 * See: https://nextjs.org/docs/app/building-your-application/routing/error-handling
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  return <SealReliabilityError error={error} reset={reset} />;
}
