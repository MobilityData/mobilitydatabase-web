---
name: mobility-feed-caching
description: The feed-detail routing and caching architecture — src/proxy.ts rewriting authed vs static routes, ISR page TTLs, per-user data caches, and cache invalidation via /api/revalidate. Load this when editing anything under src/app/[locale]/feeds/[feedDataType]/[feedId]/, changing src/proxy.ts or proxy-helpers, adding or fetching feed-detail data, setting revalidate/dynamic exports, touching the revalidate endpoint or cache tags, or debugging a stale feed page, an unexpected 404 on a feed route, or x-nextjs-cache MISS/HIT behavior.
---

# Feed detail routing & caching

Canonical references: `docs/feed-detail-caching-flow.md` (sequence diagram) and
`src/app/api/revalidate/README.md` (endpoint contract).

## The core idea: one URL, two renderings

Users and crawlers see clean URLs — `/feeds/{type}/{id}` and `/feeds/{type}/{id}/map`. `src/proxy.ts`
(Next 16's renamed `middleware.ts`) rewrites each request to one of two route trees based on the
`md_session` cookie:

| Visitor | Rewritten to | Header set | Page cache | Data cache |
|---|---|---|---|---|
| Authenticated, not guest | `.../[feedId]/authed/...` | `x-mdb-authed-proxy: 1` | none (private) | per user+feed, 10 min |
| Guest / anonymous / logged out | `.../[feedId]/static/...` | `x-mdb-static-proxy: 1` | ISR, ~14 days at the edge | shared public, ~14 days |

Why: anonymous traffic is the vast majority and is identical for everyone, so it gets full edge page
caching for fast LCP and good SEO. Authenticated pages show per-user data (subscriptions, admin controls)
so the *page* is never shared — only its API calls are cached, per user, briefly.

`src/proxy.ts` also injects the default locale when the path has none.

## Rules for editing these routes

- **`static/` routes must never call `cookies()` or `headers()`.** That opts the route out of static
  rendering and silently destroys the caching strategy. Anything user-specific belongs in `authed/`.
- **`authed/layout.tsx` is a security gate**: `force-dynamic`, and it returns `notFound()` unless
  `x-mdb-authed-proxy` is present. A direct hit on `/authed/...` 404s by design. Same for `/static/...`
  without its header. If you see an unexpected 404 on a feed route, check the proxy rewrite first.
- **Reuse `src/app/utils/proxy-helpers.ts`** — `isFeedDetailPage`, `isAuthenticatedNotGuest`,
  `rewriteFeedRequest`, `hasLocaleInPathname`, `rewriteWithDefaultLocale`, `AUTHED_PROXY_HEADER`,
  `STATIC_PROXY_HEADER`. Don't re-parse pathnames by hand; this module has a 295-line spec covering it.
- Keep the two trees in sync. A change to feed-detail rendering usually needs applying to both `authed/`
  and `static/` (and their `map/` children).

## The data layer — reuse, don't re-fetch

Under `src/app/[locale]/feeds/[feedDataType]/[feedId]/lib/`:

| Module | Role |
|---|---|
| `feed-data-shared.ts` | The actual fetchers: `fetchFeedByType`, `fetchDatasets`, `fetchRelatedFeeds`, `fetchRoutesData`, `fetchCompleteFeedDataImpl`, type `FeedDataResult` |
| `feed-data.ts` | `fetchCompleteFeedData` — authed path. React `cache()` + `unstable_cache` keyed by **userId + feedId**, `revalidate: 600` (10 min) |
| `guest-feed-data.ts` | `fetchGuestFeedData` — guest path. Shared cache, `revalidate: 1209600` (14 days) |
| `generate-feed-metadata.ts`, `FeedJsonLd.tsx` | SEO metadata and JSON-LD |

Call the path-appropriate wrapper rather than the raw fetchers, so you inherit the right cache key and TTL.
The authed path is where the `Promise.all([getSSRAccessToken(), getUserContextJwtFromCookie(), getCurrentUserFromCookie()])`
pattern lives — parallelize; these are independent.

The `static/layout.tsx` sets `revalidate = 1209600`; `authed/layout.tsx` sets `dynamic = 'force-dynamic'`.
If you change a TTL, change it in the layout **and** the matching data wrapper, or the page and its data
will disagree.

## Invalidation

Never hand-write `revalidatePath`/`revalidateTag` calls for feeds — use
`src/app/utils/revalidate-feeds.ts`, which owns the tag/path vocabulary (`feed-type-gtfs`, etc.):

`revalidateSpecificFeeds`, `revalidateAllFeeds`, `revalidateAllGtfsFeeds`, `revalidateAllGtfsRtFeeds`,
`revalidateAllGbfsFeeds`, `revalidateFullSite`.

External entrypoint `src/app/api/revalidate/route.ts`:

- `POST` with header `x-revalidate-secret` — used by a GCP workflow when feed data changes.
  `type ∈ full | all-feeds | all-gtfs-feeds | all-gtfs-rt-feeds | all-gbfs-feeds | specific-feeds`.
- `GET` with `Authorization: Bearer $CRON_SECRET` — Vercel cron (schedules in `vercel.json`: 4am UTC
  Mon–Sat, 7am UTC Sun) revalidates all GBFS feeds.

Both anonymous edge pages (base + `/map`) and the public data cache must be invalidated together — that's
what these helpers do. Remote Config has its own separate tag (`refreshRemoteConfig()`).

## The legacy route hack

`src/app/[locale]/feeds/[feedDataType]/page.tsx` receives a **feedId** in the `feedDataType` slot — old
inbound links. It looks the feed up, then `notFound()` or `redirect('/feeds/{data_type}/{feedId}')`. It's
documented in a docblock at the top of the file. Leave the naming alone; just don't copy the pattern.

## Debugging

| Symptom | Where to look |
|---|---|
| Unexpected 404 on a feed route | Proxy rewrite / missing `x-mdb-authed-proxy` or `x-mdb-static-proxy` header |
| Stale feed page for guests | 14-day ISR TTL — needs `/api/revalidate`, not a redeploy wait |
| Authed user sees another user's data | Data cache key missing `userId`; check you used `fetchCompleteFeedData` |
| Guest page rendering dynamically | Something in the `static/` tree calls `cookies()`/`headers()` |
| Cache header assertions | `cypress/e2e/feed-isr-caching.cy.ts` asserts `x-nextjs-cache: MISS/HIT/STALE` and busts cache via `POST /api/revalidate` with `REVALIDATE_SECRET` |

Note `docs/feed-detail-caching-flow.md` writes the cookie as `session_md`; the code uses **`md_session`**.

## Related

- Token minting and the session cookie → `mobility-auth` skill
- Server-side caching and parallel-fetch rules (`server-cache-react`, `server-parallel-fetching`,
  `async-parallel`) → `vercel-react-best-practices` skill
