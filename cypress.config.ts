import { defineConfig } from 'cypress';
import * as dotenv from 'dotenv';
const localEnv = dotenv.config({ path: './.env.development' }).parsed || {};
const ciEnv = dotenv.config({ path: './.env.local' }).parsed || {};

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const chosenEnv = isCI ? ciEnv : localEnv;


export default defineConfig({
  env: chosenEnv,
  e2e: {
    // Use CYPRESS_BASE_URL env var if set (for e2e:run/e2e:open), otherwise default to 3000
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3000',
  },
  video: true,
});
