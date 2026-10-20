import type { NotificationSubscription } from '../services/notification-service';

/**
 * Replaces cached subscriptions with incoming ones that share their ID and
 * appends the rest. Subscribing to a feed merges it into the user's existing
 * subscription for that notification type, so the API can return a
 * subscription that is already cached.
 */
export const upsertSubscriptions = (
  current: NotificationSubscription[],
  incoming: NotificationSubscription[],
): NotificationSubscription[] => {
  const incomingById = new Map(incoming.map((s) => [s.id, s]));
  const currentIds = new Set(current.map((s) => s.id));
  return [
    ...current.map((s) => incomingById.get(s.id) ?? s),
    ...incoming.filter((s) => !currentIds.has(s.id)),
  ];
};

/**
 * Like `Promise.all`, but waits for every promise to settle before rejecting,
 * so a resync after a partial failure sees all the requests that succeeded.
 */
export const settleAll = async <T>(
  promises: Array<Promise<T>>,
): Promise<T[]> => {
  const results = await Promise.allSettled(promises);
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (rejected !== undefined) {
    throw rejected.reason;
  }
  return results.map((result) => (result as PromiseFulfilledResult<T>).value);
};

/**
 * Removes a feed from the given subscriptions, mirroring
 * `remove_feed_ids`: a subscription left with no feeds is dropped, since the
 * backend deletes it.
 */
export const withoutFeed = (
  current: NotificationSubscription[],
  subscriptionIds: string[],
  feedId: string,
): NotificationSubscription[] =>
  current.flatMap((s) => {
    if (!subscriptionIds.includes(s.id)) {
      return [s];
    }
    const feeds = (s.feeds ?? []).filter((feed) => feed.feed_id !== feedId);
    return feeds.length === 0 ? [] : [{ ...s, feeds }];
  });
