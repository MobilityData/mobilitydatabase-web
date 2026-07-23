/**
 * User Feature Flags — Cypress E2E tests
 *
 * What these tests cover:
 *   - md_features cookie is set as httpOnly after login
 *   - Cookie payload contains the flags returned by GET /v1/user
 *   - Cookie is cleared when the user logs out
 *   - Feature flags are refreshed on session renewal (hourly, driven by
 *     AuthSessionProvider → setUserCookieSession → refreshUserFeatureFlags)
 *   - window.__featureFlags (UserFeatureFlagProvider state) matches the
 *     resolved flags after every login, renewal, and logout transition
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
 * Session renewal helper:
 *   Combine them to simulate the
 *   AuthSessionProvider interval firing with a stale session.
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
  // Wait for window.store to be exposed by ContextProviders' useEffect.
  // In production builds (next start), React hydration completes after
  // Cypress marks the page as loaded, so a direct .then() races the useEffect.
  // .its('store').should('exist') retries until the property is defined.
  cy.window().its('store').should('exist').then((storeObj) => {
    // Dispatching 'userProfile/login' triggers emailLoginSaga, which calls
    // signInWithEmailAndPassword (Firebase emulator), GET /v1/user, and
    // POST /api/feature-flags (applyUserFeatureFlags) before dispatching loginSuccess.
    (storeObj as { dispatch: (a: unknown) => void }).dispatch({
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
  // Logout
  // -------------------------------------------------------------------------
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
      // Intercept the logout request so tests can wait for cookie clearance.
      cy.intercept('DELETE', '**/api/session').as('logoutRequest');

      loginViaSaga('@setFlags');
      cy.getCookie('md_features').should('exist');
    });

    it('clears the md_features cookie', () => {
      cy.visit('/account');
      cy.get('[data-cy="desktop-signOutButton"]').click({ force: true });
      cy.get('[data-cy="confirmSignOutButton"]').click();
      cy.wait('@logoutRequest');

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
      cy.wait('@logoutRequest');

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

// -----------------------------------------------------------------------------
// Session renewal
//
// AuthSessionProvider registers a 5-minute setInterval on mount that calls
// setUserCookieSession(). When the session is stale (expiresAt exceeded, same
// uid), setUserCookieSession() returns wasRenewal=true and AuthSessionProvider
// calls refreshUserFeatureFlags(), which re-fetches GET /v1/user and writes a
// fresh md_features cookie via POST /api/feature-flags.
//
// cy.clock() MUST be called before cy.visit() so Sinon intercepts the
// setInterval registered by AuthSessionProvider on mount and cy.tick() can
// trigger its callback. Only intervals are faked — Date.now() and setTimeout
// are left real so Firebase SDK internals are unaffected.
// Backdating md_session_meta.expiresAt to 1 (ms since epoch) makes
// getSessionStatus() reliably return 'renewal' for any real Date.now() value.
// -----------------------------------------------------------------------------
describe('User Feature Flags — session renewal', () => {
  beforeEach(() => {
    cy.createNewUserAndSignIn(TEST_EMAIL, TEST_PASSWORD);

    // Fake ONLY setInterval/clearInterval so cy.tick() can drive the renewal
    // interval AuthSessionProvider registers on mount. Date.now() and
    // setTimeout stay real so the Firebase SDK internals are unaffected.
    // Must run before cy.visit() so Sinon patches setInterval before the
    // provider mounts and schedules its callback.
    cy.clock(Date.now(), ['setInterval', 'clearInterval']);

    // Initial login returns isNotificationsEnabled: true.
    cy.intercept('GET', '**/v1/user', {
      statusCode: 200,
      body: mockUserProfile([
        { id: 'isNotificationsEnabled', value_type: 'boolean', value: true },
      ]),
    }).as('getUserInitial');
    cy.intercept('POST', '**/api/feature-flags').as('setFlags');

    cy.visit('/');
    loginViaSaga('@setFlags');
  });

  it('updates the feature flags cookie and provider when the session token expires', () => {
    // Sanity check: the initial flags were applied on login.
    cy.getCookie('md_features').should('exist');
    cy.window()
      .its('__featureFlags')
      .should('deep.equal', {
        isNotificationsEnabled: true,
        isSealOfReliabilityFilterEnabled: false,
      });

    // The backend now returns DIFFERENT flags — this is the change that should
    // be picked up on the next hourly renewal (not on the current session).
    cy.intercept('GET', '**/v1/user', {
      statusCode: 200,
      body: mockUserProfile([
        { id: 'isNotificationsEnabled', value_type: 'boolean', value: false },
        {
          id: 'isSealOfReliabilityFilterEnabled',
          value_type: 'boolean',
          value: true,
        },
      ]),
    }).as('getUserRenewed');
    cy.intercept('POST', '**/api/feature-flags').as('renewFlags');

    // Expire the stored session so getSessionStatus() returns 'renewal' on the
    // next tick: same uid, but expiresAt in the past (1ms since epoch is always
    // < the real Date.now()). This drives setUserCookieSession() → wasRenewed
    // === true → refreshUserFeatureFlags().
    //
    // md_session_meta is written asynchronously by AuthSessionProvider
    // (onIdTokenChanged → setUserCookieSession → POST /api/session → setItem),
    // which is a SEPARATE chain from the login saga's POST /api/feature-flags
    // that loginViaSaga waits on. In the CI production build (next start),
    // hydration — and therefore that chain — completes later than in the local
    // dev server, so the key may not exist yet at this point. Re-read
    // localStorage with a retrying assertion instead of a one-shot .then(),
    // which would capture a stale null and never recover.
    cy.window()
      .its('localStorage')
      .invoke({ timeout: 15000 }, 'getItem', 'md_session_meta')
      .should('not.be.null')
      .then((raw) => {
        const meta = JSON.parse(raw as string) as {
          uid: string;
          expiresAt: number;
        };
        cy.window().then((win) => {
          win.localStorage.setItem(
            'md_session_meta',
            JSON.stringify({ ...meta, expiresAt: 1 }),
          );
        });
      });

    // Fire AuthSessionProvider's 5-minute renewal interval.
    cy.tick(5 * 60 * 1000);

    // Renewal re-fetches the profile and re-writes the md_features cookie.
    cy.wait('@getUserRenewed');
    cy.wait('@renewFlags');

    // Cookie payload reflects the NEW flag values.
    cy.getCookie('md_features').then((cookie) => {
      cy.wrap(cookie).should('not.be.null');
      const flags = decodeCookiePayload(cookie!.value);
      cy.wrap(
        flags.find((f) => f.id === 'isNotificationsEnabled')?.value,
      ).should('equal', false);
      cy.wrap(
        flags.find((f) => f.id === 'isSealOfReliabilityFilterEnabled')?.value,
      ).should('equal', true);
    });

    // Provider state reflects the NEW flag values.
    cy.window().its('__featureFlags').should('deep.equal', {
      isNotificationsEnabled: false,
      isSealOfReliabilityFilterEnabled: true,
    });
  });
});
