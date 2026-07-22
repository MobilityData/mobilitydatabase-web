/**
 * User Feature Flags — Cypress E2E tests
 *
 * What these tests cover:
 *   - md_features cookie is set as httpOnly after login
 *   - Cookie payload contains the flags returned by GET /v1/user
 *   - Cookie is cleared when the user logs out
 *   - Cookie is updated when token refresh returns different flags
 *   - window.__featureFlags (UserFeatureFlagProvider state) matches the
 *     resolved flags after every login, refresh, and logout transition
 *
 * What these tests do NOT cover (use Jest + RTL instead):
 *   - HMAC signature correctness — that is a unit test for sign()/verify()
 *     in src/app/actions/feature-flags.ts.
 *
 * Provider state assertions:
 *   UserFeatureFlagProvider exposes its live state on window.__featureFlags
 *   when window.Cypress is set (mirrors the window.store pattern in store.ts).
 *   Use `cy.window().its('__featureFlags')` to assert provider values directly.
 *
 * Cookie format: "<base64url(JSON.stringify(features))>.<base64url(hmac)>"
 * The payload (first segment) is readable without the secret.
 */

const TEST_EMAIL = 'featureFlagsTest@mobilitydata.org';
const TEST_PASSWORD = 'IloveOrangeCones123!';

/** Minimal UserProfile body for GET /v1/user mocks. */
function mockUserProfile(
  features: Array<{ id: string; value_type: string; value: unknown }> = [],
) {
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
 * Decode the feature flags stored in the cookie payload.
 * The cookie is "<base64url(payload)>.<base64url(hmac)>".
 * We read only the payload — no secret needed.
 */
function decodeCookiePayload(
  cookieValue: string,
): Array<{ id: string; value_type: string; value: unknown }> {
  const encoded = cookieValue.split('.')[0];
  // base64url → standard base64 before atob()
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64));
}

