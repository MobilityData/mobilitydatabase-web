# SSR Post Launch Tasks — Milestone Tracking & Audit Report

**Milestone Target Date:** May 8, 2026  
**Repository:** MobilityData/mobilitydatabase-web  
**Scope:** Post-launch stabilization following the Next.js App Router & Server-Side Rendering (SSR) migration.

---

## Task Audit & Resolution Status

| Category | Issue | Description | Resolution Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Tech Debt** | #24 | Migrate ProtectedRoute to App Router | Completed | Replaced with Next.js route groups and `ProtectedPageWrapper` |
| **Tech Debt** | #25 | Migrate Add Feed & Metrics | Completed | Fully integrated into App Router structure |
| **Tech Debt** | #26 | Legacy Router Cleanup | Completed | Legacy App component and react-router dependencies removed |
| **Bugs** | #65 | Route color defaults in light mode | Resolved | Palette variables mapped to CSS variables |
| **Bugs** | #66 | Feed not found handling | Resolved | Standardized `notFound()` handler in App Router |
| **Bugs** | #34 | Map layer loading in DEV environment | Resolved | Dev-specific proxy mocking and MapLibre style handling fixed |
| **Cross-browser** | #52 | Edge flag emoji rendering | Resolved | `country-flag-emoji-polyfill` loaded in root layout |
| **Cross-browser** | #51 | Firefox text/button overlap | Resolved | Flexbox min-width: 0 and responsive typography styling |
| **SEO** | #19 | Automated sitemap generation | Resolved | Sitemap proxy with Google Cloud Storage daily automated updates |
| **Performance**| #67 | Feed detail revalidation strategy | Resolved | Tag-based and path-based revalidation via `/api/revalidate` |
| **Enhancements**| #81 | Dataset file size visibility | Resolved | Human-readable byte formatting in dataset table |
| **Enhancements**| #85 | Landing page modernization | In Progress | Modern card layouts, responsive metrics, SSG readiness |
| **Enhancements**| #31 | Dark mode initial flash/flicker | Resolved | Next.js theme script injection preventing unstyled flash |
| **Enhancements**| #69 | MobilityData email verification bypass| Resolved | Internal domain authentication claims recognized |

---

## Verification & Acceptance Criteria Checklist
- [x] Zero runtime dependencies on legacy client-side router.
- [x] All dynamic feed pages render under `< 200ms` for cached visits.
- [x] Cross-browser parity verified across Chromium, Gecko (Firefox), and WebKit.
- [x] Dynamic sitemap proxy operational at `/sitemap.xml`.
