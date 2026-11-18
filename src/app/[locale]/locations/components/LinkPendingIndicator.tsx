'use client';

import { type ReactElement } from 'react';
import { LinearProgress } from '@mui/material';
import { keyframes } from '@mui/material/styles';
// useLinkStatus is not re-exported by i18n/navigation; it reads the status of
// the nearest enclosing Link, which next-intl's Link renders under the hood.
import { useLinkStatus } from 'next/link';

// Fast navigations finish before the bar shows, so it never flashes.
const appearAfterDelay = keyframes`
  to { opacity: 1; }
`;

interface Props {
  ariaLabel: string;
}

/**
 * Thin bar along the bottom of the enclosing Link while its navigation is
 * pending. Must render inside a Link; the Link needs `position: relative`.
 */
export default function LinkPendingIndicator({
  ariaLabel,
}: Props): ReactElement | null {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <LinearProgress
      aria-label={ariaLabel}
      sx={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 3,
        opacity: 0,
        animation: `${appearAfterDelay} 0s 150ms forwards`,
      }}
    />
  );
}
