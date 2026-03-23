import type { Metadata } from 'next';
import type {
  AllFeedType,
  GBFSFeedType,
  GTFSFeedType,
  GTFSRTFeedType,
} from '../../../../../services/feeds/utils';
import {
  formatProvidersSorted,
  generatePageTitle,
  generateDescriptionMetaTag,
  generateMapPageTitle,
  generateMapDescriptionMetaTag,
} from '../../../../../screens/Feed/Feed.functions';

/**
 * Structured data is purely for SEO purposes.
 * It helps search engines understand the content of the page better.
 * It is not used in the application logic.
 * It is not displayed to the user.
 */

type StructureDataInterface = Record<string, unknown>;

function getBasicStructuredData(
  feed: AllFeedType,
  description: string,
): StructureDataInterface {
  const dataTypeNaming =
    feed?.data_type === 'gtfs_rt' ? 'GTFS Realtime' : feed?.data_type;

  const structuredData: StructureDataInterface = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    isAccessibleForFree: true,
    name: `${dataTypeNaming ?? ''} Feed for ${feed?.provider}`,
    description,
    url: `https://mobilitydatabase.org/feeds/${feed?.data_type}/${feed?.id}`,
    license: feed?.source_info?.license_url,
    creator: {
      '@type': 'Organization',
      name: feed?.provider,
    },
    provider: {
      '@type': 'Organization',
      name: 'MobilityData',
      url: 'https://mobilitydata.org/',
    },
  };
  return structuredData;
}

function generateLocationStructuredData(
  feed: GTFSFeedType | GBFSFeedType,
  bb: {
    minimum_latitude?: number;
    minimum_longitude?: number;
    maximum_latitude?: number;
    maximum_longitude?: number;
  },
): StructureDataInterface {
  const municipalities =
    feed?.locations
      ?.map((location) => location.municipality)
      .filter((municipality) => municipality !== undefined) ?? [];
  const name =
    municipalities.length > 0
      ? `${municipalities.slice(0, 3).join(', ')}${
          municipalities.length > 3 ? ', and others' : ''
        }`
      : 'Transit coverage area';
  return {
    '@type': 'Place',
    name,
    geo: {
      '@type': 'GeoShape',
      box: `${bb.minimum_latitude} ${bb.minimum_longitude} ${bb.maximum_latitude} ${bb.maximum_longitude}`,
    },
  };
}

function getGtfsStructuredData(
  feed: GTFSFeedType,
  description: string,
): StructureDataInterface {
  const structuredGtfsData: StructureDataInterface = {
    ...getBasicStructuredData(feed, description),
    identifier: feed?.id,
    keywords: [
      'gtfs',
      'data',
      'public transit',
      'schedule data',
      'transportation',
    ],
    distribution: {
      '@type': 'DataDownload',
      encodingFormat: 'application/zip',
      contentUrl: feed?.latest_dataset?.hosted_url,
    },

    dateModified: feed?.latest_dataset?.downloaded_at ?? feed?.created_at,
  };

  if (feed?.latest_dataset?.hosted_url != null) {
    structuredGtfsData.distribution = {
      '@type': 'DataDownload',
      encodingFormat: 'application/zip',
      contentUrl: feed?.latest_dataset?.hosted_url,
    };
  }

  if (feed?.latest_dataset?.bounding_box != null) {
    structuredGtfsData.spatialCoverage = generateLocationStructuredData(
      feed,
      feed?.latest_dataset?.bounding_box,
    );
  }

  if (feed?.latest_dataset?.validation_report?.features != null) {
    structuredGtfsData.variableMeasured =
      feed.latest_dataset.validation_report.features.map((feature) => ({
        '@type': 'PropertyValue',
        name: feature,
      }));
  }

  return structuredGtfsData;
}

