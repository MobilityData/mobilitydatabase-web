import {
  ACCOUNT_ANNOUNCEMENTS_SYNC_TARGET,
  shouldSyncAnnouncements,
} from './announcementsSync';

describe('shouldSyncAnnouncements', () => {
  it('syncs only for sync=announcements', () => {
    expect(
      shouldSyncAnnouncements(new URLSearchParams('sync=announcements')),
    ).toBe(true);
    expect(shouldSyncAnnouncements(new URLSearchParams('sync=other'))).toBe(
      false,
    );
    expect(shouldSyncAnnouncements(new URLSearchParams(''))).toBe(false);
    expect(shouldSyncAnnouncements(null)).toBe(false);
  });

  it('builds a target the sign-in redirect accepts', () => {
    expect(ACCOUNT_ANNOUNCEMENTS_SYNC_TARGET).toBe(
      '/account?sync=announcements',
    );
    expect(
      shouldSyncAnnouncements(
        new URLSearchParams(ACCOUNT_ANNOUNCEMENTS_SYNC_TARGET.split('?')[1]),
      ),
    ).toBe(true);
  });
});
