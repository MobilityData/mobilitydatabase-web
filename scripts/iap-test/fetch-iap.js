/*
 * Minimal script to acquire an IAP OIDC ID token and call the API.
 * Reads configuration from environment variables (see .env.sample).
 */

const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config();

function base64UrlDecode(input) {
  // Pad input to multiple of 4 and replace URL-safe chars
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = input.length % 4;
  if (pad) input += '='.repeat(4 - pad);
  return Buffer.from(input, 'base64').toString('utf8');
}

function decodeJwt(jwt) {
  try {
    const [header, payload] = jwt.split('.');
    const h = JSON.parse(base64UrlDecode(header));
    const p = JSON.parse(base64UrlDecode(payload));
    return { header: h, payload: p };
  } catch (e) {
    return null;
  }
}

async function main() {
  const audience = process.env.IAP_AUDIENCE;
  const apiUrl = process.env.API_URL;
  const saJsonPath = process.env.GOOGLE_SA_JSON_PATH;
  const saJsonInline = process.env.GOOGLE_SA_JSON;
  const logClaims = String(process.env.LOG_JWT_CLAIMS || 'false').toLowerCase() === 'true';

  if (!audience) {
    console.error('Missing IAP_AUDIENCE');
    process.exit(2);
  }
  if (!apiUrl) {
    console.error('Missing API_URL');
    process.exit(2);
  }

  let credentials;
  if (saJsonPath && fs.existsSync(path.resolve(saJsonPath))) {
    credentials = JSON.parse(fs.readFileSync(path.resolve(saJsonPath), 'utf8'));
  } else if (saJsonInline) {
    credentials = JSON.parse(saJsonInline);
  } else {
    console.error('Provide GOOGLE_SA_JSON_PATH or GOOGLE_SA_JSON');
    process.exit(2);
  }

  const auth = new GoogleAuth({ credentials });
  const client = await auth.getIdTokenClient(audience);

  // Intercept to print the ID token (and optionally decode claims)
  const origRequest = client.request.bind(client);
  client.request = async (opts) => {
    const res = await origRequest(opts);
    return res;
  };

  // The getRequestHeaders() includes Authorization header; we can decode claims for sanity
  const headers = await client.getRequestHeaders();
  const token = (headers.Authorization || headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    console.error('Failed to obtain ID token');
    process.exit(1);
  }
  if (logClaims) {
    const decoded = decodeJwt(token);
    if (decoded) {
      console.log('JWT header:', JSON.stringify(decoded.header, null, 2));
      console.log('JWT payload:', JSON.stringify(decoded.payload, null, 2));
      if (decoded.payload && decoded.payload.iss) {
        console.log('JWT issuer:', decoded.payload.iss);
      }
      if (decoded.payload && decoded.payload.aud !== audience) {
        console.warn('Warning: token aud does not match IAP_AUDIENCE');
      }
    }
  }

  console.log(`Calling ${apiUrl} with IAP audience ${audience}...`);
  try {
    const res = await client.request({ url: apiUrl });
    console.log('Status:', res.status);
    if (res.status >= 400) {
      console.error('Error body:', res.data);
      process.exit(1);
    }
    console.log(typeof res.data === 'string' ? res.data : JSON.stringify(res.data));
  } catch (err) {
    if (err.response) {
      console.error('Request failed:', err.response.status, err.response.data);
      const body = typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data);
      if (err.response.status === 401 && /Invalid GCIP ID token/i.test(body)) {
        console.error('Hint: IAP is configured with Identity Platform (GCIP). Use fetch-gcip.js instead of fetch-iap.js.');
      }
    } else {
      console.error('Error:', err.message);
    }
    process.exit(1);
  }
}

main();