/** Dispatch the login saga and wait for POST /api/feature-flags to complete. */
function loginViaSaga(alias: `@${string}`) {
  cy.window().then((win) => {
    // Dispatching 'userProfile/login' triggers emailLoginSaga, which calls
    // signInWithEmailAndPassword (Firebase emulator), GET /v1/user, and
    // POST /api/feature-flags (applyUserFeatureFlags) before dispatching loginSuccess.
    (win as unknown as { store: { dispatch: (a: unknown) => void } }).store.dispatch({
      type: 'userProfile/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
  });
  cy.wait(alias);
}

// ---------------------------------------------------------------------------

describe('User Feature Flags', () => {
  beforeEach(() => {
    // Create a fresh user in the Firebase emulator before each test.
    cy.createNewUserAndSignIn(TEST_EMAIL, TEST_PASSWORD);
    cy.visit('/');
  });

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------
  describe('on login', () => {
    it('sets the md_features cookie as httpOnly', () => {
      cy.intercept('GET', '**/v1/user', {
        statusCode: 200,
        body: mockUserProfile([
          { id: 'isNotificationsEnabled', value_type: 'boolean', value: true },
        ]),
      });
      cy.intercept('POST', '**/api/feature-flags').as('setFlags');

      loginViaSaga('@setFlags');

      cy.getCookie('md_features')
        .should('exist')
        .and('have.property', 'httpOnly', true);

      // Provider state should reflect the resolved flags.
      cy.window()
        .its('__featureFlags')
        .should('deep.include', { isNotificationsEnabled: true });
    });

    it('cookie payload contains the flags returned by the API', () => {
      cy.intercept('GET', '**/v1/user', {
        statusCode: 200,
        body: mockUserProfile([
          { id: 'isNotificationsEnabled', value_type: 'boolean', value: true },
          {
            id: 'isSealOfReliabilityFilterEnabled',
            value_type: 'boolean',
            value: false,
          },
        ]),
      });
      cy.intercept('POST', '**/api/feature-flags').as('setFlags');

      loginViaSaga('@setFlags');

      cy.getCookie('md_features').then((cookie) => {
        cy.wrap(cookie).should('not.be.null');
        const flags = decodeCookiePayload(cookie!.value);
        cy.wrap(flags.find((f) => f.id === 'isNotificationsEnabled')?.value).should('equal', true);
        cy.wrap(
          flags.find((f) => f.id === 'isSealOfReliabilityFilterEnabled')?.value,
        ).should('equal', false);
      });

      cy.window().its('__featureFlags').should('deep.equal', {
        isNotificationsEnabled: true,
        isSealOfReliabilityFilterEnabled: false,
      });
    });

    it('cookie stores an empty array when the API returns no flags', () => {
      cy.intercept('GET', '**/v1/user', {
        statusCode: 200,
        body: mockUserProfile([]),
      });
      cy.intercept('POST', '**/api/feature-flags').as('setFlags');

      loginViaSaga('@setFlags');

      cy.getCookie('md_features').then((cookie) => {
        cy.wrap(cookie).should('not.be.null');
        const flags = decodeCookiePayload(cookie!.value);
        // Raw cookie stores the API response. toUserFeatureFlags() fills in
        // defaults on read — the provider always falls back to defaultUserFeatureFlags.
        cy.wrap(flags).should('deep.equal', []);
      });

      // Provider fills in defaults for all missing flags.
      cy.window().its('__featureFlags').should('deep.equal', {
        isNotificationsEnabled: false,
        isSealOfReliabilityFilterEnabled: false,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Token refresh
  //
  // Waits on POST /api/feature-flags (the cookie-setting route handler) as the
  // sync signal. This is deterministic — the request only completes once the
  // server has written the Set-Cookie header.
  //
  // For saga-level unit testing, prefer Jest + mocked services.
  // -------------------------------------------------------------------------
  describe('on token refresh with changed flags', () => {
    beforeEach(() => {
      cy.intercept('GET', '**/v1/user', {
        statusCode: 200,
        body: mockUserProfile([
          { id: 'isNotificationsEnabled', value_type: 'boolean', value: false },
        ]),
      });
      cy.intercept('POST', '**/api/feature-flags').as('setFlags');

      loginViaSaga('@setFlags');
      cy.getCookie('md_features').should('exist');
    });

    it('updates the cookie when flags change on refresh', () => {
      cy.intercept('GET', '**/v1/user', {
        statusCode: 200,
        body: mockUserProfile([
          { id: 'isNotificationsEnabled', value_type: 'boolean', value: true },
        ]),
      });
      cy.intercept('POST', '**/api/feature-flags').as('setFlagsRefresh');

      cy.window().then((win) => {
        (win as unknown as { store: { dispatch: (a: unknown) => void } }).store.dispatch({
          type: 'userProfile/requestRefreshAccessToken',
        });
      });

      cy.wait('@setFlagsRefresh');

      cy.getCookie('md_features').then((cookie) => {
        cy.wrap(cookie).should('not.be.null');
        const flags = decodeCookiePayload(cookie!.value);
        cy.wrap(flags.find((f) => f.id === 'isNotificationsEnabled')?.value).should('equal', true);
      });

      cy.window().its('__featureFlags').should('deep.include', { isNotificationsEnabled: true });
    });
  });

  // -------------------------------------------------------------------------
  // Expired cookie + token refresh
  //
  // Simulates a user whose md_features cookie has expired mid-session
  // (e.g. the cookie TTL elapsed while the tab was open). The cookie is
  // cleared manually after login to reproduce the expired state.
  //
  // The token-refresh saga fires when requestRefreshAccessToken is dispatched.
  // It calls GET /v1/user, writes the cookie via POST /api/feature-flags, and
  // broadcasts the flags via the feature-flags channel so the provider updates.
  // -------------------------------------------------------------------------
  describe('on expired cookie (return visit)', () => {
    it('re-sets md_features cookie after token refresh', () => {
      // Login normally so Firebase auth is established for the refresh saga.
      cy.intercept('GET', '**/v1/user', {
        statusCode: 200,
        body: mockUserProfile([
          { id: 'isNotificationsEnabled', value_type: 'boolean', value: false },
        ]),
      });
      cy.intercept('POST', '**/api/feature-flags').as('setFlagsLogin');
      loginViaSaga('@setFlagsLogin');
      cy.getCookie('md_features').should('exist');

      // Simulate the cookie expiring.
      cy.clearCookie('md_features');
      cy.getCookie('md_features').should('be.null');

      // Token refresh should re-write the cookie with updated flags.
      cy.intercept('GET', '**/v1/user', {
        statusCode: 200,
        body: mockUserProfile([
          { id: 'isNotificationsEnabled', value_type: 'boolean', value: true },
        ]),
      });
      cy.intercept('POST', '**/api/feature-flags').as('setFlagsRefresh');

      cy.window().then((win) => {
        (win as unknown as { store: { dispatch: (a: unknown) => void } }).store.dispatch({
          type: 'userProfile/requestRefreshAccessToken',
        });
      });

      cy.wait('@setFlagsRefresh');

      cy.getCookie('md_features').then((cookie) => {
        cy.wrap(cookie).should('not.be.null');
        const flags = decodeCookiePayload(cookie!.value);
        cy.wrap(flags.find((f) => f.id === 'isNotificationsEnabled')?.value).should('equal', true);
      });

      cy.window().its('__featureFlags').should('deep.include', { isNotificationsEnabled: true });
    });
  });

  // -------------------------------------------------------------------------
  // Logout
  // -------------------------------------------------------------------------
  describe('on logout', () => {
    beforeEach(() => {
      cy.intercept('GET', '**/v1/user', {
        statusCode: 200,
        body: mockUserProfile([
          { id: 'isNotificationsEnabled', value_type: 'boolean', value: true },
        ]),
      });
      cy.intercept('POST', '**/api/feature-flags').as('setFlags');

      loginViaSaga('@setFlags');
      cy.getCookie('md_features').should('exist');
    });

    it('clears the md_features cookie', () => {
      // Navigate to the account page where the sign-out button is accessible.
      cy.visit('/account');
      cy.get('[data-cy="desktop-signOutButton"]').click({ force: true });
      cy.get('[data-cy="confirmSignOutButton"]').click();

      cy.getCookie('md_features').should('be.null');

      // Provider should be reset to defaults after logout.
      cy.window().its('__featureFlags').should('deep.equal', {
        isNotificationsEnabled: false,
        isSealOfReliabilityFilterEnabled: false,
      });
    });

    it('also clears the md_session cookie', () => {
      // Sanity-check that both session cookies are cleared together.
      cy.visit('/account');
      cy.get('[data-cy="desktop-signOutButton"]').click({ force: true });
      cy.get('[data-cy="confirmSignOutButton"]').click();

      cy.getCookie('md_session').should('be.null');
      cy.getCookie('md_features').should('be.null');

      // Provider should be reset to defaults after logout.
      cy.window().its('__featureFlags').should('deep.equal', {
        isNotificationsEnabled: false,
        isSealOfReliabilityFilterEnabled: false,
      });
    });
  });
});
