---
description: Add a feature flag to the correct system (global Remote Config vs per-user) and wire it up
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, Skill
argument-hint: "<flagName> [and what it gates]"
---

Add a feature flag: $ARGUMENTS

**First load the `mobility-feature-flags` skill** — this repo has two independent flag systems and choosing
wrong is the common failure.

## 1. Choose the system

- **Firebase Remote Config** — global toggle/kill switch, flipped for everyone without a deploy, works for
  logged-out users. Define in `src/app/interface/RemoteConfig.ts`.
- **Per-user flags** — the backend decides per user (entitlement, staged rollout). If it already appears in
  `UserProfile.features[]` from `GET /v1/user`, it's this one. Define in
  `src/app/interface/UserFeatureFlags.ts`.

If the request is ambiguous, ask which one rather than guessing — they have different sources of truth and
different security properties.

## 2. Define it

Add the key to the interface **and** to the defaults object in the same file. **Default to `false`** so
missing/unverifiable config fails closed. For per-user flags that single edit is sufficient — the ID type,
the hook, and `toUserFeatureFlags()` all derive from it.

## 3. Read it

```tsx
// Server Component — Remote Config
const config = await getUserRemoteConfigValues();   // applies the admin bypass
// Server Component — per-user
const { myNewFlag } = await getServerFlags();

// Client — Remote Config
const { config } = useRemoteConfig();
// Client — per-user
const { myNewFlag } = useUserFeatureFlags();
```

Gate with a ternary, not `&&` (skill rule `rendering-conditional-render`).

## 4. Check before you finish

- Does this flag gate **real access** (paywall, admin capability) rather than UI convenience? If per-user:
  `POST /api/feature-flags` does not verify its caller, so a client could set its own value. Enforce access
  server-side and flag the hardening need to the user.
- Is a same-named flag already in the *other* system? `isNotificationsEnabled` is in both — check for
  duplication before adding.
- Don't read flags via `cookies()` inside a `static/` feed-detail route; it breaks static rendering.
- Don't put flags in Redux (`redux-persist` → `localStorage` leaks them across users on shared devices).

## 5. Verify

`yarn lint` and `yarn test:ci`. Then tell the user what still needs doing outside the code — creating the
parameter in the Firebase console, or the backend returning the new `features[]` entry.
