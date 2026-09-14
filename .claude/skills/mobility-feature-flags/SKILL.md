---
name: mobility-feature-flags
description: The two feature-flag systems in this app — global Firebase Remote Config and per-user HMAC-cookie flags — and how to choose, add, read, and test a flag. Load this when adding or removing a feature flag, gating UI or behavior behind a flag, reading flags in a Server Component or client component, touching RemoteConfig.ts / UserFeatureFlags.ts / UserFeatureFlagProvider / RemoteConfigProvider / actions/feature-flags.ts, or debugging a flag that reads stale, false, or flashes on load.
---

# Feature flags

This app has **two independent flag systems**. Picking the wrong one is the most common mistake.

| | Firebase Remote Config | User feature flags |
|---|---|---|
| Scope | Global — same for everyone | Per-user |
| Source of truth | Firebase Remote Config | `GET /v1/user` → HMAC-signed `md_features` cookie |
| Define in | `src/app/interface/RemoteConfig.ts` | `src/app/interface/UserFeatureFlags.ts` |
| Server read | `getRemoteConfigValues()` / `getUserRemoteConfigValues()` | `getServerFlags()` |
| Client read | `useRemoteConfig()` → `{ config }` | `useUserFeatureFlags()` → flags directly |
| Cache | 5 min dev / 1 hour prod | Cookie, 1 hour TTL |
| Requires login | No | Yes |

**Choose Remote Config** for a global rollout toggle or kill switch — something you flip for everyone
without a deploy. **Choose user flags** when the backend decides per user (entitlements, per-account
rollout). If the backend already returns it in `UserProfile.features[]`, it's a user flag.

## Firebase Remote Config

Definition and defaults: `src/app/interface/RemoteConfig.ts` — add your key to the `RemoteConfigValues`
interface **and** to `defaultRemoteConfigValues`.

Server (`src/lib/remote-config.server.ts`, `server-only`):

```tsx
const config = await getUserRemoteConfigValues();  // reads the session cookie itself, applies admin bypass
if (config.enableFeedStatusBadge) { /* … */ }
```

- `getRemoteConfigValues()` — plain global values, React `cache()` + `unstable_cache` with tag
  `remote-config`.
- `getUserRemoteConfigValues()` — same, but reads the session cookie and applies the admin bypass. Prefer
  this in Server Components so admins see gated features; no prop threading needed.
- `refreshRemoteConfig()` — on-demand `revalidateTag('remote-config')`.

Client:

```tsx
'use client';
import { useRemoteConfig } from '../context/RemoteConfigProvider';
const { config } = useRemoteConfig();
```

The provider hydrates from the server value passed through `[locale]/layout.tsx` → `<Providers remoteConfig>`,
then re-applies the admin bypass once `isAuthReady`.

**Admin bypass**: `featureFlagBypass` is a JSON string like `{ "regex": [".+@example.org"] }`. When the
signed-in email matches, `applyAdminBypass()` flips **every boolean flag to true**. Note that
`RemoteConfig.ts` carries a stale `// FEATUTRE BYPASS CURRENTLY DISABLED` comment — the bypass **is** wired
and active. Don't trust that comment.

**Static-page caveat**: for statically rendered pages the values are baked at build time and persist for the
page's cache lifetime. Flipping a Remote Config value in production generally warrants a redeploy.

## Per-user flags

Canonical reference: `docs/user-feature-flags.md` (includes the full architecture diagram and the rationale
for rejecting Redux). Read it before changing the mechanism.

### Adding one — a single file

```ts
// src/app/interface/UserFeatureFlags.ts
export interface UserFeatureFlags {
  isNotificationsEnabled: boolean;
  myNewFlag: boolean;              // add here
}

export const defaultUserFeatureFlags: UserFeatureFlags = {
  isNotificationsEnabled: false,
  myNewFlag: false,                // and here
};
```

`UserFeatureFlagId`, `useUserFeatureFlags()`, and `toUserFeatureFlags()` all pick it up automatically —
`toUserFeatureFlags()` merges unknown keys gracefully and falls back to the default. **Default to `false`**
so a missing or unverifiable cookie fails closed.

All flags are `boolean` today. `toUserFeatureFlags()` does not check the API's `value_type`; if you add a
non-boolean flag, add a `value_type === 'boolean'` guard before widening the pattern.

### Reading

```tsx
// Server Component
import { getServerFlags } from '../actions/feature-flags';
const { myNewFlag } = await getServerFlags();

// Client component
'use client';
import { useUserFeatureFlags } from '../context/UserFeatureFlagProvider';
const { myNewFlag } = useUserFeatureFlags();
```

### How it moves (read path ≠ write path)

- **Write**: login saga (or hourly renewal via `AuthSessionProvider`) gets `UserProfile.features[]` from
  `GET /v1/user`, calls `applyUserFeatureFlags()` → `POST /api/feature-flags`, which HMAC-SHA256-signs the
  payload into the httpOnly `md_features` cookie (1 h). On success it broadcasts the resolved flags on
  `FEATURE_FLAGS_CHANNEL`, which also fires the sending tab's own listener — so **no read-after-write round
  trip**, and every open tab updates at once.
- **Read (server)**: `getServerFlags()` (`src/app/actions/feature-flags.ts`) reads the cookie, verifies the
  HMAC with `timingSafeEqual` against `NEXT_SESSION_JWT_SECRET`, returns defaults on any failure.
- **Read (client)**: `UserFeatureFlagProvider` holds **ephemeral React state** — not Redux, not persisted.
  It's seeded server-side from `[locale]/layout.tsx` → `<Providers featureFlags>`, so the first render is
  flash-free. It resets to defaults when `isAuthenticated` goes false.

Failures on the write path are deliberately swallowed — stale flags beat a broken login or session renewal.

### Security limitation — read before gating anything real

`POST /api/feature-flags` **does not verify the caller**. It signs whatever array it's handed. That's an
accepted tradeoff only because today's flags are UI conveniences. Before adding a flag that gates real
access (paywall, admin capability), that route needs `/api/session`-style treatment: accept a Firebase ID
token, verify it server-side, and resolve flags from the user service rather than trusting the client.
Enforce actual access server-side regardless.

## Gotchas

- `isNotificationsEnabled` exists in **both** systems. The live consumer
  (`screens/Feed/components/ClientSubscribeControls.tsx`) reads it from `useRemoteConfig()`. Real
  duplication — check which one a given call site means before changing either.
- `useUserFeatureFlags()` currently has no production consumers; the plumbing is newer than its usage.
- Redux was rejected on purpose: `redux-persist` writes to `localStorage`, which leaks one user's flags to
  the next on a shared device. Don't move flags into Redux.
- Don't call `cookies()` from a `static/` feed-detail route to read flags — it breaks static rendering.

## Testing

- Jest: `next-intl` is globally mocked and returns keys; mock `getServerFlags` or the provider directly.
- Cypress: the provider exposes `window.__featureFlags` under Cypress (mirroring the `window.store` trick),
  and specs intercept `POST **/api/feature-flags`. See `cypress/e2e/userFeatureFlags.cy.ts`.
- The session-renewal block in that spec is `describe.skip` — the renewal interval doesn't fire under CI's
  `next start`. Don't un-skip it without fixing that.
