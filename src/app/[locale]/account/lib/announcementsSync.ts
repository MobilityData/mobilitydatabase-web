import { ACCOUNT_TARGET } from '../../../constants/Navigation';

/**
 * `/account?sync=announcements` asks the account page to refresh the API
 * announcements opt-in from Brevo before showing it. Brevo's unsubscribe
 * redirect sends users here (through sign-in when needed), since the daily
 * reconcile may not have turned the subscription off yet.
 */
export const ANNOUNCEMENTS_SYNC_PARAM = 'sync';
export const ANNOUNCEMENTS_SYNC_VALUE = 'announcements';

export const ACCOUNT_ANNOUNCEMENTS_SYNC_TARGET = `${ACCOUNT_TARGET}?${ANNOUNCEMENTS_SYNC_PARAM}=${ANNOUNCEMENTS_SYNC_VALUE}`;

export function shouldSyncAnnouncements(
  params: Pick<URLSearchParams, 'get'> | null,
): boolean {
  return params?.get(ANNOUNCEMENTS_SYNC_PARAM) === ANNOUNCEMENTS_SYNC_VALUE;
}
