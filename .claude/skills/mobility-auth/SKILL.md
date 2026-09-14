---
name: mobility-auth
description: How authentication works in this app — server-side GCIP/IAP token minting, the md_session cookie, end-user context propagation, and Firebase Admin setup. Load this when touching anything that calls the Mobility Feed API from the server, mints or verifies tokens, reads md_session, adds a protected route or API route, changes login/logout/session-renewal behavior, or debugs 401/403 responses, "Firebase app already exists", or "Invalid GCIP ID token" errors.
---

# Authentication in Mobility Database Web

Canonical reference: `docs/Authentication.md`. This skill is the operational summary — read the doc for
env-var detail, Vercel deployment, and the full troubleshooting list.

## The one rule that explains the design

**The client's Firebase ID token is never forwarded to the server for API calls.** The Mobility Feed API is
behind Google Cloud IAP with Identity Platform (GCIP), and the server mints its own credentials. A client
token reaching a server API call is a bug.

Two independent tokens are in play:

| Token | Purpose | Origin |
|---|---|---|
| GCIP ID token | Satisfies IAP — `Authorization: Bearer` | Server-minted for a **service UID**, cached, refreshed ~5 min before expiry |
| User-context JWT | Tells the backend *which end user* — `x-mdb-user-context` | The `md_session` cookie's own JWT, re-used verbatim |

## Making an authenticated server-side API call

```tsx
import { getSSRAccessToken, getUserContextJwtFromCookie } from '../../utils/auth-server';

const [accessToken, userContextJwt] = await Promise.all([
  getSSRAccessToken(),
  getUserContextJwtFromCookie(),
]);
const feed = await getGtfsFeed(feedId, accessToken, userContextJwt);
```

Parallelize with `Promise.all` — these are independent. `getSSRAccessToken()` (`src/app/utils/auth-server.ts`)
is the **canonical** token provider; don't call `getGcipIdToken()` directly. The service functions in
`src/app/services/feeds/index.ts` all take `(…, accessToken, userContextJwt?)` and apply
`generateAuthMiddlewareWithToken(accessToken, userContextJwt?)`
(`src/app/services/api-auth-middleware.ts`) via a per-call use/eject pattern — the middleware is
deliberately **not** registered globally, so don't "simplify" it into one.

## The `md_session` cookie

Server-signed JWT, httpOnly, `sameSite=lax`, `secure` in production, **1 hour** TTL. Payload:
`uid`, optional `email`, `isGuest`, `iat`, `exp`. Signed with `NEXT_SESSION_JWT_SECRET`.

Lifecycle:

1. Client signs in with Firebase Auth (email/password, provider, or anonymous).
2. A Redux saga calls `setUserCookieSession()` (`src/app/services/session-service.ts`), which POSTs the
   Firebase ID token to `/api/session`.
3. `src/app/api/session/route.ts` verifies that token with Firebase Admin, derives
   `isGuest` from `sign_in_provider === 'anonymous'`, signs the session JWT, sets the cookie.
4. `AuthSessionProvider` (`src/app/components/AuthSessionProvider.tsx`) re-checks every 5 minutes and on
   every `onIdTokenChanged`, renewing when stale. On a renewal it also refreshes user feature flags.
5. Logout → `DELETE /api/session` clears both `md_session` and `md_features`.

Reading it server-side:

- `getCurrentUserFromCookie()` → decoded `SessionPayload` (who the user is)
- `getUserContextJwtFromCookie()` → the raw verified JWT (to forward to the backend)
- `isMobilityDatabaseAdmin(email)` for admin checks

Sign/verify helpers live in `src/app/utils/session-jwt.ts`. `auth-server.ts` is `import 'server-only'` —
never import it from a client component.

## Firebase Admin

Initialize **only** via `getFirebaseAdminApp()` in `src/lib/firebase-admin.ts`. It reuses an existing app
(avoiding "Firebase app already exists"), prefers inline `GOOGLE_SA_JSON` over `GOOGLE_SA_JSON_PATH`, and
**fails fast rather than falling back to ADC** — that fail-fast is intentional; ADC fallback causes
confusing metadata-server errors locally and in serverless.

Client-side Firebase is the **compat** SDK (`src/firebase.ts`, `firebase/compat/app` + `firebase/compat/auth`),
though modular `firebase/auth` types are used in places. Under Cypress it points at the auth emulator on
:9099.

## Client-side auth state

Two surfaces, and they are not interchangeable:

- **Redux** `userProfile` (`src/app/store/profile-reducer.ts`) — `status` is a 10-value union. The
  load-bearing distinction is `registered` vs `authenticated`, not merely logged-in/out. Selectors in
  `profile-selectors.ts`.
- **`useAuthSession()`** (`AuthSessionProvider`) — session/cookie readiness, used by the context providers.

Auth logic lives in `src/app/store/saga/auth-saga.ts` (login variants, signup, logout, email verification,
password change/reset, token refresh, cookie session, flag application, cross-tab broadcast).
Cross-tab sync goes through `LOGIN_CHANNEL` / `LOGOUT_CHANNEL` in `src/app/services/channel-service.ts`.

## Protecting things

- **Pages**: wrap in `components/ProtectedPageWrapper.tsx` (plus `ReduxGateWrapper` where rehydrated state
  or `useSearchParams()` is needed).
- **Feed detail**: don't hand-roll — `src/proxy.ts` already routes authed users to `.../authed/` and guests
  to `.../static/`. See the `mobility-feed-caching` skill.
- **Server actions and route handlers**: authenticate them like API routes (skill rule
  `server-auth-actions`). Verify the caller; don't trust a client-supplied body.

Known gap: `POST /api/feature-flags` does **not** verify its caller, unlike `/api/session`. Acceptable only
because today's flags are UI-only. Before any flag gates real access, add idToken verification there.

## Local development without Firebase access

Mock mode bypasses both the real API and Firebase:

```bash
npx msw init public/          # one time
NEXT_PUBLIC_API_MOCKING=enabled yarn start:dev:mock
```

`NEXT_PUBLIC_API_MOCKING=enabled` is checked in `auth-server.ts` (relaxes server auth),
`remote-config.server.ts` (returns defaults), `src/instrumentation.ts` (starts the MSW node server), and
`providers.tsx` (starts the browser worker). `LOCAL_DEV_NO_ADMIN=1` additionally bypasses Admin init.

## Env vars

Server-only: `GOOGLE_SA_JSON` (inline JSON, preferred) or `GOOGLE_SA_JSON_PATH`, `NEXT_SESSION_JWT_SECRET`,
`GCIP_API_KEY`, optional `GCIP_TENANT_ID` / `GCIP_SERVICE_UID` (default `iap-service-caller`).
Shared: `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. Service account JSON must contain `project_id`, `client_email`,
`private_key`. Never expose any of these to client code.

## Debugging

| Symptom | Cause |
|---|---|
| "Firebase app already exists" | Admin initialized outside `getFirebaseAdminApp()` |
| "Invalid GCIP ID token" | Sent a Google OIDC token; IAP+Identity Platform requires a **GCIP** token |
| `ENOTFOUND` / metadata errors | No explicit credentials — ADC fallback attempt; set `GOOGLE_SA_JSON` |
| 401/403 from the Feed API | Missing or stale `accessToken`, or `getSSRAccessToken()` bypassed |
| Backend can't identify the user | `userContextJwt` not threaded through to the service call |
| MSW not intercepting | `NEXT_PUBLIC_API_MOCKING` unset, or `public/mockServiceWorker.js` missing |
