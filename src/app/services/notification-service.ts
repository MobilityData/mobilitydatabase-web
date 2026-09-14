import createClient from 'openapi-fetch';
import type { components, paths } from './user-service-api-types';
import { generateAuthMiddlewareWithToken } from './api-auth-middleware';
import { getUserAccessToken } from './profile-service';

export type NotificationSubscription =
  components['schemas']['NotificationSubscription'];

export type SubscriptionFeed = components['schemas']['SubscriptionFeed'];

export type CreateNotificationSubscriptionRequest =
  components['schemas']['CreateNotificationSubscriptionRequest'];

/**
 * Shared SWR cache key for the current user's notification subscriptions,
 * so any component reading or mutating the list stays in sync.
 */
export const USER_SUBSCRIPTIONS_SWR_KEY = 'user-subscriptions';

const userServiceClient = createClient<paths>({
  baseUrl: String(process.env.NEXT_PUBLIC_FEED_API_BASE_URL),
});

/**
 * Retrieve all notification subscriptions for the current user.
 */
export const getUserSubscriptions = async (): Promise<
  NotificationSubscription[]
> => {
  const accessToken = await getUserAccessToken();
  const authMiddleware = generateAuthMiddlewareWithToken(accessToken);
  userServiceClient.use(authMiddleware);
  try {
    const { data, error } = await userServiceClient.GET(
      '/v1/user/subscriptions',
    );
    if (error !== undefined) {
      throw new Error('Failed to retrieve user subscriptions');
    }
    return data ?? [];
  } finally {
    userServiceClient.eject(authMiddleware);
  }
};

/**
 * Activate or deactivate a notification subscription by ID.
 */
export const updateUserSubscription = async (
  id: string,
  active: boolean,
): Promise<NotificationSubscription> => {
  const accessToken = await getUserAccessToken();
  const authMiddleware = generateAuthMiddlewareWithToken(accessToken);
  userServiceClient.use(authMiddleware);
  try {
    const { data, error } = await userServiceClient.PATCH(
      '/v1/user/subscriptions/{id}',
      {
        params: { path: { id } },
        body: { active },
      },
    );
    if (error !== undefined || data === undefined) {
      throw new Error('Failed to update user subscription');
    }
    return data;
  } finally {
    userServiceClient.eject(authMiddleware);
  }
};

/**
 * Subscribe the current user to a notification type, optionally scoped to
 * specific feeds.
 */
export const createUserSubscription = async (
  request: CreateNotificationSubscriptionRequest,
): Promise<NotificationSubscription> => {
  const accessToken = await getUserAccessToken();
  const authMiddleware = generateAuthMiddlewareWithToken(accessToken);
  userServiceClient.use(authMiddleware);
  try {
    const { data, error } = await userServiceClient.POST(
      '/v1/user/subscriptions',
      {
        body: request,
      },
    );
    if (error !== undefined || data === undefined) {
      throw new Error('Failed to create user subscription');
    }
    return data;
  } finally {
    userServiceClient.eject(authMiddleware);
  }
};

/**
 * Delete a notification subscription by ID. The announcements subscription
 * cannot be deleted; the backend disables it (sets it inactive) instead.
 */
export const deleteUserSubscription = async (id: string): Promise<void> => {
  const accessToken = await getUserAccessToken();
  const authMiddleware = generateAuthMiddlewareWithToken(accessToken);
  userServiceClient.use(authMiddleware);
  try {
    const { error } = await userServiceClient.DELETE(
      '/v1/user/subscriptions/{id}',
      {
        params: { path: { id } },
      },
    );
    if (error !== undefined) {
      throw new Error('Failed to delete user subscription');
    }
  } finally {
    userServiceClient.eject(authMiddleware);
  }
};
