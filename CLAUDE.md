# Mobility Database Web

Next.js 16 App Router app for browsing and managing public transit feeds (GTFS Schedule, GTFS-Realtime, GBFS).
Stack: Next 16.1.1 · React 19 · TypeScript 6 (strict) · MUI 7 + Emotion · Redux Toolkit + redux-saga · next-intl 4 · Firebase (client compat + Admin) · Sentry · Node 24.x · **yarn** (not npm).

## Always apply the Vercel performance skill

When writing, reviewing, or refactoring React/Next code, apply the `vercel-react-best-practices` skill
(`.claude/skills/vercel-react-best-practices/`) — 57 rules ordered by impact. Prefer its guidance over
generic heuristics, and say when you've applied it.

One project-specific exception: see *Barrel imports are fine here* below.

## Commands

```bash
yarn install                # yarn, never npm install
yarn start:dev              # dev server :3000
yarn start:dev:mock         # dev server :3001 with MSW mocks
yarn lint                   # eslint src           <- CI gate
yarn lint:fix
yarn test                   # jest
yarn test:ci                # CI=true jest         <- CI gate
yarn build:prod             # next build           <- the ONLY typecheck gate (see below)
yarn e2e:setup              # next build + start :3001 (MSW) + Firebase auth emulator :9099
yarn e2e:setup:dev          # same, but next dev (faster iteration)
yarn e2e:run                # cypress run against :3001
yarn e2e:open               # cypress interactive
yarn generate:api-types     # OpenAPI -> src/app/services/feeds/types.ts
yarn generate:gbfs-validator-types
yarn generate:user-api-types
```

