import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import fs from 'node:fs';
import path from 'node:path';
import { getEnvConfig, nonEmpty } from '../app/utils/config';

let adminApp: App | undefined;

/**
 * ensureAdminInitialized
 * Creates or reuses a singleton Firebase Admin App.
 *
 * Selection order:
 * 1) Reuse an existing Admin app from `getApps()`, preferring the one whose
 *    `options.projectId` matches `NEXT_PUBLIC_FIREBASE_PROJECT_ID`; falls back
 *    to the first app if no match.
 * 2) If `GOOGLE_SA_JSON` is set (server-only inline JSON), parse and initialize
 *    with `cert(serviceAccount)`.
 * 3) If `GOOGLE_SA_JSON_PATH` is set, read and parse the JSON file and
 *    initialize with `cert(serviceAccount)`.
 * 4) If none of the above are provided, throws an error to avoid implicit ADC
 *    behavior (metadata server lookups) in serverless environments.
 *
 * Environment variables accessed:
 * - NEXT_PUBLIC_FIREBASE_PROJECT_ID: Used to match existing apps and as fallback
 *   when the service account JSON lacks `project_id`.
 * - GOOGLE_SA_JSON: Server-only inline service account JSON string
 *   (must include `project_id`, `client_email`, and `private_key`).
 * - GOOGLE_SA_JSON_PATH: Path to a service account JSON file containing the
 *   same required fields.
 *
 * Notes:
 * - Uses `getEnvConfig` and `nonEmpty` to read configuration consistently.
 * - Keep credentials server-only; do not expose inline JSON to client code.
 */
function ensureAdminInitialized(): App {
  // Reuse already initialized app
  const existingApps = getApps();
  const projectId = getEnvConfig('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  if (existingApps.length > 0) {
    const matchedApp =
      existingApps.find((app) => app.options?.projectId === projectId) ??
      existingApps[0];
    return matchedApp;
  }

  // Prefer inline service account JSON (server-only)
  const inlineJson = nonEmpty(getEnvConfig('GOOGLE_SA_JSON'));
  if (inlineJson != undefined) {
    const serviceAccount = JSON.parse(inlineJson);
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }

  // Or load from file path
  const filePath = nonEmpty(getEnvConfig('GOOGLE_SA_JSON_PATH'));
  if (filePath != undefined) {
    const raw = fs.readFileSync(path.resolve(filePath), 'utf8');
    const serviceAccount = JSON.parse(raw);
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id ?? projectId,
    });
  }

  // No credentials provided: fail fast instead of attempting metadata server
  throw new Error(
    'Missing server-side credentials. Set GOOGLE_SA_JSON (inline), or GOOGLE_SA_JSON_PATH(file path).',
  );
}

export function getFirebaseAdminApp(): App {
  if (adminApp != undefined) {
    return adminApp;
  }
  adminApp = ensureAdminInitialized();
  return adminApp;
}
