# IAP Test Scripts (IAP + GCIP)

This folder contains two minimal scripts to test calling an IAP-protected API:

- `fetch-iap.js`: Uses a Google OIDC ID token (audience = IAP OAuth Client ID). Works when IAP uses Google accounts.
- `fetch-gcip.js`: Uses an Identity Platform (GCIP) ID token obtained via custom token flow. Use this when IAP is configured with GCIP.

## Environment
Create `.env` based on `.env.sample`:

```env
# Common
API_URL=https://<your-iap-domain>/<path>
GOOGLE_SA_JSON_PATH=./sa-key.json

# IAP (Google accounts)
IAP_AUDIENCE=<your-iap-oauth-client-id>

# GCIP (Identity Platform)
GCIP_PROJECT_ID=<your-project-id>
GCIP_API_KEY=<identity-platform-api-key>
# optional if using multi-tenant
GCIP_TENANT_ID=<tenant-id>
# optional synthetic UID for the service caller
GCIP_SERVICE_UID=iap-service-caller
```

## Install & Run
```bash
# Install local-only deps
npm i google-auth-library firebase-admin node-fetch dotenv

# IAP (Google accounts) flow
node fetch-iap.js

# GCIP (Identity Platform) flow
node fetch-gcip.js
```

### Using Yarn
```bash
# Install
yarn add google-auth-library firebase-admin node-fetch dotenv

# IAP flow
yarn run test:iap

# GCIP flow (default)
yarn test
```

## Notes
- `GCIP_API_KEY` is the Web API key for Identity Platform (Firebase/GCIP). Find it in Google Cloud Console → APIs & Services → Credentials.
- For GCIP multi-tenant, set `GCIP_TENANT_ID` and ensure the IAP resource is linked to the same tenant.
- The Service Account must have access to mint custom tokens and (optionally) act as a service principal.# IAP ID Token Test Script

Minimal Node.js script to fetch a Google-signed OIDC ID token for an IAP-protected HTTPS resource and perform a request to your API.

## Prerequisites
- Node.js 18+ installed
- Service Account with role `roles/iap.httpsResourceAccessor`
- IAP OAuth 2.0 Client ID (the audience)

## Setup
1. Create a service account key locally (for testing only; rotate/secure it):
```bash
PROJECT_ID=<your-project-id>
gcloud iam service-accounts keys create sa-key.json \
  --iam-account=vercel-iap-caller@${PROJECT_ID}.iam.gserviceaccount.com
```

2. Copy `.env.sample` to `.env` and fill values:
```bash
cp .env.sample .env
```

3. Install dependencies and run:
```bash
npm ci
npm run test
```

## Environment Variables
- `IAP_AUDIENCE`: The IAP OAuth client ID (…apps.googleusercontent.com)
- `API_URL`: Full URL to a reachable endpoint (e.g., https://<your-iap-domain>/health)
- `GOOGLE_SA_JSON_PATH` (preferred): Path to SA key JSON file (e.g., `./sa-key.json`).
- `GOOGLE_SA_JSON` (optional): Inline JSON string of SA key (used if `GOOGLE_SA_JSON_PATH` not provided).
- `LOG_JWT_CLAIMS` (optional): `true|false` print decoded JWT claims for verification.

## Notes
- For production (Vercel), store secrets in environment variables and avoid files.
- The audience must exactly match the IAP OAuth client ID configured on the protected resource.