function getGbfsStructuredData(
  feed: GBFSFeedType,
  description: string,
): StructureDataInterface {
  const structuredGbfsData: StructureDataInterface = {
    ...getBasicStructuredData(feed, description),
    identifier: feed?.system_id,
    keywords: [
      'GBFS',
      'shared mobility',
      'micromobility',
      'bike share',
      'scooter share',
      'real-time data',
    ],
    creator: {
      '@type': 'Organization',
      name: feed?.provider,
      url: feed?.provider_url,
    },
    spatialCoverage: feed?.locations?.map((location) => ({
      '@type': 'Place',
      name: 'Location for ' + feed?.provider,
      address: {
        '@type': 'PostalAddress',
        addressLocality: location.municipality,
        addressRegion: location.subdivision_name,
        addressCountry: location.country_code,
      },
    })),
    dateModified: feed?.versions?.[0]?.created_at ?? feed?.created_at,
  };

  if (feed?.versions != null && feed?.versions.length > 0) {
    structuredGbfsData.hasPart = feed.versions.map((version) => ({
      '@type': 'DataFeed',
      name:
        `GBFS ${version.version} Feed` +
        (version.source === 'autodiscovery' ? ' - Autodiscovery Url' : ''),
      url: version.endpoints?.find((endpoint) => endpoint.name === 'gbfs')?.url,
      encodingFormat: 'application/json',
    }));
  }

  return structuredGbfsData;
}

function getGtfsRtStructuredData(
  feed: GTFSRTFeedType,
  description: string,
  relatedFeeds?: GTFSRTFeedType[],
  relatedGtfsFeeds?: GTFSFeedType[],
): StructureDataInterface {
  const associatedGtfsFeed: GTFSFeedType = relatedGtfsFeeds?.find(
    (relatedFeed) => relatedFeed?.data_type === 'gtfs',
  );

  const structuredGtfsRtData: StructureDataInterface = {
    ...getBasicStructuredData(feed, description),
    identifier: feed?.id,
    keywords: [
      'GTFS Realtime',
      'public transit',
      'real-time data',
      'trip updates',
      'vehicle positions',
      'service alerts',
    ],
    distribution: {
      '@type': 'DataDownload',
      encodingFormat: 'application/x-protobuf',
      contentUrl: feed?.source_info?.producer_url,
    },
    dateModified: feed?.created_at,
    hasPart: [],
  };

  if (associatedGtfsFeed?.latest_dataset?.bounding_box != null) {
    structuredGtfsRtData.spatialCoverage = generateLocationStructuredData(
      feed,
      associatedGtfsFeed?.latest_dataset?.bounding_box,
    );
  }

  if (associatedGtfsFeed != null) {
    relatedGtfsFeeds?.forEach((relatedGtfsFeed) => {
      (structuredGtfsRtData.hasPart as unknown[]).push({
        '@type': 'Dataset',
        name: `GTFS Static Feed for ${relatedGtfsFeed?.provider}`,
        description: `The GTFS static feed associated with this GTFS Realtime feed, if available.`,
        isAccessibleForFree: true,
        url: `https://mobilitydatabase.org/feeds/gtfs/${relatedGtfsFeed?.id}`,
        distribution: {
          '@type': 'DataDownload',
          encodingFormat: 'application/zip',
          contentUrl: relatedGtfsFeed?.source_info?.producer_url,
        },
      });
    });
  }
  if (relatedFeeds != null && relatedFeeds.length > 0) {
    relatedFeeds.forEach((relatedFeed) => {
      let name = `GTFS Realtime Feed for ${relatedFeed?.provider}`;

      if (relatedFeed?.entity_types != null) {
        if (relatedFeed.entity_types.includes('sa')) {
          name = `GTFS Realtime Service Alerts for ${relatedFeed?.provider}`;
        } else if (relatedFeed.entity_types.includes('tu')) {
          name = `GTFS Realtime Trip Updates for ${relatedFeed?.provider}`;
        } else if (relatedFeed.entity_types.includes('vp')) {
          name = `GTFS Realtime Vehicle Positions for ${relatedFeed?.provider}`;
        }
      }

      (structuredGtfsRtData.hasPart as unknown[]).push({
        '@type': 'Dataset',
        isAccessibleForFree: true,
        description: `A related GTFS Realtime feed for the same provider, with entity types ${relatedFeed?.entity_types?.join(', ')}`,
        name,
        url: `https://mobilitydatabase.org/feeds/gtfs_rt/${relatedFeed?.id}`,
        distribution: {
          '@type': 'DataDownload',
          encodingFormat: 'application/x-protobuf',
          contentUrl: relatedFeed?.source_info?.producer_url,
        },
      });
    });
  }

  return structuredGtfsRtData;
}

