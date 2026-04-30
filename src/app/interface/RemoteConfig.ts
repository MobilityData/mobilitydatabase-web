export type GbfsVersionConfig = string[];

// FEATUTRE BYPASS CURRENTLY DISABLED
export interface RemoteConfigValues {
  [key: string]: boolean | number | string;
  enableLanguageToggle: boolean;
  /** Enable Metrics view
   * Values:
   * true: renders the metrics view
   * false: hides the metrics view
   */
  enableMetrics: boolean;
  /** GTFS metrics' bucket endpoint */
  gtfsMetricsBucketEndpoint: string;
  /** GBFS metrics' bucket endpoint */
  gbfsMetricsBucketEndpoint: string;
  featureFlagBypass: string;
  enableFeedStatusBadge: boolean;
  gbfsVersions: string;

  /** Max number of data stuff to display on top of the map to avoid overflow */
  visualizationMapPreviewDataLimit: number;
  visualizationMapFullDataLimit: number;

  // This feature flag enable or the coovered area component with expected behavior:
  // 1- hides/shows the toggle button for gtfs feeds
  // 2- use bounding box view for GBFS instead of full covered area map
  enableDetailedCoveredArea: boolean;
  gbfsValidator: boolean;
  gtfsFeatureTracker: boolean;
}

const gbfsVersionsDefault: GbfsVersionConfig = [];

// Add default values for remote config here
export const defaultRemoteConfigValues: RemoteConfigValues = {
  enableLanguageToggle: false,
  enableMetrics: false,
  gtfsMetricsBucketEndpoint:
    'https://storage.googleapis.com/mobilitydata-gtfs-analytics-dev',
  gbfsMetricsBucketEndpoint:
    'https://storage.googleapis.com/mobilitydata-gbfs-analytics-dev',
  featureFlagBypass: '',
  enableFeedStatusBadge: false,
  gbfsVersions: JSON.stringify(gbfsVersionsDefault),
  visualizationMapFullDataLimit: 5,
  visualizationMapPreviewDataLimit: 3,
  enableDetailedCoveredArea: false,
  gbfsValidator: false,
  gtfsFeatureTracker: false,
};

/**
 * Returns true if the given email matches any regex pattern in the
 * featureFlagBypass config value (format: `{ "regex": [".+@example.org"] }`).
 */
export function matchesFeatureFlagBypass(
  email: string | null | undefined,
  featureFlagBypass: string,
): boolean {
  if (email == null || email === '' || featureFlagBypass === '') return false;
  try {
    const parsed = JSON.parse(featureFlagBypass) as { regex?: unknown };
    if (!Array.isArray(parsed.regex)) return false;
    return (parsed.regex as string[]).some((pattern) =>
      new RegExp(pattern).test(email),
    );
  } catch {
    return false;
  }
}
