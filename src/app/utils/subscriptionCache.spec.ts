import type { NotificationSubscription } from '../services/notification-service';
import {
  settleAll,
  upsertSubscriptions,
  withoutFeed,
} from './subscriptionCache';

describe('settleAll', () => {
  it('resolves with every value in order', async () => {
    await expect(
      settleAll([Promise.resolve(1), Promise.resolve(2)]),
    ).resolves.toEqual([1, 2]);
  });

  it('rejects only after every promise has settled', async () => {
    let slowSettled = false;
    const slow = new Promise<number>((resolve) => {
      setTimeout(() => {
        slowSettled = true;
        resolve(2);
      }, 10);
    });
    const failure = new Error('boom');

    await expect(settleAll([Promise.reject(failure), slow])).rejects.toBe(
      failure,
    );
    expect(slowSettled).toBe(true);
  });
});

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

describe('upsertSubscriptions', () => {
  it('replaces a cached subscription with the same ID', () => {
    const cached = makeSubscription({ feeds: [{ feed_id: 'mdb-1' }] });
    const merged = makeSubscription({
      feeds: [{ feed_id: 'mdb-1' }, { feed_id: 'mdb-2' }],
    });

    const result = upsertSubscriptions([cached], [merged]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(merged);
  });

  it('appends subscriptions that are not cached yet', () => {
    const cached = makeSubscription({ id: 'a' });
    const created = makeSubscription({ id: 'b' });

    expect(upsertSubscriptions([cached], [created]).map((s) => s.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('withoutFeed', () => {
  const shared = makeSubscription({
    id: 'shared',
    feeds: [{ feed_id: 'mdb-1' }, { feed_id: 'mdb-2' }],
  });
  const single = makeSubscription({
    id: 'single',
    notification_id: 'feed.coverage',
    feeds: [{ feed_id: 'mdb-1' }],
  });
  const announcements = makeSubscription({
    id: 'announcements',
    notification_id: 'api.announcements',
  });

  it('removes only the given feed from a shared subscription', () => {
    const [result] = withoutFeed([shared], ['shared'], 'mdb-1');

    expect(result.id).toBe('shared');
    expect(result.feeds).toEqual([{ feed_id: 'mdb-2' }]);
  });

  it('drops a subscription whose last feed is removed', () => {
    expect(withoutFeed([single], ['single'], 'mdb-1')).toEqual([]);
  });

  it('leaves subscriptions that were not targeted untouched', () => {
    const result = withoutFeed(
      [shared, single, announcements],
      ['single'],
      'mdb-1',
    );

    expect(result).toEqual([shared, announcements]);
  });
});
