#!/usr/bin/env node

/**
 * Agentic SEO & AI Readability Audit Tool
 * Implements the heuristics and checks recommended by is-agentic (https://is-agentic.com)
 * for AI search engines, agents, and LLM web crawlers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const CHECKS = [
  {
    name: 'llms.txt manifest',
    check: () => fs.existsSync(path.join(rootDir, 'public', 'llms.txt')),
    points: 20,
    recommendation: 'Provide public/llms.txt with human and machine overview of the service.',
  },
  {
    name: 'llms-full.txt extended context',
    check: () => fs.existsSync(path.join(rootDir, 'public', 'llms-full.txt')),
    points: 15,
    recommendation: 'Provide public/llms-full.txt with API endpoints and data model documentation.',
  },
  {
    name: 'AI plugin manifest (.well-known/ai-plugin.json)',
    check: () =>
      fs.existsSync(path.join(rootDir, 'public', '.well-known', 'ai-plugin.json')),
    points: 15,
    recommendation: 'Add .well-known/ai-plugin.json for agentic tool discovery.',
  },
  {
    name: 'Schema.org JSON-LD Structured Data',
    check: () =>
      fs.existsSync(path.join(rootDir, 'src', 'app', 'components', 'RootJsonLd.tsx')) &&
      fs.existsSync(
        path.join(
          rootDir,
          'src',
          'app',
          '[locale]',
          'feeds',
          '[feedDataType]',
          '[feedId]',
          'lib',
          'FeedJsonLd.tsx',
        ),
      ),
    points: 20,
    recommendation: 'Render Schema.org WebSite, Organization, and Dataset JSON-LD.',
  },
  {
    name: 'Semantic HTML Landmarks',
    check: () => {
      const layout = fs.readFileSync(
        path.join(rootDir, 'src', 'app', '[locale]', 'layout.tsx'),
        'utf-8',
      );
      return layout.includes("<Header") && layout.includes("<Footer") && layout.includes("component={'main'}");
    },
    points: 15,
    recommendation: 'Ensure semantic landmarks <main>, <header>, <footer> are used consistently.',
  },
  {
    name: 'Robots.txt AI crawler allowance',
    check: () => {
      const robots = fs.readFileSync(
        path.join(rootDir, 'src', 'app', 'robots.ts'),
        'utf-8',
      );
      return robots.includes("userAgent: '*'") || robots.includes('rules:');
    },
    points: 15,
    recommendation: 'Configure robots.ts to clearly permit public routes for web crawlers.',
  },
];

console.log('--- MobilityDatabase Agentic SEO & AI Readability Audit ---');
let totalScore = 0;
let maxScore = 0;

for (const check of CHECKS) {
  maxScore += check.points;
  const passed = check.check();
  if (passed) {
    totalScore += check.points;
    console.log(`[PASS] (+${check.points} pts) ${check.name}`);
  } else {
    console.log(`[FAIL] (0 pts) ${check.name}`);
    console.log(`       Fix: ${check.recommendation}`);
  }
}

const finalScore = Math.round((totalScore / maxScore) * 100);
console.log(`\nFinal Agentic SEO Score: ${finalScore} / 100`);

if (finalScore >= 90) {
  console.log('Result: EXCELLENT (Page and site are highly optimized for AI agents)');
  process.exit(0);
} else {
  console.log('Result: NEEDS IMPROVEMENT (Implement recommended fixes)');
  process.exit(1);
}
