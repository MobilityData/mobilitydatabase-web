---
name: mobility-testing
description: How to write tests that actually pass in this repo — the global Jest mocks (next-intl returns keys, fetch is a bare jest.fn, no MSW in Jest), the pure-function-first idiom, the node environment pragma for server code, transformIgnorePatterns, and Cypress emulator auth patterns. Load this before writing or fixing any Jest spec or Cypress e2e spec, or when a test fails with "Cannot use import statement outside a module", an unexpected translation-key assertion, or a fetch that returns undefined.
---

# Testing in Mobility Database Web

Unit: Jest + React Testing Library, co-located `*.spec.ts(x)` under `src/`. E2E: Cypress in `cypress/e2e/`.
Currently 19 spec files / 195 tests, all green. There are **no `__tests__/` directories** and no
`*.test.tsx` files — follow the co-located `.spec` convention.

```bash
yarn test          # jest
yarn test:watch
yarn test:ci       # CI=true jest   <- the exact CI command
```

Tests must live under `src/` — `testMatch` never picks up anything in `cypress/`.

## Prefer testing pure functions

14 of 19 specs test extracted helpers rather than rendering components. When logic is worth testing, extract
it to a named export or a `lib/` module and test that. Reach for `render()` only when the assertion is
genuinely about the DOM. `src/app/screens/Feed/Feed.spec.tsx` even uses `renderToStaticMarkup` for
metadata-generator output instead of RTL.

## Already mocked globally — do not redo these

From `src/setupTests.ts`, applied to **every** Jest test:

1. `@testing-library/jest-dom` matchers.
2. **`next-intl` is mocked: `useTranslations()` returns an identity function.** So `t('myKey')` renders
   `"myKey"`. **Assert on translation keys, never English strings.** `useLocale()` returns `'en'`.
3. `next-intl/server`: `getTranslations()` is identity except a tiny hardcoded table (`common.others`,
   `common.gtfsSchedule` → `'GTFS schedule'`, `common.gtfsRealtime` → `'GTFS realtime'`,
   `feeds.detailPageDescription`). `getLocale()` → `'en'`.
4. **`global.fetch = jest.fn()`** — a bare mock returning `undefined`. Any test hitting fetch must set
   `(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({...}) })`.
   **MSW is not wired into Jest at all** — don't expect `src/mocks/handlers.ts` to fire.
5. `firebase/auth` provider constructors (`GoogleAuthProvider`, `GithubAuthProvider`, `OAuthProvider`).
6. `next/server` — a hand-rolled `NextResponse` (`next`/`rewrite`/`redirect`/`json` return plain objects
   with `{ body, status, json, ok, headers }`), for route-handler and proxy tests.
7. `TextEncoder` polyfill.

`jest-global-setup.ts` forces `process.env.TZ = 'UTC'`, so date assertions are deterministic.

## Per-test patterns

**Mock navigation locally** whenever a component navigates — `next-intl` itself is already handled:

```tsx
jest.mock('../../../i18n/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/',
}));
```

**Wrap MUI components in the real theme.** There is deliberately **no shared `renderWithProviders` helper** —
each spec wraps ad hoc, and you must **not** wrap in the app's `<Providers>` (it starts MSW and Firebase):

```tsx
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../../Theme';

render(<ThemeProvider theme={theme}><MyComponent /></ThemeProvider>);
```

**Server code needs the node environment** — route handlers, proxy logic, and `server-only` modules:

```ts
/**
 * @jest-environment node
 */
```

See `src/app/api/revalidate/route.spec.ts` and `src/lib/remote-config.server.spec.ts`. Those also show the
env-restoration idiom: `jest.clearAllMocks(); process.env = { ...originalEnv };` in `beforeEach`.

**Partial-mock a module** to keep the real exports you need:

```tsx
jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useDispatch: () => mockDispatch,
}));
```

**Capturing a Firebase auth callback** (the fullest example is
`src/app/components/AuthSessionProvider.spec.tsx`): mock the app's own `src/firebase` module, capture the
`onIdTokenChanged` callback, then drive auth state by invoking it inside `act()`. Build throwaway stores with
a local `makeStore()` and pass a `wrapper` to `renderHook`.

Fixtures are large inline typed objects (`const mockFeedsData: AllFeedsType = {…}`), not factories.
Query via `screen` / `within`, selecting by `data-testid`, role, or text.

## ESM dependencies

`transformIgnorePatterns` in `jest.config.ts` re-enables transformation for a specific allowlist:
`*.mjs`, `@mui`, `@babel`, `uuid`, `nanoid`, `countries-list`, `@turf`, `openapi-fetch`, `next-intl`.

If you add an ESM-only dependency imported (even transitively) by tested code and see
**"SyntaxError: Cannot use import statement outside a module"**, add it to that list.

## Other config facts

- `moduleNameMapper` maps `@/*` → `src/*` in Jest, **but `tsconfig.json` has no such alias** — so `@/`
  imports pass tests and break `next build`. Use relative imports.
- No coverage thresholds; coverage isn't collected unless you pass `--coverage`. CI doesn't enforce it.
- `yarn lint` covers `src` only, so Cypress specs are unlinted — still match the Prettier style
  (single quotes incl. JSX, semicolons, 80 cols).

## Cypress

```bash
yarn e2e:setup        # next build + start :3001 (MSW) + Firebase auth emulator :9099  <- CI uses this
yarn e2e:setup:dev    # same but next dev — faster iteration
yarn e2e:run          # cypress run against :3001
yarn e2e:open         # interactive
```

Env comes from `.env.development` locally, `.env.local` in CI (created by `vercel env pull`); everything in
it is available as `Cypress.env('KEY')`. `baseUrl` is forced to :3001 by the scripts.

Two auth paths — pick deliberately:

- **`cy.createNewUserAndSignIn(email, password)`** — the real path against the emulator. It signs out, then
  **wipes all emulator accounts**, then creates the user. So specs must not assume other users exist, and
  ordering matters.
- **`cy.injectAuthenticatedUser(email)`** — the shortcut: dispatches `userProfile/loginSuccess` straight
  into `window.store` (exposed only under Cypress, see `src/app/store/store.ts`). Use when the test is about
  something downstream of login, not login itself.

Other commands: `cy.muiDropdownSelect(elementKey, dataValue)`, `cy.assetMuiError(elementKey)` (sic — it
asserts `Mui-error`). Declared in `cypress/support/index.ts`, implemented in `cypress/support/commands.ts`.

Data comes from **two layers**: MSW handlers (`src/mocks/handlers.ts`, fixtures imported from
`cypress/fixtures/`) for the shared feed catalog, plus per-test `cy.intercept()` for user/session endpoints
(`GET|PUT **/v1/user`, `POST **/api/feature-flags`, `DELETE **/api/session`, …). To add a mocked catalog
endpoint, append to the handlers array — both the browser worker and the node server pick it up.

`UserFeatureFlagProvider` also exposes `window.__featureFlags` under Cypress.

Select by `data-testid` almost exclusively.

**Currently skipped**: the session-renewal `describe.skip` in `cypress/e2e/userFeatureFlags.cy.ts` — the
renewal interval never fires under CI's `next start`, though it passes locally. Don't un-skip without
fixing the underlying cause.

## What CI actually gates

`yarn lint` and `yarn test:ci` for all PRs including forks. Cypress e2e, the Vercel preview, and Lighthouse
run only for same-repo PRs. **Lighthouse has no assertions — it can never block a merge.** No
`tsc --noEmit` step anywhere: type errors surface only via `next build` (which `yarn e2e:setup` runs).
