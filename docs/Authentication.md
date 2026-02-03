# Authentication Architecture (SSR + IAP via GCIP)

This document explains how server-side authentication works in the Mobility Database Web app when calling the Mobility Feed API behind Google Cloud IAP with Identity Platform (GCIP). It also covers local development without Firebase access.

## Overview
- Server components/actions call the Mobility Feed API using a server‑minted GCIP ID token.
- The client never forwards its token to the server; all API calls use server credentials only.
- Firebase Admin is initialized once via a centralized helper and used for both Remote Config and token minting.
- Mock mode (MSW) enables local development without hitting the real API or Firebase.

## Server‑Side Token Flow (IAP + Identity Platform)
1. Firebase Admin creates a **custom token** for a service UID (synthetic user identity).
2. The custom token is exchanged with **Identity Toolkit** (`accounts:signInWithCustomToken`) to obtain a **GCIP ID token**.
3. The GCIP ID token is added as `Authorization: Bearer <token>` for calls to the IAP‑protected Mobility Feed API.
4. Tokens are cached server‑side and refreshed a few minutes before expiry.

Key code paths:
- `src/lib/firebase-admin.ts`: centralized Admin initialization (`getFirebaseAdminApp()`), backed by `ensureAdminInitialized()`.
- `src/app/utils/auth-server.ts`: token functions `getGcipIdToken()` and `getSSRAccessToken()` (the canonical token provider for SSR calls).
- `src/app/services/feeds/index.ts`: OpenAPI client; injects `Authorization` header using the token returned by `getSSRAccessToken()`.

## Firebase Admin Initialization
Centralized in `getFirebaseAdminApp()`:
- Reuse existing Admin app if already initialized (matching `NEXT_PUBLIC_FIREBASE_PROJECT_ID`).
- Prefer **inline service account JSON**: `GOOGLE_SA_JSON` (or `FIREBASE_SERVICE_ACCOUNT_JSON` if enabled in your environment).
- Or load **from file path**: `GOOGLE_SA_JSON_PATH` (or `GOOGLE_APPLICATION_CREDENTIALS`).
- Fail fast if no credentials are provided to avoid unpredictable ADC/metadata lookups in serverless/dev environments.

Required service account fields: `project_id`, `client_email`, `private_key`.

## Environment Variables
Server‑side credentials and config (server‑only):
- `GOOGLE_SA_JSON`: Inline service account JSON string.
- `GOOGLE_SA_JSON_PATH`: Absolute/relative path to service account JSON file.
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: Project ID; used to match Admin apps and as fallback when JSON lacks `project_id`.

GCIP / Identity Toolkit:
- `GCIP_API_KEY` (or `FIREBASE_API_KEY` or `NEXT_PUBLIC_FIREBASE_API_KEY`): API key for `accounts:signInWithCustomToken`.
- `GCIP_TENANT_ID` (optional): Tenant ID when using multi‑tenant Identity Platform.
- `GCIP_SERVICE_UID` (optional): Synthetic UID for the server caller (default: `iap-service-caller`).

Mock/dev:
- `NEXT_PUBLIC_API_MOCKING=enabled`: Enables MSW mock service worker in the browser.
- `LOCAL_DEV_NO_ADMIN=1` (optional): Bypass Admin initialization for Remote Config/token code paths during local experimentation.

## Remote Config
- Server‑side code fetches Firebase Remote Config via Admin SDK.
- In mock mode, Remote Config returns defaults to avoid Admin calls.
- Entry points: `src/lib/remote-config.server.ts` and the `Providers` wrapper in `src/app/providers.tsx`.

## Mock Mode (No Real API or Firebase)
Use **MSW** (Mock Service Worker) so mocks behave like a real API without changing app logic.

Setup:
1. Initialize the worker (one‑time):
   ```bash
   npx msw init public/
   ```
2. Start dev in mock mode:
   ```bash
   NEXT_PUBLIC_API_MOCKING=enabled yarn start:dev:mock
   ```
3. Mock handlers live in `src/mocks/handlers.ts`.
   - The browser worker starts from `src/mocks/browser.ts` via `src/app/providers.tsx` when mock mode is enabled.

## Usage in Code
- SSR/API calls: Always obtain `accessToken = await getSSRAccessToken()` in server components/actions, then pass to `openapi-fetch` client.
- Do **not** forward client tokens to the server.
- Keep all credentials server‑only and never expose service account JSON to client code.

## Security Considerations
- **No client token pass‑through**: Prevents elevation of privilege and token replay.
- **Server‑only credentials**: Service account material must never be sent to the client.
- **Optional auditing**: You may forward end‑user identity headers (e.g., `X-User-Subject`, `X-User-Email`) for backend audit trails if required.

## Troubleshooting
Common issues and fixes:
- "Firebase app already exists": Multiple Admin initializations. Use centralized `getFirebaseAdminApp()` and reuse existing apps.
- "Invalid GCIP ID token": IAP configured with Identity Platform requires **GCIP tokens**, not Google OIDC tokens.
- Metadata errors (ENOTFOUND): ADC fallback on local/dev without credentials. Provide explicit service account JSON/path and avoid metadata server.
- Missing fields: Ensure service account JSON contains `project_id`, `client_email`, `private_key`.
- MSW not intercepting: Confirm `NEXT_PUBLIC_API_MOCKING=enabled`, `public/mockServiceWorker.js` exists, and the worker starts in `providers.tsx`.

## Quick Start (Local Dev)
1. Provide service account (either inline or file path):
   - Inline (recommended for Vercel server env):
     - Set `GOOGLE_SA_JSON` to a single‑line JSON string.
   - File path:
     - Set `GOOGLE_SA_JSON_PATH` to the JSON file path.
2. Start dev:
   ```bash
   yarn start:dev
   ```
3. Optional mock mode:
   ```bash
   npx msw init public/
   NEXT_PUBLIC_API_MOCKING=enabled yarn start:dev:mock
   ```

## Deployment (Vercel)
- Set server‑only env vars in Vercel:
  - `GOOGLE_SA_JSON`, `GCIP_API_KEY`, and optionally `GCIP_TENANT_ID`, `GCIP_SERVICE_UID`.
- Ensure `NEXT_PUBLIC_FIREBASE_PROJECT_ID` matches your Firebase project.
- Use Node runtime for server components/actions (default in Next.js 16 App Router).

---
For questions or improvements, see `src/lib/firebase-admin.ts`, `src/app/utils/auth-server.ts`, and `src/mocks/handlers.ts` for practical references.
