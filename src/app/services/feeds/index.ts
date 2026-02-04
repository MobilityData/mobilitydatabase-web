import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './types';
import { type AllFeedsParams, type AllFeedType } from './utils';
import { type GtfsRoute } from '../../types';
import { getFeedFilesBaseUrl } from '../../utils/config';
import { generateAuthMiddlewareWithToken } from '../../context/api-auth-middleware';

const client = createClient<paths>({
  baseUrl: String(process.env.NEXT_PUBLIC_FEED_API_BASE_URL),
  querySerializer: {
    // serialize arrays as comma-separated values
    // More info: https://swagger.io/docs/specification/serialization/#query
    array: {
      style: 'form',
      explode: false,
    },
  },
});

const throwOnError: Middleware = {
  async onResponse(res) {
    if (res.status >= 400) {
      let body = await res.clone().text();
      if (res.headers.get('content-type')?.includes('json') === true) {
        body = await res.clone().json();
      }
      const errorMessage =
        typeof body === 'string' ? body : JSON.stringify(body);
      throw new Error(errorMessage);
    }
    return undefined;
  },
};

client.use(throwOnError);

async function withAuthMiddleware<T>(
  authMiddleware: Middleware,
  fn: () => Promise<T>,
): Promise<T> {
  client.use(authMiddleware);
  try {
    return await fn();
  } finally {
    client.eject(authMiddleware);
  }
}

export const getFeeds = async (): Promise<
  | paths['/v1/feeds']['get']['responses'][200]['content']['application/json']
  | undefined
> => {
  return await client
    .GET('/v1/feeds', { params: {} })
    .then((response) => {
      const data = response.data;
      return data;
    })
    .catch(function (error) {
      throw error;
    });
};

export const getFeed = async (
  feedId: string,
  accessToken: string,
  userContextJwt?: string,
): Promise<
  | paths['/v1/feeds/{id}']['get']['responses'][200]['content']['application/json']
  | undefined
> => {
  const authMiddleware = generateAuthMiddlewareWithToken(
    accessToken,
    userContextJwt,
  );
  return await withAuthMiddleware(authMiddleware, async () => {
    const response = await client.GET('/v1/feeds/{id}', {
      params: { path: { id: feedId } },
    });
    return response.data;
  });
};

export const getGtfsFeeds = async (): Promise<
  | paths['/v1/gtfs_feeds']['get']['responses'][200]['content']['application/json']
  | undefined
> => {
  return await client
    .GET('/v1/gtfs_feeds', { params: {} })
    .then((response) => {
      const data = response.data;
      return data;
    })
    .catch(function (error) {
      throw error;
    });
};

export const getGtfsRtFeeds = async (): Promise<
  | paths['/v1/gtfs_rt_feeds']['get']['responses'][200]['content']['application/json']
  | undefined
> => {
  return await client
    .GET('/v1/gtfs_rt_feeds', { params: {} })
    .then((response) => {
      const data = response.data;
      return data;
    })
    .catch(function (error) {
      throw error;
    });
};

export const getGtfsFeed = async (
  id: string,
  accessToken: string,
  userContextJwt?: string,
): Promise<AllFeedType> => {
  const authMiddleware = generateAuthMiddlewareWithToken(
    accessToken,
    userContextJwt,
  );
  return await withAuthMiddleware(authMiddleware, async () => {
    const response = await client.GET('/v1/gtfs_feeds/{id}', {
      params: { path: { id } },
    });
    return response.data as AllFeedType;
  });
};

export const getGtfsRtFeed = async (
  id: string,
  accessToken: string,
  userContextJwt?: string,
): Promise<
  | paths['/v1/gtfs_rt_feeds/{id}']['get']['responses'][200]['content']['application/json']
  | undefined
> => {
  const authMiddleware = generateAuthMiddlewareWithToken(
    accessToken,
    userContextJwt,
  );
  return await withAuthMiddleware(authMiddleware, async () => {
    const response = await client.GET('/v1/gtfs_rt_feeds/{id}', {
      params: { path: { id } },
    });
    return response.data;
  });
};

export const getGbfsFeed = async (
  id: string,
  accessToken: string,
  userContextJwt?: string,
): Promise<
  | paths['/v1/gbfs_feeds/{id}']['get']['responses'][200]['content']['application/json']
  | undefined
