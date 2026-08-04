# User Feature Flags

User feature flags are per-user configuration values resolved from the backend (`GET /v1/user`) and consumed
on the client only, via a plain reusable [SWR](https://swr.vercel.app/) hook.

This is the "User feature flags" row in the CLAUDE.md two-feature-flag-systems table — global flags are a
different mechanism (Firebase Remote Config, see `src/lib/remote-config.server.ts`).

---

## Architecture overview

```
┌───────────────────────────────────────────────────────────────────┐
│  Login / signup / OAuth login sagas (auth-saga.ts — client)       │
│                                                                    │
│  1. GET /v1/user  (retrieveUserInformation, already fetched for   │
│     the profile itself)                                           │
│  2. setUserFeatureFlagsCache(uid, userData.features)               │
│     → seeds the SWR cache for [USER_FEATURE_FLAGS_SWR_KEY, uid]    │
│       with revalidate: false, so useUserFeatureFlags() below       │
│       never re-fetches data the saga already has                   │
└───────────────────────────────┬────────────────────────────────────┘
                                │ cache seeded (no network call)
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│  useUserFeatureFlags()  (src/app/hooks/useUserFeatureFlags.ts)    │
│                                                                    │
│  useSWR([USER_FEATURE_FLAGS_SWR_KEY, uid], fetchUserFeatureFlags)  │
│  - No seed yet (e.g. page reload with an existing Firebase        │
│    session, no login saga ran)? Fetches GET /v1/user itself,      │
│    authenticated with the client's Firebase ID token.             │
│  - Seed already present? Reuses it — no extra request.            │
│  - Every caller shares this one cache entry per uid, whether it's │
│    UserFeatureFlagsSync (below) or any future consumer.           │
└───────────────────────────────┬────────────────────────────────────┘
                                │
                ┌───────────────┴────────────────┐
                ▼                                 ▼
┌────────────────────────────┐      ┌─────────────────────────────┐
│ UserFeatureFlagsSync        │      │ Any other consumer           │
│ (components/                │      │ (e.g. ClientSubscribeControls)│
│  UserFeatureFlagsSync.tsx)   │      │                               │
│                              │      │ const { flags, isResolved }  │
│ Mounted once, globally, in   │      │   = useUserFeatureFlags();   │
│ providers.tsx. Renders null; │      │                               │
│ exists so flags resolve (and │      └───────────────────────────────┘
│ expose window.__featureFlags/│
│ __featureFlagsResolved for    │
│ Cypress) on every page, not   │
│ only ones with a real         │
│ consumer.                     │
└────────────────────────────┘
```

Revalidation, once the initial value is in place:

- **Window focus** — `revalidateOnFocus: true`, throttled to once per 60s (`focusThrottleInterval`).
- **Session renewal** — `AuthSessionProvider` calls `revalidateUserFeatureFlags(uid)` whenever it renews the
  `md_session` cookie (~hourly). See [AuthSessionProvider.tsx](../src/app/components/AuthSessionProvider.tsx)
  and the discussion of why this piggybacks on session renewal rather than polling on its own schedule.
- **Identity change** — not a revalidation at all. The cache key is `[KEY, uid]`, so signing in as a different
  user lands on a different key and resolves independently; there is nothing to invalidate.

On logout, `isAuthenticated` becomes `false`, the cache key becomes `null` (no fetch), and the hook falls
back to `defaultUserFeatureFlags` with `isResolved: true` immediately — signed-out is a resolved answer, not
a pending one.

---

## Adding a new feature flag

Edit `src/app/interface/UserFeatureFlags.ts` — one change updates everything:

```ts
export interface UserFeatureFlags {
  isNotificationsEnabled: boolean;
  isSealOfReliabilityFilterEnabled: boolean;
  myNewFlag: boolean; // add here
}

export const defaultUserFeatureFlags: UserFeatureFlags = {
  isNotificationsEnabled: false,
  isSealOfReliabilityFilterEnabled: false,
  myNewFlag: false, // and here
};
```

- `UserFeatureFlagId` (`keyof UserFeatureFlags`) and `useUserFeatureFlags()` pick up the new flag automatically.
- `toUserFeatureFlags()`, also in `UserFeatureFlags.ts`, already handles unknown keys gracefully — if the API
  returns the new flag it is merged; if not, the default is used.
- All flags are typed as `boolean` today. `toUserFeatureFlags()` does not check the API's `value_type` before
  assigning `flag.value` — if a future flag ever carries a non-boolean value (the schema also allows `string`
  / `numeric` / `array` / `json`), add a `value_type === 'boolean'` guard before widening this pattern.

Note: `isNotificationsEnabled` also exists in the *other* flag system (Remote Config,
`src/app/interface/RemoteConfig.ts`). That's real duplication, not a doc error — the two systems answer
different questions ("is the feature live at all" vs. "is this specific user entitled to it") and the live
UI consumer (`ClientSubscribeControls.tsx`) reads from both.

---

## Usage — client side only

```tsx
'use client';
import { useUserFeatureFlags } from '../hooks/useUserFeatureFlags';

export function MyComponent() {
  const { flags, isResolved } = useUserFeatureFlags();

  // isResolved is false while entitlement is genuinely unknown — render a
  // pending state, not the not-entitled one, until it's true.
  if (!isResolved) return null;
  if (!flags.isNotificationsEnabled) return null;
  return <NotificationsBell />;
}
```

There is **no server-side equivalent**. `fetchUserFeatureFlags()` (`user-feature-flag-service.ts`) resolves
the caller's Firebase ID token client-side (`getUserAccessToken()` → `currentUser.getIdTokenResult()`), and
per this app's auth model the client's Firebase token is never forwarded to the server — a Server Component
has no way to make the equivalent call. If you need this data during SSR, it isn't available; design the UI
to tolerate the client-side resolution delay (see `isResolved` above) rather than looking for a seed.

---

## Why there is no cookie, no context, and no server read

This system used to work differently: a Server Action (`getServerFlags()`) read an HMAC-signed `md_features`
cookie for SSR, a `POST /api/feature-flags` route wrote it, and a `BroadcastChannel` pushed resolved flags to
every open tab. All of that was removed (see the `removed user feature flags from server` commit) in favor
of the client-only SWR design above. The reasons:

**No cookie / no server read.** A per-user cookie read during render cannot work on statically rendered
routes — Next hands those an empty cookie store at build/ISR time, so every read looked like a logged-out
user regardless of actual entitlement. That was a real bug the old design had (`getServerFlags()` in
`layout.tsx` on a `force-static` route), and it's what `cypress/e2e/userFeatureFlags.cy.ts` now locks down
(*"resolves flags on a statically rendered route"*). A value computed once in the root layout would also go
stale on client-side navigation, since layouts aren't re-rendered on navigation.

**No React Context.** SWR's own cache — keyed by `[USER_FEATURE_FLAGS_SWR_KEY, uid]` — is what makes this
"resolve once, shared by every caller," not a Provider. Multiple components calling `useUserFeatureFlags()`
dedupe onto one request the same way whether or not a Context wraps them; the only thing a Context would add
is a slightly more convenient seam for injecting a fixed value in component tests. Given there's a genuine
need for the hook to resolve on *every* page (not just ones with a real consumer — see `UserFeatureFlagsSync`
above), a Context provider wrapping `children` wasn't buying anything a plain hook plus one globally-mounted
null-rendering sync component didn't already provide more simply.

**No `BroadcastChannel` / no client-writable cookie signing.** The old `POST /api/feature-flags` route had a
known gap: it signed whatever `FeatureFlag[]` array the client sent it, without verifying the caller. That's
now moot — there is no such route. `fetchUserFeatureFlags()` calls `GET /v1/user` directly with the caller's
Firebase ID token, so the backend resolves flags for the authenticated identity itself; nothing client-side
can be forged into the cache except by seeding it with data the same request already legitimately fetched
(`setUserFeatureFlagsCache`, called only from the login/signup sagas with their own `GET /v1/user` result).

**Cross-tab consistency** falls out of the uid-keyed cache rather than a broadcast push: each tab has its own
Firebase auth listener, so a login/logout in one tab changes that tab's own `uid`/cache key independently. No
explicit tab-to-tab coordination is needed for flags specifically (contrast with `LOGIN_CHANNEL`/
`LOGOUT_CHANNEL` in `channel-service.ts`, which exist for the broader auth session, not for flags).

---

## Testing

`cypress/e2e/userFeatureFlags.cy.ts` covers: resolution on static and dynamic routes, defaults for
flags the API omits, that the SWR entry survives client-side navigation without refetching, and that logout
resets to defaults. It asserts against `window.__featureFlags` / `window.__featureFlagsResolved`, which
`useUserFeatureFlags()` exposes only when `window.Cypress` is set (mirrors the `window.store` pattern in
`store.ts` — test-only, no production impact). Those globals are populated by whichever mounted instance of
the hook runs first — in practice `UserFeatureFlagsSync`, since it's mounted on every page.
