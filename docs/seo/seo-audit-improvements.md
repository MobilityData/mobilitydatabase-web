# SEO Audit & Technical Enhancements Report

## Executive Summary
This document tracks the technical SEO audit findings and strategic improvements implemented for the MobilityDatabase web application to maximize organic discovery, crawler efficiency, and structured data indexing.

## Implemented Enhancements

### 1. Global Metadata & Canonical Origin Architecture
- **Root `metadataBase`**: Configured `https://mobilitydatabase.org` as the global root canonical URL to eliminate relative URL resolution warnings across Next.js metadata routes (`opengraph-image`, `sitemap.xml`, `robots.txt`).
- **Proposition-Driven Title Templates**: Implemented dynamic title templating (`%s | MobilityDatabase`) and updated the root description to highlight over 6,000 feeds across 100+ countries.
- **Social Sharing (OpenGraph / Twitter Card)**:
  - Added complete OpenGraph protocol (`og:site_name`, `og:image`, `og:type`, `og:url`) and Twitter card summaries (`@MobilityDataIO`).
  - Integrated dynamic per-feed OpenGraph preview cards via Next.js `ImageResponse`.

### 2. Rich Structured Data (JSON-LD)
- **Schema.org `Organization`**: Declared MobilityData official entity, logo, and social identity linkages (`sameAs`).
- **Schema.org `WebSite` & `SearchAction`**: Exposed standard Google Sitelinks Search Box entrypoint (`https://mobilitydatabase.org/feeds?search={search_term_string}`) to allow direct search engine query parsing.
- **Schema.org `Dataset`**: Attached per-feed Dataset schemas with distribution URLs, spatial coverage, and temporal date ranges.

### 3. Crawler Control & Indexation Strategy
- **Crawler Directives (`robots.ts`)**:
  - Restricts indexation of administrative and authentication callback paths (`/sign-in`, `/sign-up`, `/api/`, `*/authed/`).
  - Prioritizes public feed directories and static ISR pages (`/feeds/gtfs/*`, `/feeds/gbfs/*`, `/feeds/gtfs_rt/*`).
- **Dynamic XML Sitemap (`sitemap.xml`)**:
  - Automatically queries feeds API and generates crawlable sitemap entries with `lastmod`, `changefreq: weekly`, and fallback static route declarations.

### 4. Ongoing Opportunities
- Expand multi-locale hreflang tagging as translations expand beyond English.
- Implement structured breadcrumb schema (`BreadcrumbList`) across hierarchical category views.
