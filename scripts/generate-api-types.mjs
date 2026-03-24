#!/usr/bin/env node
/**
 * Fetches the latest DatabaseCatalogAPI.yaml from the MobilityData/mobility-feed-api
 * GitHub release assets, then runs openapi-typescript.
 *
 * Usage: node scripts/generate-api-types.mjs [output-path]
 * Default output-path: src/app/services/feeds/types.ts
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { get as httpsGet } from 'https';
import { tmpdir } from 'os';
import { join } from 'path';

function httpsGetWithRedirects(url) {
  return new Promise((resolve, reject) => {
    function request(requestUrl) {
      httpsGet(requestUrl, { headers: { 'User-Agent': 'Node.js' } }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          return request(res.headers.location);
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        res.on('error', reject);
      }).on('error', reject);
    }
    request(url);
  });
}

// Resolve output path from CLI arg or default
const outputPath = process.argv[2] ?? 'src/app/services/feeds/types.ts';

// 1. Fetch latest release tag
console.log('Fetching latest release from MobilityData/mobility-feed-api...');
const releaseRes = await httpsGetWithRedirects(
  'https://api.github.com/repos/MobilityData/mobility-feed-api/releases/latest',
);
const { tag_name: tag } = JSON.parse(releaseRes.body);
console.log(`Latest release: ${tag}`);

// 2. Download the YAML asset into a temp file
const yamlUrl = `https://github.com/MobilityData/mobility-feed-api/releases/download/${tag}/DatabaseCatalogAPI.yaml`;
console.log(`Downloading ${yamlUrl}...`);
const yamlRes = await httpsGetWithRedirects(yamlUrl);
if (yamlRes.statusCode !== 200) {
  throw new Error(`Download failed: HTTP ${yamlRes.statusCode} for ${yamlUrl}`);
}
const tmpSpec = join(tmpdir(), `DatabaseCatalogAPI-${tag}.yaml`);
writeFileSync(tmpSpec, yamlRes.body, 'utf8');

// 3. Generate TypeScript types, then clean up
try {
  execSync(`npm exec -- openapi-typescript "${tmpSpec}" -o "${outputPath}"`, { stdio: 'inherit' });
  execSync(`npx eslint "${outputPath}" --fix`, { stdio: 'inherit' });
} finally {
  unlinkSync(tmpSpec);
}
