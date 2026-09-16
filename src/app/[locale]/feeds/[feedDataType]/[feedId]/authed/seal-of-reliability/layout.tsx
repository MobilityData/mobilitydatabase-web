'use client';

import { type ReactElement, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { useUserFeatureFlags } from '../../../../../../hooks/useUserFeatureFlags';
import SealReliabilitySkeleton from '../../components/SealReliabilitySkeleton';

interface Props {
  children: ReactNode;
}

/**
 * Entitlement gate for the Seal of Reliability breakdown page.
 *
 * `isSealEnabled` is a per-user flag with no server-side read by design (see
 * docs/user-feature-flags.md), so this is the only place in the route where
 * its value exists. The guest half of the route is blocked server-side
 * instead — see the sibling `static/seal-of-reliability/page.tsx`.
 *
 * NOTE: This is a UX gate, not a security boundary. `children` is rendered on
 * the server regardless, so an unentitled user can still read the seal data
 * out of the RSC payload. If that matters, the feed API is the place to
 * enforce it — it already receives `x-mdb-user-context` on these calls, and
 * this segment's `error.tsx` handles the rejection.
 * 
 * Once the seal feature fully rolls out, this route guard will no longer be needed
 */
export default function AuthedFeedReliabilityLayout({
  children,
}: Props): ReactElement {
  const {
    flags: { isSealEnabled },
    isResolved,
  } = useUserFeatureFlags();

  // Pending is not the same as not-entitled: until the flags resolve the
  // value is a placeholder, so render the loading state rather than a 404.
  if (!isResolved) {
    return <SealReliabilitySkeleton />;
  }

  if (!isSealEnabled) {
    notFound();
  }

  return <>{children}</>;
}
