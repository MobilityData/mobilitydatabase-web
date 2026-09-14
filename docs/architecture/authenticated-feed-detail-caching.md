# Authenticated Feed Detail Caching Architecture

## Context & Problem Statement
Prior to this redesign, authenticated feed detail requests were cached on the Next.js server using `unstable_cache` keyed on `userId` (`feed-complete-${feedDataType}-${feedId}-${userId}`) with a 10-minute TTL:
- Storing per-user caches on the server consumed substantial memory/disk space on Vercel and serverless instances.
- The underlying public feed metadata (`feed`, `datasets`, `routes`, `reliability`, `quality`) is mostly identical across users of the same role.
- Redundant server-side copies provided zero benefit to other users.

## Evaluated Approaches

### Option 1: Client-Side SWR Caching
- **Design:** Keep the server stateless with respect to individual users. Serve initial feed payloads via React `cache()` request deduplication, then leverage client-side SWR (`useFeedDetailCache`) in the browser.
- **Benefits:**
  - Browser memory caches the feed details per-user with `stale-while-revalidate`.
  - Zero server data cache footprint for individual users.
  - Can be invalidated immediately on mutations (e.g. subscribing, updating feed metadata) or through broadcast events.
- **Implementation:** Added `useFeedDetailCache` hook in `src/app/screens/Feed/hooks/useFeedDetailCache.ts`.

### Option 2: Role-Based Server Caching
- **Design:** Instead of partitioning server cache keys by `userId`, partition by user role:
  - `guest`: Unauthenticated users (long ISR cache, shared across all anonymous visitors).
  - `authenticated`: Verified users with standard access.
  - `admin`: Internal MobilityData team with admin bypass and draft access.
- **Benefits:**
  - Dramatically collapses the cache space from `O(users * feeds)` to `O(roles * feeds)`.
  - At most 2 cache entries exist per feed on the server for all logged-in users combined.
  - Allows cache invalidation via `/api/revalidate` with `tags: ['feed-${feedId}', 'role-${role}']`.
- **Implementation:** Updated `fetchCompleteFeedData` in `src/app/[locale]/feeds/[feedDataType]/[feedId]/lib/feed-data.ts`.

## Integrated Solution
We implement the best of both approaches:
1. **Server Side:** Key `unstable_cache` by `userRole` (`admin` vs `authenticated`) instead of `userId`.
2. **Request Deduplication:** Rely on React's `cache()` to prevent duplicate upstream calls across layout, page, and `generateMetadata`.
3. **Client Side:** Use `useFeedDetailCache` with SWR for browser-level caching, smooth client navigation, and instant mutation updates.
4. **Invalidation:** Keep tags `feed-${feedId}` and `role-${userRole}` aligned with `/api/revalidate`.