**There is no `typecheck` script and CI never runs `tsc --noEmit`.** Type errors surface only in
`yarn build:prod` (and via ESLint's type-aware rules). After non-trivial type changes, run
`npx tsc --noEmit` yourself rather than assuming lint caught it.

CI on PRs: `yarn lint` + `yarn test:ci` for everyone; Cypress e2e + Vercel preview + Lighthouse only for
same-repo PRs (forks lack secrets). Lighthouse has **no assertions** — it comments but never blocks.
PR titles must follow Conventional Commits (`feat: …`, `fix: …`).

## Architecture

### Everything lives under `src/app/[locale]/`

There is **no `src/app/layout.tsx`** — the real root layout is `src/app/[locale]/layout.tsx`. Every route
sits under the `[locale]` segment.

**This app is 100% App Router.** There is no React Router, no `BrowserRouter`, and no `src/app/App.tsx`
(`react-router` is not even a dependency). Any instruction claiming a legacy React Router layer is stale.

### Server vs Client Components

Server Components are the default: data fetching, token minting, Firebase Admin, Remote Config.
Add `'use client'` only for interactivity (hooks, state, events). Server→client data crosses the boundary
in exactly three payloads, all set up in `[locale]/layout.tsx`: `messages` (next-intl), `remoteConfig`, and
`featureFlags`. **Never pass tokens or credentials to the client.**

### i18n is path-prefixed, not subdomain-based

`src/i18n/routing.ts`: locales `en` (default, unprefixed) and `fr` (`/fr/...`), `localePrefix: 'as-needed'`,
`localeDetection: false` — users must navigate to `/fr` explicitly. There is no `src/i18n/config.ts` and no
subdomain logic anywhere.

**Import navigation primitives from `src/i18n/navigation.ts`, never from `next/link` / `next/navigation`:**

```tsx
// path is relative to your file — the @/ alias does not work (see File organization)
import { Link, redirect, usePathname, useRouter } from '../../i18n/navigation';
```

Otherwise locale prefixes are dropped. Messages live in `messages/{en,fr}.json`; client components use
`useTranslations('namespace')`, server components `getTranslations()` / `getLocale()` from `next-intl/server`.

### `src/proxy.ts` — the authed/static split

Next 16 renamed `middleware.ts` to **`proxy.ts`**. It does two jobs:

1. Injects the default locale when the path has none.
2. Rewrites feed-detail URLs based on the `md_session` cookie:
   - authenticated non-guest → `.../[feedId]/authed/...` + header `x-mdb-authed-proxy: 1` (dynamic,
     per-user data cache 10 min, no shared page cache)
   - everyone else → `.../[feedId]/static/...` + header `x-mdb-static-proxy: 1` (ISR, ~14 day page TTL)

The `authed/layout.tsx` returns `notFound()` unless the proxy header is present, so these routes can't be
hit directly. **`static/` routes must never call `cookies()` or `headers()`** — that would opt them out of
static rendering. Reuse `src/app/utils/proxy-helpers.ts` rather than re-parsing pathnames.

See `docs/feed-detail-caching-flow.md`. Cache invalidation vocabulary lives in
`src/app/utils/revalidate-feeds.ts`; the external entrypoint is `src/app/api/revalidate/` (has its own README).

### Server-side auth (the part that surprises people)

The Mobility Feed API sits behind Google IAP with Identity Platform. **The client's Firebase token is never
forwarded to the server.** Server calls mint their own credentials:

```tsx
// In any Server Component / server util
const [accessToken, userContextJwt] = await Promise.all([
  getSSRAccessToken(),              // src/app/utils/auth-server.ts — canonical token provider
  getUserContextJwtFromCookie(),    // forwards end-user identity as x-mdb-user-context
]);
const feed = await getGtfsFeed(feedId, accessToken, userContextJwt);
```

`generateAuthMiddlewareWithToken(accessToken, userContextJwt?)` lives in
`src/app/services/api-auth-middleware.ts` and is applied per-call via the use/eject pattern in
`src/app/services/feeds/index.ts`. Firebase Admin is initialized **only** through
`getFirebaseAdminApp()` in `src/lib/firebase-admin.ts`.

Full detail, env vars, and troubleshooting: `docs/Authentication.md` (or the `mobility-auth` skill).

### Two separate feature-flag systems — pick the right one

| | Firebase Remote Config | User feature flags |
|---|---|---|
| Scope | Global | Per-user |
| Source | Firebase | `GET /v1/user` → HMAC-signed `md_features` cookie |
| Server read | `getRemoteConfigValues()` / `getUserRemoteConfigValues()` (`src/lib/remote-config.server.ts`) | `getServerFlags()` (`src/app/actions/feature-flags.ts`) |
| Client read | `useRemoteConfig()` → `{ config }` | `useUserFeatureFlags()` → flags |
| Define a flag | `src/app/interface/RemoteConfig.ts` | `src/app/interface/UserFeatureFlags.ts` |

Remote Config is cached 5 min (dev) / 1 hour (prod) and has an admin email-regex bypass that flips every
boolean true (`featureFlagBypass`). Note `RemoteConfig.ts` carries a stale
`// FEATUTRE BYPASS CURRENTLY DISABLED` comment — the bypass **is** active.

`docs/user-feature-flags.md` explains the cookie + BroadcastChannel design and why Redux was rejected.
Known gap: `POST /api/feature-flags` does not verify the caller — fine for UI-only flags, must be hardened
before a flag gates real access.

### API layer

Type-safe `openapi-fetch` clients. **Never hand-write API response types** — regenerate:

- Feed API → `src/app/services/feeds/types.ts` (`yarn generate:api-types`)
- GBFS validator → `.../gbfs-validator-types.ts`
- User service → `src/app/services/user-service-api-types.ts`

Prefer the ergonomic aliases and type guards in `src/app/services/feeds/utils.ts` (`AllFeedType`,
`GTFSFeedType`, `GBFSFeedType`, `isGtfsFeedType`, `getLocationName`, …) over raw `paths[...]` indexing.

### State

- **Redux Toolkit + saga** for auth/profile, analytics, GBFS validator, licenses (`src/app/store/`).
  The store is a module-level singleton, not a per-request factory.
- **redux-persist persists the whole root reducer** except `userProfile.errors` and
  `userProfile.isRefreshingAccessToken`. Don't put anything user-scoped and sensitive in Redux.
- `<Provider>` is mounted globally **without** `PersistGate` so SSG/SSR renders immediately.
  Wrap routes needing rehydrated state — or `useSearchParams()` — in `components/ReduxGateWrapper.tsx`.
  Check rehydration with `useRehydrated()`.
- **React context** (not Redux) for theme, Remote Config, and user feature flags.
- **SWR** for the `/feeds` search (`src/app/[locale]/feeds/lib/useFeedsSearch.ts`).
- Typed hooks: `useAppDispatch`, `useAppSelector` from `src/app/hooks/`.

`profile-reducer` `status` is a 10-value union; the load-bearing distinction is
`registered` vs `authenticated`, not just authenticated/unauthenticated.

## Conventions

### File organization

The dominant, current convention is **route-colocated code**:
`src/app/[locale]/<route>/{components,lib}/` (metrics uses the private `_components/` prefix).
Prefer this for new work.

- `src/app/components/` — genuinely shared UI
- `src/app/services/` — API clients and external integrations
- `src/app/utils/`, `src/lib/` — helpers (`src/lib` is server-only territory)
- `src/app/screens/` — older page-level components; only `Feed/`, `Feeds/`, `GbfsValidator/` are
  directories, the rest are flat files. Not the pattern to extend.
- `*.functions.tsx` is **not** a general convention — only 2 files use it. Don't create more just to
  follow it; do extract pure logic so it can be unit-tested (see Testing).

Use **relative imports**. The `@/*` alias resolves in Jest but is **absent from `tsconfig.json` paths**, so
`@/...` breaks `next build`.

### Barrel imports are fine here

Next 16 ships `optimizePackageImports` defaults covering `@mui/material`, `@mui/icons-material`,
`recharts`, and `date-fns`, plus a `modularizeImports` transform for `lodash`. So the codebase-standard
barrel form is correct and compiles to direct imports:

```tsx
import { Box, Typography } from '@mui/material';  // fine — auto-optimized
import { debounce } from 'lodash';                 // fine — rewritten to lodash/debounce
```

The skill's `bundle-barrel-imports` rule still applies to any library **not** on that list — add such a
library to `optimizePackageImports` in `next.config.mjs` or import from its source path.

### Style

Prettier (`prettier/prettier` is an ESLint **error**, so unformatted code fails CI): single quotes in TS
*and* JSX attributes, semicolons, 80 columns, trailing commas. Explicit function return types everywhere —
not lint-enforced, but match it.

Notable lint rules: `@typescript-eslint/no-floating-promises` and `no-explicit-any` are **errors** (use
`unknown` + narrowing, or `.then().catch()` for fire-and-forget). `no-unsafe-*`, `require-await`, and
`no-misused-promises` are deliberately off. **All of `react-hooks/exhaustive-deps` and `rules-of-hooks` are
off** with a TODO — lint will not catch dependency mistakes, so reason about them yourself. `yarn lint`
covers `src` only.

### Maps and tables

- Maps: `maplibre-gl` + `react-map-gl` + `pmtiles` (+ `@turf/center`). Base wrapper `components/Map.tsx`;
  colors come from `useMapConfig()` because MapLibre needs concrete values, not CSS vars.
  `LngLatTuple` is `[lng, lat]` — MapLibre order, not Leaflet's.
- Tables: `material-react-table` for metrics and `components/Locations.tsx`; the feeds search tables are
  hand-rolled MUI. Charts: `recharts`.
- Forms: `formik` + `yup` on auth screens, `react-hook-form` in the contribute wizard. Match the local file.

### Environment variables

Client-exposed vars need the `NEXT_PUBLIC_` prefix. Read through `getEnvConfig(key)`
(`src/app/utils/config.ts`) rather than raw `process.env` — it strips unreplaced `{{KEY}}` placeholders.
Server-only secrets: `GOOGLE_SA_JSON`, `NEXT_SESSION_JWT_SECRET`, `GCIP_API_KEY`, `CRON_SECRET`.

## Testing

Unit tests are co-located `*.spec.ts(x)` under `src/` (Jest + React Testing Library). Cypress e2e lives in
`cypress/e2e/`.

**The dominant idiom is testing pure functions** — 14 of 19 spec files import extracted helpers rather than
rendering. Prefer extracting logic to make it testable over mounting a heavy tree.

Things already true of every Jest test — don't redo them:

- `next-intl` is globally mocked and `useTranslations()` returns the **key**. Assert on translation keys,
  never English strings.
- `global.fetch` is a bare `jest.fn()`. Set `mockResolvedValue` yourself. **MSW is not wired into Jest.**
- `firebase/auth` providers are stubbed; `TZ=UTC` is forced for deterministic dates.
- `next/server` has a hand-rolled `NextResponse` for route-handler tests.

Per-test patterns: mock `src/i18n/navigation` locally when a component navigates. Wrap MUI components in
`<ThemeProvider theme={theme}>` — there is **no shared `renderWithProviders` helper**, and you should not
wrap in the app's `<Providers>` (it starts MSW and Firebase). For route handlers and `server-only` modules,
add the docblock pragma:

```ts
/**
 * @jest-environment node
 */
```

If you add an ESM-only dependency that a tested module imports, add it to `transformIgnorePatterns` in
`jest.config.ts` or tests fail with "Cannot use import statement outside a module".

E2E: `yarn e2e:setup` then `yarn e2e:run`. Auth uses the Firebase emulator on :9099 —
`cy.createNewUserAndSignIn()` for the real path (it wipes **all** emulator accounts), or
`cy.injectAuthenticatedUser()` to dispatch straight into `window.store`. Mock data comes from MSW
(`src/mocks/handlers.ts`, fixtures shared from `cypress/fixtures/`) plus per-test `cy.intercept()`.
Select by `data-testid`.

One test is currently skipped: session-renewal in `cypress/e2e/userFeatureFlags.cy.ts` — the renewal
interval doesn't fire under CI's `next start`.

## Gotchas

- **Legacy route hack**: in `src/app/[locale]/feeds/[feedDataType]/page.tsx` the `feedDataType` param is
  actually a **feedId**. It looks up the feed and redirects to the canonical
  `/feeds/{data_type}/{feedId}`. Don't "fix" the naming.
- `docs/feed-detail-caching-flow.md` writes the cookie as `session_md`; the code uses **`md_session`**.
- `isNotificationsEnabled` exists in *both* flag systems; the live consumer reads it from
  `useRemoteConfig()`. Real duplication, not a doc error.
- `src/mocks/data/*.json` look like dead duplicates of `cypress/fixtures/*`.
- Worktrees: `yarn new-worktree feat/x` / `yarn remove-worktree feat/x` (copies `.env*`, hard-links
  `node_modules`).

## Reference docs

| Doc | What it covers |
|---|---|
| `docs/Authentication.md` | GCIP/IAP token flow, `md_session`, env vars, mock mode, troubleshooting |
| `docs/user-feature-flags.md` | Per-user flags: cookie + BroadcastChannel, adding a flag, design rationale |
| `docs/feed-detail-caching-flow.md` | Feed-detail caching and revalidation (Mermaid) |
| `docs/ssg-initial-flow.md` | Build-time SSG and hydration path (Mermaid) |
| `src/app/api/revalidate/README.md` | Revalidate endpoint request/response contract |

`.github/copilot-instructions.md` is retained for GitHub Copilot during the migration. **This file is the
source of truth** — the Copilot file contains stale paths (`src/app/App.tsx`, `src/i18n/config.ts`,
non-`[locale]` routes) and predates the user feature-flag system. If you change project conventions,
update both.
