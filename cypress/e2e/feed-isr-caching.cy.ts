/**
 * Feed ISR Caching e2e tests (unauthenticated users)
 *
 * Architecture overview:
 * - Unauthenticated users are routed by proxy.ts to /[locale]/feeds/[type]/[id]/static/
 * - That route uses `force-static` + `revalidate: 1209600` (14 days)
 * - On the first visit, Next.js renders the page and caches it
 * - On subsequent visits, Next.js serves the cached HTML without re-rendering
 *
 * How we detect cache hits/misses:
 * - Next.js sets the `x-nextjs-cache` response header on ISR routes:
 *     MISS  → page was freshly rendered (first visit or after revalidation)
 *     HIT   → page was served from the ISR cache
 *     STALE → page was served from stale cache while revalidation runs in background
 * - We intercept the browser's GET request to the feed page and inspect this header.
 *
 */

export {};

const TEST_FEED_ID = 'test-516';
const TEST_FEED_DATA_TYPE = 'gtfs';
const FEED_URL = `/feeds/${TEST_FEED_DATA_TYPE}/${TEST_FEED_ID}`;

/**
 * Calls the /api/revalidate endpoint to bust the ISR cache for the test feed.
 * This simulates what happens when the backend triggers a revalidation webhook
 * (e.g. after a feed update), which in production invalidates the cached page.
 *
 * The REVALIDATE_SECRET must match the value set in the Next.js server's env.
 * It is read from Cypress env (loaded from .env.development via cypress.config.ts).
 */
function revalidateTestFeed(): void {
  const secret = Cypress.env('REVALIDATE_SECRET') as string;
  cy.request({
    method: 'POST',
    url: '/api/revalidate',
    headers: {
      'x-revalidate-secret': secret,
      'content-type': 'application/json',
    },
    body: {
      type: 'specific-feeds',
      gtfsFeedIds: [TEST_FEED_ID],
      gtfsRtFeedIds: [],
      gbfsFeedIds: [],
    },
  })
    .its('status')
    .should('eq', 200);
}

describe('Feed ISR Caching - Unauthenticated', () => {
  /**
   * Ensure the ISR cache is busted before the suite runs so we always
   * start from a known MISS state, regardless of prior test runs.
   */
  before(() => {
    revalidateTestFeed();
  });

  describe('First visit (cache MISS)', () => {
    it('should render the page dynamically on the first visit', () => {
      // Intercept the page request and capture the x-nextjs-cache header.
      // The alias lets us assert on the response after cy.visit() resolves.
      cy.intercept('GET', FEED_URL).as('feedPageRequest');

      cy.visit(FEED_URL, { timeout: 30000 });

      // Wait for the page request and assert the cache header is MISS.
      // On the very first visit (or after revalidation), Next.js renders
      // the page fresh and populates the ISR cache.
      cy.wait('@feedPageRequest')
        .its('response.headers.x-nextjs-cache')
        // MISS means the page was freshly rendered (not served from cache).
        // STALE is also acceptable here if a prior cached version existed but
        // was invalidated — Next.js serves stale while revalidating in background.
        .should('be.oneOf', ['MISS', 'STALE']);

      // Sanity check: the page content is actually rendered
      cy.get('[data-testid="feed-provider"]', { timeout: 10000 }).should(
        'contain',
        'Metropolitan Transit Authority (MTA)',
      );
    });
  });

  describe('Second visit (cache HIT)', () => {
    it('should serve the page from the ISR cache on a revisit', () => {
      // Intercept the page request again for the second visit.
      cy.intercept('GET', FEED_URL).as('feedPageCacheHit');

      // Visit the same URL again — Next.js should now serve from ISR cache.
      cy.visit(FEED_URL, { timeout: 30000 });

      cy.wait('@feedPageCacheHit')
        .its('response.headers.x-nextjs-cache')
        // HIT means the page was served from the ISR cache without re-rendering.
        .should('eq', 'HIT');

      // Content should still be correct when served from cache
      cy.get('[data-testid="feed-provider"]', { timeout: 10000 }).should(
        'contain',
        'Metropolitan Transit Authority (MTA)',
      );
    });
  });

  describe('After revalidation (cache MISS again)', () => {
    it('should bust the ISR cache when the revalidate endpoint is called', () => {
      // First, confirm the page is currently cached (HIT) before we bust it.
      cy.intercept('GET', FEED_URL).as('feedPageBeforeRevalidate');
      cy.visit(FEED_URL, { timeout: 30000 });
      cy.wait('@feedPageBeforeRevalidate')
        .its('response.headers.x-nextjs-cache')
        .should('eq', 'HIT');

      // Trigger cache invalidation via the revalidate API endpoint.
      // This simulates a backend webhook call after a feed update.
      revalidateTestFeed();

      // Visit the page again — the cache was busted, so Next.js should
      // re-render the page (MISS or STALE).
      cy.intercept('GET', FEED_URL).as('feedPageAfterRevalidate');
      cy.visit(FEED_URL, { timeout: 30000 });

      cy.wait('@feedPageAfterRevalidate')
        .its('response.headers.x-nextjs-cache')
        // After revalidation, the cache is invalidated. Next.js will either:
        // - MISS: render fresh immediately
        // - STALE: serve the old cache while re-rendering in background
        // Either way, the cache was busted — a HIT here would be a failure.
        .should('be.oneOf', ['MISS', 'STALE']);

      // Content should still be correct after revalidation
      cy.get('[data-testid="feed-provider"]', { timeout: 10000 }).should(
        'contain',
        'Metropolitan Transit Authority (MTA)',
      );
    });
  });
});
