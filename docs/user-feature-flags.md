# User Feature Flags

User-based feature flags are per-user configuration values resolved by the backend (`GET /v1/user`) and made available across the entire app — both on the server (Server Components, middleware) and on the client (React components).

---

## Architecture overview

```
┌──────────────────────────────────────────────────────────────┐
│  Login (Redux Saga — client)                                  │
│                                                               │
│  1. GET /v1/user  →  UserProfile.features[]                   │
│  2. yield call(applyUserFeatureFlags, features)                │
│     → POST /api/feature-flags → HMAC-signs → sets             │
│        md_features httpOnly cookie                             │
│     → on success, broadcasts the resolved flags on the         │
│        FEATURE_FLAGS_CHANNEL BroadcastChannel                  │
└──────────────────────────┬───────────────────────────────────-┘
                           │
┌──────────────────────────────────────────────────────────────┐
│  Session renewal (AuthSessionProvider — client, ~hourly)      │
│                                                               │
│  setUserCookieSession() returns wasRenewal=true when an       │
│  existing session is stale (same uid, cookie expired).        │
│  AuthSessionProvider then calls refreshUserFeatureFlags():    │
│  1. GET /v1/user  →  UserProfile.features[]                   │
│  2. applyUserFeatureFlags(features)  (same path as login)     │
└──────────────────────────┬───────────────────────────────────-┘
                           │ cookie written + flags broadcast
          ┌────────────────┴───────────────┐
          ▼                                ▼
┌─────────────────┐             ┌──────────────────────────┐
│  Server side    │             │  Client side              │
│                 │             │                           │
│ getServerFlags()│             │ UserFeatureFlagProvider    │
│ (Server Action) │             │ listens on                │
│ reads & verifies│             │ FEATURE_FLAGS_CHANNEL,     │
│ md_features     │             │ holds flags in React       │
│ cookie directly │             │ state (ephemeral)          │
│                 │             │                            │
│ Used in:        │             │ useUserFeatureFlags()       │
│ - layout.tsx    │             │ → typed map                 │
│   (SSR hydrate) │             │ { isNotifications           │
│ - Server        │             │   Enabled: boolean, … }     │
│   Components    │             │                             │
└─────────────────┘             └──────────────────────────┘
```

Note the read path (`getServerFlags`) and write path (`applyUserFeatureFlags`) are two different mechanisms:

- **Reads** go through a Server Action (`src/app/actions/feature-flags.ts`), used for SSR hydration in `layout.tsx`.
- **Writes** go through a plain API route (`POST /api/feature-flags`), called from the client via `fetch`. The client never gets the cookie value directly — the route sets it `httpOnly` — but the client *does* get the resolved flags back immediately via the `BroadcastChannel` push described below, so no read-after-write round trip is needed.

### Key files

| File | Purpose |
|---|---|
| `src/app/interface/UserFeatureFlags.ts` | `FeatureFlag` API type, `UserFeatureFlags` interface, `defaultUserFeatureFlags`, `UserFeatureFlagId`, and the `toUserFeatureFlags()` converter |
| `src/app/actions/feature-flags.ts` | Server Action `getServerFlags()` — reads and HMAC-verifies the `md_features` cookie |
| `src/app/api/feature-flags/route.ts` | `POST`/`DELETE` — HMAC-signs and sets (or clears) the `md_features` cookie |
| `src/app/services/session-service.ts` | `applyUserFeatureFlags()` — posts flags to the route, then broadcasts resolved flags to every tab; `refreshUserFeatureFlags()` — re-fetches `GET /v1/user` and calls `applyUserFeatureFlags`, triggered on session renewal; `setUserCookieSession()` — returns `true` when an existing session was renewed (same uid, stale cookie) vs freshly established |
| `src/app/services/channel-service.ts` | `FEATURE_FLAGS_CHANNEL`, `broadcastExtendedMessage()` (delivers to the current tab too, not just other tabs), `createBroadcastChannel()` |
| `src/app/components/AuthSessionProvider.tsx` | Owns the 5-minute session renewal interval; calls `refreshUserFeatureFlags()` when `setUserCookieSession()` signals a renewal (`wasRenewal=true`) for a non-anonymous user |
| `src/app/context/UserFeatureFlagProvider.tsx` | Client provider + `useUserFeatureFlags()` hook; listens on `FEATURE_FLAGS_CHANNEL`; resets to defaults when `isAuthenticated` goes false |
| `src/app/[locale]/layout.tsx` | SSR hydration — reads cookie via `getServerFlags()`, passes `initialFlags` to `<Providers>` |
| `src/app/store/saga/auth-saga.ts` | Calls `applyUserFeatureFlags` after login (email, provider, sign-up); broadcasts `defaultUserFeatureFlags` on logout |
| `src/app/store/saga/profile-saga.ts` | `refreshAccessTokenSaga` — refreshes the Redux access token only; feature flag refresh is handled separately by `AuthSessionProvider` |
| `src/app/api/session/route.ts` | Clears `md_features` alongside `md_session` on logout |

