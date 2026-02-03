/*
 * GCIP (Identity Platform) token flow for IAP when IAP is configured with GCIP.
 * 1) Use Firebase Admin to mint a custom token for a synthetic service user.
 * 2) Exchange the custom token for a GCIP ID token via Identity Toolkit API.
 * 3) Call the IAP-protected API with Authorization: Bearer <GCIP ID token>.
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
require('dotenv').config();

function ensureEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}`);
    process.exit(2);
  }
  return v;
}

async function main() {
  const apiUrl = ensureEnv('API_URL');
  const saJsonPath = process.env.GOOGLE_SA_JSON_PATH;
  const saJsonInline = process.env.GOOGLE_SA_JSON;
  const projectId = ensureEnv('GCIP_PROJECT_ID');
  const apiKey = ensureEnv('GCIP_API_KEY');
  const tenantId = process.env.GCIP_TENANT_ID || undefined; // optional if default tenant
  const serviceUid = process.env.GCIP_SERVICE_UID || 'iap-service-caller';

  let credentials;
  if (saJsonPath && fs.existsSync(path.resolve(saJsonPath))) {
    credentials = JSON.parse(fs.readFileSync(path.resolve(saJsonPath), 'utf8'));
  } else if (saJsonInline) {
    credentials = JSON.parse(saJsonInline);
  } else {
    console.error('Provide GOOGLE_SA_JSON_PATH or GOOGLE_SA_JSON');
    process.exit(2);
  }

  if (!credentials.client_email || !credentials.private_key) {
    console.error('Service Account JSON must include client_email and private_key');
    process.exit(2);
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(credentials),
      projectId,
    });
  }

  // Mint a custom token for a synthetic service user UID.
  const customToken = await admin.auth().createCustomToken(serviceUid, {
    service: true,
  });

  // Exchange the custom token for an ID token.
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`;
  const body = {
    token: customToken,
    returnSecureToken: true,
  };
  if (tenantId) body.tenantId = tenantId;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.error('Failed to exchange custom token:', resp.status, errText);
    process.exit(1);
  }
  const tokens = await resp.json();
  const idToken = tokens.idToken;
  if (!idToken) {
    console.error('No idToken in response');
    process.exit(1);
  }

  // Call the IAP-protected API with GCIP ID token.
  console.log(`Calling ${apiUrl} with GCIP ID token (tenant: ${tenantId || 'default'})...`);
  const apiResp = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  console.log('Status:', apiResp.status);
  const data = await apiResp.text();
  if (apiResp.status >= 400) {
    console.error('Error body:', data);
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(JSON.parse(data), null, 2));
  } catch {
    console.log(data);
  }
}

main().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
