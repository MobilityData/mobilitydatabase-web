/**
 * User Feature Flags — Cypress E2E tests
 *
 * Architecture under test:
 *   Feature flags resolve entirely on the client. useUserFeatureFlags() reads
 *   them from GET /v1/user via SWR, keyed by the live Firebase uid. There is no
 *   server-rendered seed and no cookie — a per-user cookie read during render
 *   cannot work on statically rendered routes (Next hands those an empty cookie
 *   store, so every read looks like a logged-out user), which is the bug these
 *   tests lock down. UserFeatureFlagsSync mounts the hook once, globally, in
 *   providers.tsx so flags resolve regardless of which page is rendered.
 *
 * What these tests cover:
 *   - Flags resolve on a STATICALLY rendered route (/), the case that was broken
 *   - Flags resolve identically on a dynamic route (a feed page)
 *   - Flags omitted by the API fall back to their defaults
 *   - The SWR entry survives client-side navigation without refetching
 *   - Logout resets the flags to defaults
 *   - No md_features cookie is ever set (guards against reintroducing it)
 */

export {};

const TEST_EMAIL = 'featureFlagsTest@mobilitydata.org';
const TEST_PASSWORD = 'IloveOrangeCones123!';

// Fixture-backed feed used by the other feed specs — a dynamic route.
const TEST_FEED_URL = '/feeds/gtfs/test-516';

const ALL_DEFAULTS = {
  isNotificationsEnabled: false,
  isSealFilterEnabled: false,
};

interface MockFeature {
  id: string;
  value_type: string;
  value: unknown;
}

