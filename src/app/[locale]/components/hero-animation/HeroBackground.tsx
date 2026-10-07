'use client';

import dynamic from 'next/dynamic';
import { prefetchJourneyData } from './montreal-journey';

// Montréal journey variant of HeroBackground. Loaded client-only so three.js
// stays out of the page's initial bundle; the scene fetches its basemap tiles
// and fades itself in once they've settled.
//
// Both the chunk and the data start at module scope rather than on mount, so
// they download in parallel with hydration instead of after it. Left to
// `dynamic`'s defaults the chunk only starts once this component first
// renders and the fetch only once its effect runs, which measured about two
// seconds later. Guarded on `window` because a 'use client' module still
// executes during the server render, where the chunk is dead weight and the
// relative fetch URL has no origin.
const importScene = async (): Promise<
  typeof import('./AccessibilityBackgroundSurface')
> => await import('./AccessibilityBackgroundSurface');

let started: ReturnType<typeof importScene> | null = null;
if (typeof window !== 'undefined') {
  prefetchJourneyData();
  started = importScene();
  // `dynamic` handles the rejection too, once it awaits the same promise;
  // this only keeps a failed chunk load from surfacing as an unhandled one.
  started.catch(() => {});
}

const HeroBackground = dynamic(async () => await (started ?? importScene()), {
  ssr: false,
});

export default HeroBackground;
