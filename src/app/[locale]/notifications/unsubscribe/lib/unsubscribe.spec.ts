import {
  getNotificationTypeLabelKey,
  isValidSubscriptionId,
  resolveViewCopy,
  toSubscriptionLookup,
  toUnsubscribeResult,
} from './unsubscribe';

describe('isValidSubscriptionId', () => {
  it('accepts a UUID in either case', () => {
    expect(isValidSubscriptionId('3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c')).toBe(
      true,
    );
    expect(isValidSubscriptionId('3F2B8C1E-9A4D-4E7B-8C2A-1D5E6F7A8B9C')).toBe(
      true,
    );
  });

  it('rejects malformed, missing and non-string values', () => {
    expect(isValidSubscriptionId('not-a-uuid')).toBe(false);
    expect(isValidSubscriptionId('3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9')).toBe(
      false,
    );
    expect(isValidSubscriptionId(' 3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c')).toBe(
      false,
    );
    expect(isValidSubscriptionId('api.announcements')).toBe(false);
    expect(isValidSubscriptionId('')).toBe(false);
    // searchParams.get() returns null when the param is absent.
    expect(isValidSubscriptionId(null)).toBe(false);
  });
});

describe('toSubscriptionLookup', () => {
  const id = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';

  it('reports an invalid link before anything else', () => {
    expect(
      toSubscriptionLookup({
        subscriptionId: undefined,
        data: undefined,
        error: new Error('ignored'),
        authFailed: true,
      }),
    ).toEqual({ status: 'invalidId' });
  });

  it('is loading until the request settles', () => {
    expect(
      toSubscriptionLookup({
        subscriptionId: id,
        data: undefined,
        error: null,
        authFailed: false,
      }),
    ).toEqual({ status: 'loading' });
  });

  it('maps a missing subscription to notFound', () => {
    expect(
      toSubscriptionLookup({
        subscriptionId: id,
        data: null,
        error: null,
        authFailed: false,
      }),
    ).toEqual({ status: 'notFound' });
  });

  it('maps a failed request to error', () => {
    expect(
      toSubscriptionLookup({
        subscriptionId: id,
        data: undefined,
        error: new Error('network'),
        authFailed: false,
      }),
    ).toEqual({ status: 'error' });
  });

  it('maps a failed anonymous sign-in to error, since no request will run', () => {
    expect(
      toSubscriptionLookup({
        subscriptionId: id,
        data: undefined,
        error: undefined,
        authFailed: true,
      }),
    ).toEqual({ status: 'error' });
  });

  it('keeps only the fields the page renders', () => {
    expect(
      toSubscriptionLookup({
        subscriptionId: id,
        data: { notification_id: 'feed.url_updated', active: false },
        error: undefined,
        authFailed: false,
      }),
    ).toEqual({
      status: 'found',
      notificationId: 'feed.url_updated',
      active: false,
    });
  });
});

describe('resolveViewCopy', () => {
  const found = {
    status: 'found',
    notificationId: 'feed.url_updated',
    active: true,
  } as const;

  it('asks the user to choose while the subscription is active', () => {
    expect(resolveViewCopy(found, null)).toEqual({
      status: 'ready',
      titleKey: 'title',
      descriptionKey: 'description',
    });
  });

  it('says so when the subscription is already inactive', () => {
    expect(resolveViewCopy({ ...found, active: false }, null)).toEqual({
      status: 'ready',
      titleKey: 'alreadyUnsubscribedTitle',
      descriptionKey: 'alreadyUnsubscribedDescription',
    });
  });

  it('describes success according to the scope', () => {
    expect(
      resolveViewCopy(found, { scope: 'one', outcome: 'success' })
        .descriptionKey,
    ).toBe('successOneDescription');
    expect(
      resolveViewCopy(found, { scope: 'all', outcome: 'success' })
        .descriptionKey,
    ).toBe('successAllDescription');
  });

  it('treats a 404 on unsubscribe as an invalid or used link', () => {
    expect(
      resolveViewCopy(found, { scope: 'one', outcome: 'notFound' }),
    ).toEqual({
      status: 'error',
      titleKey: 'errorTitle',
      descriptionKey: 'notFoundDescription',
    });
  });

  it('keeps the choice open after a failed unsubscribe', () => {
    expect(
      resolveViewCopy(found, { scope: 'all', outcome: 'error' }).status,
    ).toBe('ready');
  });

  it('distinguishes a failed lookup from a bad link', () => {
    expect(resolveViewCopy({ status: 'error' }, null).descriptionKey).toBe(
      'loadFailedDescription',
    );
    expect(resolveViewCopy({ status: 'invalidId' }, null).descriptionKey).toBe(
      'notFoundDescription',
    );
    expect(resolveViewCopy({ status: 'notFound' }, null).descriptionKey).toBe(
      'notFoundDescription',
    );
    expect(resolveViewCopy({ status: 'loading' }, null).status).toBe('loading');
  });
});

describe('toUnsubscribeResult', () => {
  it('treats 2xx as success', () => {
    expect(toUnsubscribeResult(204)).toBe('success');
    expect(toUnsubscribeResult(200)).toBe('success');
  });

  it('maps 404 to notFound', () => {
    expect(toUnsubscribeResult(404)).toBe('notFound');
  });

  it('maps other failures to error', () => {
    expect(toUnsubscribeResult(400)).toBe('error');
    expect(toUnsubscribeResult(401)).toBe('error');
    expect(toUnsubscribeResult(500)).toBe('error');
    expect(toUnsubscribeResult(502)).toBe('error');
  });
});

describe('getNotificationTypeLabelKey', () => {
  it('returns the label key of a known type', () => {
    expect(getNotificationTypeLabelKey('feed.url_updated')).toBe(
      'feedUrlUpdatedLabel',
    );
    expect(getNotificationTypeLabelKey('api.announcements')).toBe(
      'apiAnnouncementsLabel',
    );
  });

  it('returns undefined for a type the app does not label', () => {
    expect(getNotificationTypeLabelKey('feed.unknown')).toBeUndefined();
  });
});
