#!/usr/bin/env node
/**
 * Re-encode existing entity-diff.json files with the lossless columnar
 * encoding (see src/app/screens/GtfsDiffToolV2/lib/entity-diff-codec.ts),
 * in place. A file is only rewritten after checking that decoding the new
 * encoding gives back exactly the original data. Already-compact files are
 * re-verified and left as they are.
 *
 * Usage:
 *   node scripts/compact-entity-diff.mjs <entity-diff.json>...
 */

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { deepStrictEqual } from 'node:assert/strict';
import {
  decodeEntityDiff,
  encodeEntityDiff,
} from '../src/app/screens/GtfsDiffToolV2/lib/entity-diff-codec.ts';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/compact-entity-diff.mjs <entity-diff.json>...');
  process.exit(1);
}

for (const file of files) {
  const before = statSync(file).size;
  const original = decodeEntityDiff(JSON.parse(readFileSync(file, 'utf8')));
  const encoded = JSON.stringify(encodeEntityDiff(original));
  // Round-trip through JSON text, exactly as the browser will read it.
  deepStrictEqual(decodeEntityDiff(JSON.parse(encoded)), original);
  writeFileSync(file, encoded);
  const after = statSync(file).size;
  console.log(
    `${file}: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB (verified lossless)`,
  );
}
