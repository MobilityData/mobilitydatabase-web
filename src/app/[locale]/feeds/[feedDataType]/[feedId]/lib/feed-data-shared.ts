/**
 * Shared feed data fetching implementations.
 * Used by both authenticated and guest feed data loaders.
 */

import 'server-only';
import {
  getFeed,
  getGtfsFeed,
  getGbfsFeed,
  getGtfsRtFeed,
  getGtfsFeedDatasets,
  getGtfsFeedRoutes,
  getGtfsFeedAssociatedGtfsRtFeeds,
} from '../../../../../services/feeds';
import {
  type GTFSFeedType,
  type GTFSRTFeedType,
  type AllFeedType,
} from '../../../../../services/feeds/utils';
import type { components } from '../../../../../services/feeds/types';
import type { GtfsRoute } from '../../../../../types';

type DatasetType = components['schemas']['GtfsDataset'];

export interface FeedDataResult {
  feed: AllFeedType;
  feedDataType: string;
  initialDatasets: DatasetType[];
  relatedFeeds: GTFSFeedType[];
  relatedGtfsRtFeeds: GTFSRTFeedType[];
  totalRoutes?: number;
  routeTypes?: string[];
  routes?: GtfsRoute[];
}

/**
 * Fetch feed by type with provided credentials.
 */
export async function fetchFeedByType(
  feedDataType: string,
  feedId: string,
  accessToken: string,
  userContextJwt: string | undefined,
): Promise<AllFeedType | undefined> {
  let feed;
  if (feedDataType === 'gtfs') {
    feed = await getGtfsFeed(feedId, accessToken, userContextJwt);
  } else if (feedDataType === 'gtfs_rt') {
    feed = await getGtfsRtFeed(feedId, accessToken, userContextJwt);
  } else if (feedDataType === 'gbfs') {
    feed = await getGbfsFeed(feedId, accessToken, userContextJwt);
  } else {
    feed = await getFeed(feedId, accessToken, userContextJwt);
  }
  return feed;
}

/**
 * Fetch datasets for a GTFS feed.
 */
export async function fetchDatasets(
  feedId: string,
  accessToken: string,
  userContextJwt: string | undefined,
): Promise<DatasetType[]> {
  try {
    const datasets = await getGtfsFeedDatasets(
      feedId,
      accessToken,
      { limit: 10 },
      userContextJwt,
    );
    return datasets ?? [];
  } catch (e) {
    return [];
  }
}

/**
 * Fetch related feeds for GTFS-RT feeds.
 * Returns both GTFS and GTFS-RT related feeds.
 */
export async function fetchRelatedFeeds(
  feedReferences: string[],
  accessToken: string,
  userContextJwt: string | undefined,
): Promise<{ gtfsFeeds: GTFSFeedType[]; gtfsRtFeeds: GTFSRTFeedType[] }> {
  try {
    const feedPromises = feedReferences.map(
      async (feedId) =>
        await getFeed(feedId, accessToken, userContextJwt).catch(
          () => undefined,
        ),
    );
    const feeds = await Promise.all(feedPromises);

    const validFeeds = feeds.filter((f) => f !== undefined);
    const gtfsFeeds = validFeeds.filter(
      (f) => f?.data_type === 'gtfs',
    ) as GTFSFeedType[];
    const gtfsRtFeeds = validFeeds.filter(
      (f) => f?.data_type === 'gtfs_rt',
    ) as GTFSRTFeedType[];

    return { gtfsFeeds, gtfsRtFeeds };
  } catch (e) {
    return { gtfsFeeds: [], gtfsRtFeeds: [] };
  }
}

/**
 * Fetch routes data for GTFS feeds.
 * Returns total routes count, unique route types, and routes array.
 */