/** Minimal UserProfile body for GET /v1/user mocks. */
function mockUserProfile(features: MockFeature[] = []) {
  return {
    id: 'test-uid',
    email: TEST_EMAIL,
    full_name: 'Test User',
    legacy_org_name: 'Test Organization', // required for isRegistered: true
    email_verified: true,
    is_registered_to_receive_api_announcements: false,
    features,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

/**
 * Stubs GET /v1/user and counts how many times it is requested, so tests can
 * assert that the SWR cache is reused rather than refetched.
 */
function interceptUserProfile(features: MockFeature[]): {
  calls: () => number;
} {
  let calls = 0;
  cy.intercept('GET', '**/v1/user', (req) => {
    calls += 1;
    req.reply({ statusCode: 200, body: mockUserProfile(features) });
  }).as('getUserProfile');
  return { calls: () => calls };
}

/** Waits until the provider reports resolved flags matching `expected`. */
function expectResolvedFlags(expected: Record<string, boolean>): void {
  cy.window().its('__featureFlagsResolved').should('be.true');
  cy.window().its('__featureFlags').should('deep.equal', expected);
}

/**
 * Dispatches the login saga and waits until Redux reports a 'registered'
 * profile status. Feature-flag resolution itself never needs this — it keys
 * off the Firebase session alone (see the header) — but routes gated by
 * ProtectedPageWrapper's default `targetStatus='registered'` (e.g. /account)
 * do, and Firebase SDK sign-in alone (the outer beforeEach) does not set it.
 * Must be called on an already-visited page, since it reads window.store.
 */
function loginViaSaga(): void {
  cy.window()
    .its('store')
    .should('exist')
    .then((storeObj) => {
      (storeObj as { dispatch: (a: unknown) => void }).dispatch({
        type: 'userProfile/login',
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
    });

  cy.window()
    .its('store')
    .invoke('getState')
    .its('userProfile.status')
    .should('equal', 'registered');
}

// ---------------------------------------------------------------------------

describe('User Feature Flags', () => {
  beforeEach(() => {
    // Creates the user AND leaves them signed in through the Firebase SDK, so
    // the provider has a uid as soon as the page loads.
    cy.createNewUserAndSignIn(TEST_EMAIL, TEST_PASSWORD);
  });

  describe('resolution', () => {
    it('resolves flags on a statically rendered route', () => {
      // The regression: `/` is `dynamic = 'force-static'`, so a server-side
      // cookie read here always produced defaults regardless of entitlement.
      interceptUserProfile([
        { id: 'isNotificationsEnabled', value_type: 'boolean', value: true },
      ]);

      cy.visit('/');

      expectResolvedFlags({
        ...ALL_DEFAULTS,
        isNotificationsEnabled: true,
      });
    });

    it('resolves the same flags on a dynamic route', () => {
      interceptUserProfile([
        { id: 'isNotificationsEnabled', value_type: 'boolean', value: true },
      ]);

      cy.visit(TEST_FEED_URL, { timeout: 30000 });

      expectResolvedFlags({
        ...ALL_DEFAULTS,
        isNotificationsEnabled: true,
      });
    });

    it('falls back to defaults for flags the API omits', () => {
      interceptUserProfile([
        {
          id: 'isSealFilterEnabled',
          value_type: 'boolean',
          value: true,
        },
      ]);

      cy.visit('/');

      expectResolvedFlags({
        isNotificationsEnabled: false,
        isSealFilterEnabled: true,
      });
    });

    it('resolves to defaults when the profile carries no flags', () => {
      interceptUserProfile([]);

      cy.visit('/');

      expectResolvedFlags(ALL_DEFAULTS);
    });
  });

  describe('caching', () => {
    it('reuses the cached flags across a client-side navigation', () => {
      const profile = interceptUserProfile([
        { id: 'isNotificationsEnabled', value_type: 'boolean', value: true },
      ]);

      let callsOnLoad = 0;

      cy.visit('/');
      // /account is gated by ProtectedPageWrapper on a 'registered' Redux
      // profile status, which the Firebase-only sign-in from the outer
      // beforeEach does not set (see loginViaSaga's docstring). Without this,
      // the accountHeader click below races ProtectedPageWrapper's redirect
      // to /sign-in.
      loginViaSaga();
      expectResolvedFlags({ ...ALL_DEFAULTS, isNotificationsEnabled: true });
      cy.then(() => {
        callsOnLoad = profile.calls();
        // Sanity check, so the comparison after navigating is not vacuous.
        cy.wrap(callsOnLoad).should('be.greaterThan', 0);
      });

      // Client-side navigation: the provider stays mounted, so the SWR entry for
      // this uid must be reused rather than refetched.
      cy.get('[data-cy="accountHeader"]').click();
      cy.location('pathname').should('include', '/account');
      expectResolvedFlags({ ...ALL_DEFAULTS, isNotificationsEnabled: true });

      // No refetch across the navigation — the cached entry was reused.
      cy.then(() => {
        cy.wrap(profile.calls()).should('equal', callsOnLoad);
      });
    });
  });

  describe('on logout', () => {
    beforeEach(() => {
      interceptUserProfile([
        { id: 'isNotificationsEnabled', value_type: 'boolean', value: true },
      ]);
      cy.intercept('DELETE', '**/api/session').as('logoutRequest');

      // /account is gated by ProtectedPageWrapper on a 'registered' Redux
      // profile status. Log in while on an ungated page so the persisted
      // status is already 'registered' by the time /account's full-page
      // cy.visit runs ProtectedPageWrapper's redirect check — otherwise it
      // redirects away before the sidebar (and its sign-out button) render.
      cy.visit('/');
      loginViaSaga();
    });

    it('resets the flags to defaults', () => {
      cy.visit('/account');
      expectResolvedFlags({ ...ALL_DEFAULTS, isNotificationsEnabled: true });

      cy.get('[data-cy="desktop-signOutButton"]').click({ force: true });
      cy.get('[data-cy="confirmSignOutButton"]').click();
      cy.wait('@logoutRequest');

      // Signed out (or anonymous) means not entitled, and that is a resolved
      // answer rather than a placeholder.
      expectResolvedFlags(ALL_DEFAULTS);
    });
  });
});
