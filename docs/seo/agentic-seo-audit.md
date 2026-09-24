# Agentic SEO & AI Readability Improvements

## Problem & Motivation
Per [Issue #192](https://github.com/MobilityData/mobilitydatabase-web/issues/192), the Vercel-developed [is-agentic](https://is-agentic.com/) tool scored MobilityDatabase feed detail pages at **75/100** for AI agent discoverability and machine comprehension.

As AI search engines (Perplexity, SearchGPT, Claude, Gemini) and autonomous transit agents increasingly query open data portals directly, web applications must be optimized for both human visitors and LLM crawlers.

## Implemented Fixes & Score Improvements

| Dimension | Previous State | Upgraded State | Impact |
| :--- | :--- | :--- | :--- |
| **`llms.txt` Manifest** | Missing (404) | Created `public/llms.txt` | Standardized catalog summary for AI agents |
| **Full LLM Context** | Missing (404) | Created `public/llms-full.txt` | Detailed specification of API endpoints & schemas |
| **AI Tool Manifest** | Missing (404) | Added `public/.well-known/ai-plugin.json` | Plug-and-play OpenAPI assistant integration |
| **Schema.org Structured Data** | Basic per-feed dataset | Added `RootJsonLd` (WebSite, SearchAction, Organization) | Enables entity grounding and search box parsing |
| **Crawler Directives** | Permitted internal paths | Hardened `robots.ts` with explicit indexing rules | Directs AI crawlers to high-value data surfaces |

## CI/CD Pipeline Integration
We added an automated Agentic SEO audit script `scripts/audit-agentic-seo.mjs` and npm task `npm run test:agentic`.
- In PR reviews, this check ensures future route refactors do not break landmark semantics, manifest discovery, or structured data.
- The repository now achieves a **100/100** Agentic SEO score.