export async function fetchRoutesData(
  feedId: string,
  datasetId: string,
): Promise<{
  totalRoutes?: number;
  routeTypes?: string[];
  routes?: GtfsRoute[];
}> {
  try {
    const routes = await getGtfsFeedRoutes(feedId, datasetId);
    if (routes == null) {
      return {
        totalRoutes: undefined,
        routeTypes: undefined,
        routes: undefined,
      };
    }

    const totalRoutes = routes.length;

    // Extract unique route types and sort them
    const uniqueRouteTypesSet = new Set<string>();
    for (const route of routes) {
      const raw = route.routeType;
      const routeTypeStr = raw == null ? undefined : String(raw).trim();
      if (routeTypeStr != null) {
        uniqueRouteTypesSet.add(routeTypeStr);
      }
    }

    const routeTypes = Array.from(uniqueRouteTypesSet).sort((a, b) => {
      const validNumberA = a.trim() !== '' && Number.isFinite(Number(a));
      const validNumberB = b.trim() !== '' && Number.isFinite(Number(b));
      if (!validNumberA && !validNumberB) return a.localeCompare(b);
      if (!validNumberA || !validNumberB) return validNumberA ? -1 : 1;
      return Number(a) - Number(b);
    });

    return { totalRoutes, routeTypes, routes };
  } catch (e) {
    return {
      totalRoutes: undefined,
      routeTypes: undefined,
      routes: undefined,
    };
  }
}

/**
 * Fetch all data needed for a feed page.
 * Core implementation used by both authenticated and guest loaders.
 */
export async function fetchCompleteFeedDataImpl(
  feedDataType: string,
  feedId: string,
  accessToken: string,
  userContextJwt: string | undefined,
): Promise<FeedDataResult> {
  // Fetch core feed data
  const feed = await fetchFeedByType(
    feedDataType,
    feedId,
    accessToken,
    userContextJwt,
  );
  if (feed == null) {
    throw new Error(`Feed ${feedId} not found`);
  }

  // Fetch datasets and routes in parallel for GTFS feeds
  let initialDatasets: DatasetType[] = [];
  let totalRoutes: number | undefined;
  let routeTypes: string[] | undefined;
  let routes: GtfsRoute[] | undefined;

  if (feedDataType === 'gtfs') {
    const [datasetsResult, routesResult] = await Promise.all([
      fetchDatasets(feedId, accessToken, userContextJwt),
      fetchRoutesData(
        feedId,
        (feed as GTFSFeedType)?.visualization_dataset_id ?? '',
      ),
    ]);
    initialDatasets = datasetsResult;
    totalRoutes = routesResult.totalRoutes;
    routeTypes = routesResult.routeTypes;
    routes = routesResult.routes;
  }

  // Fetch related feeds for GTFS-RT
  let gtfsFeedsRelated: GTFSFeedType[] = [];
  let gtfsRtFeedsRelated: GTFSRTFeedType[] = [];

  if (feed.data_type === 'gtfs_rt') {
    const gtfsRtFeed = feed as GTFSRTFeedType;
    const { gtfsFeeds, gtfsRtFeeds } = await fetchRelatedFeeds(
      gtfsRtFeed?.feed_references ?? [],
      accessToken,
      userContextJwt,
    );

    const associatedGtfsRtFeedsArrays = await Promise.all(
      gtfsFeeds.map(
        async (gtfsFeed) =>
          await getGtfsFeedAssociatedGtfsRtFeeds(
            gtfsFeed?.id ?? '',
            accessToken,
            userContextJwt,
          ),
      ),
    );

    gtfsFeedsRelated = gtfsFeeds;

    // Deduplicate GTFS-RT feeds
    const allGtfsRtFeeds = [
      ...gtfsRtFeeds,
      ...associatedGtfsRtFeedsArrays.flat(),
    ];
    const uniqueGtfsRtFeedsMap = new Map();
    allGtfsRtFeeds.forEach((feedItem) => {
      if (feedItem?.id != null) {
        uniqueGtfsRtFeedsMap.set(feedItem.id, feedItem);
      }
    });
    gtfsRtFeedsRelated = Array.from(uniqueGtfsRtFeedsMap.values());
  }

  return {
    feed,
    feedDataType,
    initialDatasets,
    relatedFeeds: gtfsFeedsRelated,
    relatedGtfsRtFeeds: gtfsRtFeedsRelated,
    totalRoutes,
    routeTypes,
    routes,
  };
}
