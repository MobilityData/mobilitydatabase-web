import type { NotificationSubscription } from '../../../../services/notification-service';
import { getFeedTitle, groupSubscriptionsByFeed } from './groupSubscriptions';

const makeSubscription = (
  overrides: Partial<NotificationSubscription>,
): NotificationSubscription => ({
  id: 'sub-1',
  user_id: 'user-1',
  notification_id: 'feed.url_updated',
  active: true,
  created_at: '2026-01-01T00:00:00Z',
  feeds: null,
  ...overrides,
});

const feedA = {
  feed_id: 'mdb-1',
  data_type: 'gtfs',
  provider: 'Provider A',
  feed_name: 'Main',
};
const feedB = { feed_id: 'mdb-2', data_type: 'gbfs', provider: 'Provider B' };

describe('groupSubscriptionsByFeed', () => {
  it('returns no rows for no subscriptions', () => {
    expect(groupSubscriptionsByFeed([])).toEqual([]);
  });

  it('merges every notification type for a feed into one row', () => {
    const rows = groupSubscriptionsByFeed([
      makeSubscription({
        id: 'sub-1',
        notification_id: 'unknown.type',
        feeds: [feedA],
      }),
      makeSubscription({
        id: 'sub-2',
        notification_id: 'feed.url_updated',
        feeds: [feedA],
      }),
      makeSubscription({ id: 'sub-3', feeds: [feedB] }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].key).toBe('feed:mdb-1');
    expect(rows[0].feed).toEqual(feedA);
    expect(rows[0].subscriptions.map((s) => s.id)).toEqual(['sub-1', 'sub-2']);
    // Known types first, in NOTIFICATION_TYPES order; unknown types last.
    expect(rows[0].notificationIds).toEqual([
      'feed.url_updated',
      'unknown.type',
    ]);
    expect(rows[1].key).toBe('feed:mdb-2');
  });

  it('keeps one row per global subscription', () => {
    const rows = groupSubscriptionsByFeed([
      makeSubscription({ id: 'a', notification_id: 'api.announcements' }),
      makeSubscription({
        id: 'b',
        notification_id: 'api.announcements',
        feeds: [],
      }),
    ]);

    expect(rows.map((row) => row.key)).toEqual([
      'subscription:a',
      'subscription:b',
    ]);
    expect(rows[0].feed).toBeUndefined();
    expect(rows[0].notificationIds).toEqual(['api.announcements']);
  });

  it('adds a multi-feed subscription to each of its feeds', () => {
    const rows = groupSubscriptionsByFeed([
      makeSubscription({ id: 'multi', feeds: [feedA, feedB] }),
    ]);

    expect(rows.map((row) => row.key)).toEqual(['feed:mdb-1', 'feed:mdb-2']);
    expect(rows[1].subscriptions[0].id).toBe('multi');
  });

  it('is active when any subscription is active', () => {
    const [mixed] = groupSubscriptionsByFeed([
      makeSubscription({ id: '1', active: false, feeds: [feedA] }),
      makeSubscription({ id: '2', active: true, feeds: [feedA] }),
    ]);
    const [paused] = groupSubscriptionsByFeed([
      makeSubscription({ id: '1', active: false, feeds: [feedA] }),
    ]);

    expect(mixed.active).toBe(true);
    expect(paused.active).toBe(false);
  });
});

describe('getFeedTitle', () => {
  it('combines data type, provider and feed name', () => {
    expect(getFeedTitle(feedA)).toBe('[GTFS] Provider A - Main');
  });

  it('falls back to the feed ID when no names are set', () => {
    expect(
      getFeedTitle({ feed_id: 'mdb-9', data_type: 'gtfs', provider: ' ' }),
    ).toBe('[GTFS] mdb-9');
  });
});
