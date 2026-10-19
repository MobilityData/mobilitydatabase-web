import type {
  NotificationSubscription,
  SubscriptionFeed,
} from '../../../../services/notification-service';
import { NOTIFICATION_TYPES } from '../../../../utils/notificationTypes';

/**
 * One row of the account notifications table: either every subscription
 * targeting a single feed, or a single global (non-feed) subscription such as
 * announcements.
 */
export interface NotificationRow {
  /** Stable row key, unique across feed rows and global rows. */
  key: string;
  /** The feed this row groups; undefined for global subscriptions. */
  feed?: SubscriptionFeed;
  subscriptions: NotificationSubscription[];
  /** Distinct notification type IDs in this row, in `NOTIFICATION_TYPES` order. */
  notificationIds: string[];
  /** True when at least one of the row's subscriptions is active. */
  active: boolean;
  /** Earliest `created_at` among the row's subscriptions. */
  createdAt: string;
}

const nonEmpty = (value?: string | null): string | undefined =>
  value != null && value.trim() !== '' ? value : undefined;

export const getFeedTitle = (feed: SubscriptionFeed): string => {
  const titlePrefix =
    feed.data_type != null && feed.data_type.trim() !== ''
      ? `[${feed.data_type.toLocaleUpperCase()}]`
      : '';
  const provider = nonEmpty(feed.provider);
  const feedName = nonEmpty(feed.feed_name);
  if (provider != null && feedName != null) {
    return `${titlePrefix} ${provider} - ${feedName}`;
  }
  return `${titlePrefix} ${provider ?? feedName ?? feed.feed_id}`;
};

const getTypeOrder = (notificationId: string): number => {
  const index = NOTIFICATION_TYPES.findIndex(
    (type) => type.id === notificationId,
  );
  return index === -1 ? NOTIFICATION_TYPES.length : index;
};

const toRow = (
  key: string,
  feed: SubscriptionFeed | undefined,
  subscriptions: NotificationSubscription[],
): NotificationRow => {
  const notificationIds = [
    ...new Set(subscriptions.map((s) => s.notification_id)),
  ].sort((a, b) => getTypeOrder(a) - getTypeOrder(b));
  const createdAt = subscriptions.reduce(
    (earliest, s) =>
      new Date(s.created_at).getTime() < new Date(earliest).getTime()
        ? s.created_at
        : earliest,
    subscriptions[0].created_at,
  );
  return {
    key,
    feed,
    subscriptions,
    notificationIds,
    active: subscriptions.some((s) => s.active),
    createdAt,
  };
};

/**
 * Groups subscriptions so each feed gets a single row holding all of its
 * notification types. Subscriptions without feeds (global types) keep a row
 * each. Rows are returned in order of first appearance.
 */
export const groupSubscriptionsByFeed = (
  subscriptions: NotificationSubscription[],
): NotificationRow[] => {
  const groups = new Map<
    string,
    { feed?: SubscriptionFeed; subscriptions: NotificationSubscription[] }
  >();
  const addToGroup = (
    key: string,
    feed: SubscriptionFeed | undefined,
    subscription: NotificationSubscription,
  ): void => {
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { feed, subscriptions: [subscription] });
    } else {
      group.subscriptions.push(subscription);
    }
  };

  subscriptions.forEach((subscription) => {
    const feeds = subscription.feeds ?? [];
    if (feeds.length === 0) {
      addToGroup(`subscription:${subscription.id}`, undefined, subscription);
      return;
    }
    feeds.forEach((feed) => {
      addToGroup(`feed:${feed.feed_id}`, feed, subscription);
    });
  });

  return [...groups].map(([key, group]) =>
    toRow(key, group.feed, group.subscriptions),
  );
};