> => {
  const authMiddleware = generateAuthMiddlewareWithToken(
    accessToken,
    userContextJwt,
  );
  return await withAuthMiddleware(authMiddleware, async () => {
    const response = await client.GET('/v1/gbfs_feeds/{id}', {
      params: { path: { id } },
    });
    return response.data;
  });
};

export const getGtfsFeedAssociatedGtfsRtFeeds = async (
  id: string,
  accessToken: string,
  userContextJwt?: string,
): Promise<
  | paths['/v1/gtfs_feeds/{id}/gtfs_rt_feeds']['get']['responses'][200]['content']['application/json']
  | undefined
> => {
  const authMiddleware = generateAuthMiddlewareWithToken(
    accessToken,
    userContextJwt,
  );
  return await withAuthMiddleware(authMiddleware, async () => {
    const response = await client.GET('/v1/gtfs_feeds/{id}/gtfs_rt_feeds', {
      params: { path: { id } },
    });
    return response.data;
  });
};

export const getGtfsFeedDatasets = async (
  id: string,
  accessToken: string,
  userContextJwt?: string,
  queryParams?: paths['/v1/gtfs_feeds/{id}/datasets']['get']['parameters']['query'],
): Promise<
  | paths['/v1/gtfs_feeds/{id}/datasets']['get']['responses'][200]['content']['application/json']
  | undefined
> => {
  const authMiddleware = generateAuthMiddlewareWithToken(
    accessToken,
    userContextJwt,
  );
  return await withAuthMiddleware(authMiddleware, async () => {
    const response = await client.GET('/v1/gtfs_feeds/{id}/datasets', {
      params: { query: queryParams, path: { id } },
    });
    return response.data;
  });
};

export const getDatasetGtfs = async (
  id: string,
  accessToken: string,
  userContextJwt?: string,
): Promise<
  | paths['/v1/datasets/gtfs/{id}']['get']['responses'][200]['content']['application/json']
  | undefined
> => {
  const authMiddleware = generateAuthMiddlewareWithToken(
    accessToken,
    userContextJwt,
  );
  return await withAuthMiddleware(authMiddleware, async () => {
    const response = await client.GET('/v1/datasets/gtfs/{id}', {
      params: { path: { id } },
    });
    return response.data;
  });
};

export const getMetadata = async (): Promise<
  | paths['/v1/metadata']['get']['responses'][200]['content']['application/json']
  | undefined
> => {
  return await client
    .GET('/v1/metadata', { params: {} })
    .then((response) => {
      const data = response.data;
      return data;
    })
    .catch(function (error) {
      throw error;
    });
};

export const searchFeeds = async (
  params: AllFeedsParams,
  accessToken: string,
  userContextJwt?: string,
): Promise<
  | paths['/v1/search']['get']['responses'][200]['content']['application/json']
  | undefined
> => {
  const authMiddleware = generateAuthMiddlewareWithToken(
    accessToken,
    userContextJwt,
  );
  return await withAuthMiddleware(authMiddleware, async () => {
    const response = await client.GET('/v1/search', { params });
    return response.data;
  });
};

export const getLicense = async (
  id: string,
  accessToken: string,
  userContextJwt?: string,
): Promise<
  | paths['/v1/licenses/{id}']['get']['responses'][200]['content']['application/json']
  | undefined
> => {
  const authMiddleware = generateAuthMiddlewareWithToken(
    accessToken,
    userContextJwt,
  );
  return await withAuthMiddleware(authMiddleware, async () => {
    const response = await client.GET('/v1/licenses/{id}', {
      params: { path: { id } },
    });
    return response.data;
  });
};

/**
 * Builds the URL for the routes.json file for a given feed and dataset.
 * @param feedId - The feed ID
 * @param datasetId - The dataset ID (visualization_dataset_id )
 * @returns The URL for the routes.json file
 */
export function buildRoutesUrl(feedId: string, datasetId: string): string {
  return `${getFeedFilesBaseUrl()}/${feedId}/${datasetId}/pmtiles/routes.json`;
}

/**
 * Fetches the routes.json data for a GTFS feed.
 * @param feedId - The feed ID
 * @param datasetId - The dataset ID (visualization_dataset_id)
 * @returns An array of GtfsRoute objects, or undefined if the fetch fails
 */
export const getGtfsFeedRoutes = async (
  feedId: string,
  datasetId: string,
): Promise<GtfsRoute[] | undefined> => {
  const url = buildRoutesUrl(feedId, datasetId);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return undefined;
    }
    return (await res.json()) as GtfsRoute[];
  } catch (error) {
    return undefined;
  }
};