---

## Data flow in detail

### On login

1. Login saga calls `GET /v1/user` (`retrieveUserInformation`) and receives `UserProfile.features[]`.
2. Saga calls `applyUserFeatureFlags(features)` (`session-service.ts`), which:
   - `POST`s the raw `FeatureFlag[]` to `/api/feature-flags`, which HMAC-signs the payload and writes an `httpOnly` cookie (`md_features`, 1 hr TTL).
   - On a successful response, converts the flags with `toUserFeatureFlags()` and calls `broadcastExtendedMessage(FEATURE_FLAGS_CHANNEL, flags)`.
3. `broadcastExtendedMessage` delivers the resolved flags to every other open tab via the underlying `BroadcastChannel`, **and** invokes the listener in the current tab directly (a `BroadcastChannel` never delivers to its own sender), so all tabs update in the same call.
4. `UserFeatureFlagProvider`'s channel listener calls `setFlags` with the pushed value — no extra fetch needed, in this tab or any other.
5. The whole call is wrapped in try/catch in the saga — a failure (network error, channel not yet registered) is swallowed and never blocks `loginSuccess`.

### On session renewal (~hourly cadence)

`AuthSessionProvider` calls `setUserCookieSession()` on a 5-minute interval (and on every `onIdTokenChanged` event). `setUserCookieSession()` performs a single `localStorage` read to determine the session state:

- **`'fresh'`** — same uid, cookie not yet stale → no-op, returns `false`.
- **`'renewal'`** — same uid, cookie stale → POSTs `/api/session` to renew, returns `true`.
- **`'new'`** — no prior record or different uid (fresh login / identity change) → POSTs `/api/session`, returns `false`. The login saga already handled the flag fetch in this case.

When `wasRenewal === true` and the user is not anonymous, `AuthSessionProvider` calls `refreshUserFeatureFlags()`, which:
1. Calls `retrieveUserInformation()` (`GET /v1/user`) to get the latest `features[]`.
2. Calls `applyUserFeatureFlags(features)` — same POST + broadcast path as login.

This keeps feature flags current for long-lived sessions without requiring re-login. A failure is silently swallowed — flag staleness is preferable to disrupting the session renewal.

### On logout

`logoutSaga` calls `clearUserCookieSession()` which hits `DELETE /api/session`. That route clears both `md_session` and `md_features` in a single response. The saga also directly broadcasts `defaultUserFeatureFlags` on `FEATURE_FLAGS_CHANNEL` so every open tab resets immediately. `UserFeatureFlagProvider` additionally resets to defaults on its own whenever `isAuthenticated` transitions to `false`, as a second line of defense.

### On page load (SSR)

`layout.tsx` calls `getServerFlags()` in its `Promise.all` alongside `getRemoteConfigValues()`. The result is passed as `initialFlags` to `<Providers>`, which forwards it to `<UserFeatureFlagProvider initialFlags={...}>`. The provider initialises its React state with these values, so the **first render is always flash-free** — no loading state, no client-side fetch on mount.

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
- `toUserFeatureFlags()`, also in `UserFeatureFlags.ts`, already handles unknown keys gracefully — if the API returns the new flag it is merged; if not, the default is used.
- All flags are typed as `boolean` today. `toUserFeatureFlags()` does not check the API's `value_type` before assigning `flag.value` — if a future flag ever carries a non-boolean value (the schema also allows `string` / `numeric` / `array` / `json`), add a `value_type === 'boolean'` guard before widening this pattern.

---

## Usage — client side

```tsx
'use client';
import { useUserFeatureFlags } from '../context/UserFeatureFlagProvider';

export function MyComponent() {
  const { isNotificationsEnabled } = useUserFeatureFlags();

  if (!isNotificationsEnabled) return null;
  return <NotificationsBell />;
}
```

The hook returns a `UserFeatureFlags` object — the same shape as `RemoteConfigValues`. No string ID lookups, no casts, full IDE autocomplete.

---

