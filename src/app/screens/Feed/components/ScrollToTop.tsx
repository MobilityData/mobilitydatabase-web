'use client';

import { useEffect } from 'react';

/**
 * Scrolls the window to the top on mount.
 * Fixes the case where navigating from a scrolled search results page
 * leaves the feed detail page rendered at a non-zero scroll position.
 */
export default function ScrollToTop(): null {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  return null;
}
