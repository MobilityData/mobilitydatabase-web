import { type RootState } from './store';
import { type GBFSFeedMetrics } from '../utils/analytics-types';

// Selector to get the GBFS feed metrics
export const selectGBFSFeedMetrics = (state: RootState): GBFSFeedMetrics[] =>
  state.gbfsAnalytics.feedMetrics;

// Selector to get the status of the GBFS analytics
export const selectGBFSAnalyticsStatus = (
  state: RootState,
): 'loading' | 'loaded' | 'failed' => state.gbfsAnalytics.status;

// Selector to get any error messages from GBFS analytics
export const selectGBFSAnalyticsError = (
  state: RootState,
): string | undefined => state.gbfsAnalytics.error;