## Usage — server side

```ts
// Any Server Component or server utility
import { getServerFlags } from '../actions/feature-flags';

export default async function Page() {
  const { isNotificationsEnabled } = await getServerFlags();
  // ...
}
```

`getServerFlags()` reads the `md_features` cookie, verifies the HMAC signature, and returns a `UserFeatureFlags` object with defaults applied for any missing flags. The `FeatureFlag[]` API array format is an internal detail — consumers always receive the typed map.

---

### The `UserFeatureFlags` interface mirrors `RemoteConfigValues`

Both use a plain interface with an explicit defaults object. The difference is the data source:

| | `RemoteConfigValues` | `UserFeatureFlags` |
|---|---|---|
| Source | Firebase Remote Config (global) | User service API (per-user) |
| Definition | `export interface RemoteConfigValues` | `export interface UserFeatureFlags` |
| Defaults | `defaultRemoteConfigValues` | `defaultUserFeatureFlags` |
| Provider prop | `config: RemoteConfigValues` | `initialFlags: UserFeatureFlags` |
| Hook | `useRemoteConfig()` → `{ config }` | `useUserFeatureFlags()` → flags directly |

The `FeatureFlag[]` array (raw API format) is purely internal. `applyUserFeatureFlags()` accepts it (the saga passes the `GET /v1/user` response directly) and `toUserFeatureFlags()` converts it to `UserFeatureFlags` both when reading the cookie server-side (`getServerFlags()`) and when preparing the payload for the client broadcast. Consumers never interact with the array format.

---

## Why the cookie is written from an API route, read from a Server Action

### The alternatives considered

**Option A — Store in Redux**

Redux state is managed by `redux-persist`, which serialises it to `localStorage`. This creates two problems:

1. **Cross-session leakage**: User A's flags persist in `localStorage` after logout. When User B logs in on the same device, they briefly see User A's flags until the login saga overwrites them.
2. **PersistGate dependency**: Every component reading flags would need to be inside a `PersistGate` (or handle the rehydration window), spreading boilerplate.
3. **Source-of-truth drift**: Redux and a potential server-side store would need to stay in sync, creating a class of bug that's hard to reproduce.

**Option B — Store only in React context (client-fetched)**

A context provider could call `GET /v1/user` directly when auth resolves. This avoids Redux but:

1. The login saga already calls `GET /v1/user` — a second call from the provider doubles the network requests.
2. The provider has no access to the result of the saga's fetch, so it can't reuse it.
3. Server Components still can't read React context — server-side access would require a separate mechanism anyway.

### Why the cookie + broadcast approach wins

The `httpOnly` cookie is the **single source of truth on the server**; the `BroadcastChannel` push keeps every open tab's React state in sync with it without ever reading it back from the client:

| Concern | Cookie + broadcast |
|---|---|
| Cross-session leakage | None — cookie is cleared on logout and is not in `localStorage` |
| PersistGate | Not needed — provider holds ephemeral React state, not persisted state |
| Source-of-truth drift | None on the server — there is only one cookie. The client mirrors it via the broadcast payload rather than re-reading it |
| Server Components | `getServerFlags()` reads the cookie directly, no extra fetch |
| Double network calls | None — the saga's single `GET /v1/user` result is reused for both the cookie write and the client broadcast; the hourly renewal call is the only extra network touch |
| Flash on initial render | None — `layout.tsx` reads the cookie server-side and passes `initialFlags` |
| Multi-tab consistency | `FEATURE_FLAGS_CHANNEL` (`broadcastExtendedMessage`) pushes the resolved flags to every tab, including the sender, immediately — no reload required |

### Known limitation: `POST /api/feature-flags` does not verify the caller

Unlike `POST /api/session`, which verifies a Firebase ID token via `getAuth(app).verifyIdToken(idToken)` before issuing a cookie, `POST /api/feature-flags` accepts the `FeatureFlag[]` body as-is and signs whatever it's given. This is called out in a comment on the route itself. The accepted tradeoff is that today's flags (`isNotificationsEnabled`, `isSealOfReliabilityFilterEnabled`) are UI-only conveniences, so a client setting its own values client-side has no real security impact — actual access is enforced independently wherever it matters.

This does **not** extend automatically to future flags. Before adding a flag that gates real access (a paywalled feature, an admin capability, etc.), this route needs the same idToken-verification treatment as `/api/session`: accept a Firebase ID token in the request, verify it server-side, and resolve the flags from the user service directly rather than trusting the client-supplied array.
