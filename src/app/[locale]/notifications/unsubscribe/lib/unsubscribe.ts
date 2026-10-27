import { NOTIFICATION_TYPES } from '../../../../utils/notificationTypes';
import type {
  NotificationSubscription,
  UnsubscribeScope,
} from '../../../../services/notification-service';

/**
 * Pure helpers for the email unsubscribe page, kept free of React and
 * Firebase so they can be unit tested directly.
 *
 * The `id` in an unsubscribe link is the subscription's own ID, which acts
 * as the access capability: the recipient doesn't need to sign in.
 */

/** Outcome of a DELETE /v1/subscriptions/{id} call. */
export type UnsubscribeResult = 'success' | 'notFound' | 'error';

/** What the page knows about the linked subscription before the user acts. */
export type SubscriptionLookup =
  | { status: 'loading' }
  | { status: 'found'; notificationId: string; active: boolean }
  | { status: 'invalidId' }
  | { status: 'notFound' }
  | { status: 'error' };

export type ViewStatus = 'loading' | 'ready' | 'success' | 'error';

export interface ViewCopy {
  status: ViewStatus;
  /** Keys under the 'unsubscribe' namespace. */
  titleKey: string;
  descriptionKey: string;
}

/**
 * The user service generates subscription IDs and their format may change, so
 * this only checks that the link carries one; the API decides if it exists.
 */
export function isValidSubscriptionId(id: unknown): id is string {
  return typeof id === 'string' && id.trim() !== '';
}

/** Maps the DELETE response status onto what the page shows. */
export function toUnsubscribeResult(status: number): UnsubscribeResult {
  if (status >= 200 && status < 300) {
    return 'success';
  }
  // Non-announcement subscriptions are hard-deleted, so a repeated click (or
  // a stale link) lands here too.
  if (status === 404) {
    return 'notFound';
  }
  return 'error';
}

/**
 * Folds the link's ID and the subscription request's state into one value.
 * `data` is null when the API reported the subscription missing, and
 * undefined while the request hasn't settled (or hasn't started because the
 * Firebase user isn't ready yet). `authFailed` means no Firebase user is
 * coming, so the request never will.
 */
export function toSubscriptionLookup({
  subscriptionId,
  data,
  error,
  authFailed,
}: {
  subscriptionId: string | undefined;
  data:
    | Pick<NotificationSubscription, 'notification_id' | 'active'>
    | null
    | undefined;
  error: unknown;
  authFailed: boolean;
}): SubscriptionLookup {
  if (subscriptionId === undefined) {
    return { status: 'invalidId' };
  }
  if (error != null || authFailed) {
    return { status: 'error' };
  }
  if (data === null) {
    return { status: 'notFound' };
  }
  if (data === undefined) {
    return { status: 'loading' };
  }
  return {
    status: 'found',
    notificationId: data.notification_id,
    active: data.active,
  };
}

/**
 * Picks the headline for the current state. A completed action takes
 * precedence over what the page knew about the subscription on load.
 */
export function resolveViewCopy(
  lookup: SubscriptionLookup,
  result: { scope: UnsubscribeScope; outcome: UnsubscribeResult } | null,
): ViewCopy {
  if (result?.outcome === 'success') {
    return {
      status: 'success',
      titleKey: 'successTitle',
      descriptionKey:
        result.scope === 'all'
          ? 'successAllDescription'
          : 'successOneDescription',
    };
  }
  if (result?.outcome === 'notFound') {
    return {
      status: 'error',
      titleKey: 'errorTitle',
      descriptionKey: 'notFoundDescription',
    };
  }
  switch (lookup.status) {
    case 'loading':
      return {
        status: 'loading',
        titleKey: 'loadingTitle',
        descriptionKey: 'loadingDescription',
      };
    case 'found':
      return {
        status: 'ready',
        titleKey: lookup.active ? 'title' : 'alreadyUnsubscribedTitle',
        descriptionKey: lookup.active
          ? 'description'
          : 'alreadyUnsubscribedDescription',
      };
    case 'error':
      return {
        status: 'error',
        titleKey: 'errorTitle',
        descriptionKey: 'loadFailedDescription',
      };
    default:
      return {
        status: 'error',
        titleKey: 'errorTitle',
        descriptionKey: 'notFoundDescription',
      };
  }
}

/**
 * i18n key (under the 'feeds' namespace) naming the notification type, or
 * undefined for a type the app doesn't label yet.
 */
export function getNotificationTypeLabelKey(
  notificationId: string,
): string | undefined {
  return NOTIFICATION_TYPES.find((type) => type.id === notificationId)
    ?.labelKey;
}
