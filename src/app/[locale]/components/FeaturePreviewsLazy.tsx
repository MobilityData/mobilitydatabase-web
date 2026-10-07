'use client';

import dynamic from 'next/dynamic';

// The feature cards' previews are decorative mock-ups of the real UI: the
// search results name real agencies, the API sample carries a real-looking
// feed id, and the tracker table shows made-up coverage. `aria-hidden` keeps
// that out of screen readers, but it does nothing for the crawlers that read
// raw HTML without running JavaScript — most AI agents — which would extract
// "Île-de-France Mobilités … France (1319)" as if the page claimed it.
//
// Loading them client-only is what actually settles that: the server-rendered
// HTML carries the headings, descriptions and links and none of the mock
// data. They sit well below the fold in fixed-height tiles, so nothing moves
// when they arrive, and the previews' own chunk stays out of the first load.

const previews = async (): Promise<typeof import('./FeaturePreviews')> =>
  await import('./FeaturePreviews');

export const SearchPreview = dynamic(
  async () => (await previews()).SearchPreview,
  { ssr: false },
);

export const ApiPreview = dynamic(async () => (await previews()).ApiPreview, {
  ssr: false,
});

export const TrackerPreview = dynamic(
  async () => (await previews()).TrackerPreview,
  { ssr: false },
);