export default function generateFeedStructuredData(
  feed: AllFeedType,
  description: string,
  // For gtfs rt
  relatedFeeds?: AllFeedType[],
  relatedGtfsFeeds?: GTFSFeedType[],
): StructureDataInterface | undefined {
  let structuredData: StructureDataInterface | undefined;
  if (feed?.data_type === 'gtfs') {
    structuredData = getGtfsStructuredData(feed as GTFSFeedType, description);
  } else if (feed?.data_type === 'gbfs') {
    structuredData = getGbfsStructuredData(feed as GBFSFeedType, description);
  } else if (feed?.data_type === 'gtfs_rt') {
    structuredData = getGtfsRtStructuredData(
      feed as GTFSRTFeedType,
      description,
      relatedFeeds,
      relatedGtfsFeeds,
    );
  }

  return structuredData;
}

interface GenerateFeedMetadataParams {
  feed: AllFeedType | undefined;
  t: (key: string) => string;
}

/**
 * Shared metadata generation logic for feed pages (authed and static).
 *
 * @param feed - The feed data
 * @param t - Translation function
 */
export function generateFeedMetadata({
  feed,
  t,
}: GenerateFeedMetadataParams): Metadata {
  if (feed == null) {
    return {
      title: 'Feed Not Found | Mobility Database',
    };
  }
  const feedDataType = feed.data_type;
  const feedId = feed.id;
  const sortedProviders = formatProvidersSorted(feed?.provider ?? '');
  const title = generatePageTitle(
    sortedProviders,
    feedDataType as 'gtfs' | 'gtfs_rt' | 'gbfs',
    (feed as { feed_name?: string })?.feed_name,
  );
  const description = generateDescriptionMetaTag(
    t,
    sortedProviders,
    feedDataType as 'gtfs' | 'gtfs_rt' | 'gbfs',
    (feed as { feed_name?: string })?.feed_name,
  );

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://mobilitydatabase.org/feeds/${feedDataType}/${feedId}`,
      siteName: 'Mobility Database',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    alternates: {
      canonical: `https://mobilitydatabase.org/feeds/${feedDataType}/${feedId}`,
    },
  };
}

/**
 * Shared metadata generation logic for feed map pages (authed and static).
 *
 * Produces a unique title and description that reflect the interactive map
 * view, so that search engines can distinguish the map page from the main
 * feed detail page.
 *
 * @param feed - The feed data
 * @param t - Translation function
 */
export function generateMapFeedMetadata({
  feed,
  t,
}: GenerateFeedMetadataParams): Metadata {
  if (feed == null) {
    return {
      title: 'Feed Not Found | Mobility Database',
    };
  }
  const feedDataType = feed.data_type;
  const feedId = feed.id;
  const sortedProviders = formatProvidersSorted(feed?.provider ?? '');
  const title = generateMapPageTitle(
    sortedProviders,
    feedDataType as 'gtfs' | 'gtfs_rt' | 'gbfs',
    (feed as { feed_name?: string })?.feed_name,
  );
  const description = generateMapDescriptionMetaTag(
    t,
    sortedProviders,
    feedDataType as 'gtfs' | 'gtfs_rt' | 'gbfs',
    (feed as { feed_name?: string })?.feed_name,
  );

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://mobilitydatabase.org/feeds/${feedDataType}/${feedId}/map`,
      siteName: 'Mobility Database',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    alternates: {
      canonical: `https://mobilitydatabase.org/feeds/${feedDataType}/${feedId}/map`,
    },
  };
}
