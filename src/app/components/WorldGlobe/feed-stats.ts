import {
  FEED_COUNTS_BY_COUNTRY,
  type SubdivisionFeedCount,
} from './feed-counts';

export const TOP_SUBDIVISION_COUNT = 5;

/**
 * When the counts in `feed-counts.ts` were taken. They're a committed
 * snapshot, not live data, so the coverage section says so — update this
 * whenever that file is regenerated. Midday UTC, so the date reads the same
 * whatever timezone formats it.
 */
export const FEED_COUNTS_AS_OF = new Date('2026-10-07T12:00:00Z');

export interface CountryStats {
  iso2: string;
  name: string;
  feedCount: number;
  topSubdivisions: SubdivisionFeedCount[];
  /** Subdivisions with feeds that didn't make the top list. */
  remainingSubdivisionCount: number;
}

export const MAX_COUNTRY_FEED_COUNT = Math.max(
  ...Object.values(FEED_COUNTS_BY_COUNTRY).map((c) => c.feedCount),
);

export function getCountryStats(
  iso2: string,
  fallbackName: string,
  topCount = TOP_SUBDIVISION_COUNT,
): CountryStats {
  const entry = FEED_COUNTS_BY_COUNTRY[iso2];
  const subdivisions = entry?.subdivisions ?? [];
  return {
    iso2,
    name: fallbackName || entry?.name || iso2,
    feedCount: entry?.feedCount ?? 0,
    topSubdivisions: subdivisions.slice(0, topCount),
    remainingSubdivisionCount: Math.max(subdivisions.length - topCount, 0),
  };
}

/**
 * Log-scaled 0..1 shade for a country's feed count. Linear scaling would
 * leave everything but the US near-empty (2,944 vs. a median in the tens).
 */
export function feedCountIntensity(
  feedCount: number,
  maxFeedCount = MAX_COUNTRY_FEED_COUNT,
): number {
  if (feedCount <= 0 || maxFeedCount <= 0) return 0;
  return Math.min(Math.log1p(feedCount) / Math.log1p(maxFeedCount), 1);
}

export function formatFeedCount(feedCount: number): string {
  return `${feedCount.toLocaleString('en-US')} ${
    feedCount === 1 ? 'feed' : 'feeds'
  }`;
}

// Regional indicator symbols: each letter maps to U+1F1E6..U+1F1FF.
export function iso2ToFlagEmoji(iso2: string): string {
  if (!/^[A-Za-z]{2}$/.test(iso2)) return '';
  return String.fromCodePoint(
    ...[...iso2.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)),
  );
}
