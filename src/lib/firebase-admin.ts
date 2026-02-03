import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import fs from 'node:fs';
import path from 'node:path';
import { getEnvConfig, nonEmpty } from '../app/utils/config';

/**
 * Centralized Firebase Admin initialization.
 * Prefers explicit service account credentials via env.
 * Fallback to ADC only when GOOGLE_APPLICATION_CREDENTIALS is set.
 */

/**
 * Server-only Firebase Admin SDK initialization.
 * Uses Application Default Credentials (ADC) which works automatically on Cloud Run.
 * For local development, you can either:
 * 1. Run `gcloud auth application-default login`
 * 2. Set GOOGLE_APPLICATION_CREDENTIALS env var to a service account JSON path
 */

let adminApp: App | undefined;

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
