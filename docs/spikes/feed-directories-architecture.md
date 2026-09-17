# Spike: Feed Directories Architecture & SEO Discoverability

## Executive Summary
Currently, feeds are largely discoverable only via the interactive search table or direct URLs listed in the sitemap. Search engine crawlers treat deeply nested feed pages as "orphan pages" without contextual internal link equity. Introducing indexable public directory pages solves this discoverability issue, drastically improves crawl efficiency, and targets high-intent long-tail keywords.

---

## 1. Directory Structure & URL Hierarchy

We propose introducing human- and bot-friendly directory structures:

### A. Location Directory
- `/feeds/directory/locations`: Top-level index of all countries with public feeds.
- `/feeds/directory/locations/[countryCode]`: Country landing page listing available regions/municipalities and top feeds (e.g. `/feeds/directory/locations/FR`).
- `/feeds/directory/locations/[countryCode]/[subdivision]`: Specific state/province/city feed catalog (e.g. `/feeds/directory/locations/US/CA`).

### B. Producer / Agency Directory
- `/feeds/directory/producers`: Alphabetical index of transit authorities and operators.
- `/feeds/directory/producers/[producerSlug]`: Dedicated agency directory listing all official and community feeds published by that agency (e.g. `/feeds/directory/producers/sncf`).

### C. Protocol & Feed Type Directory
- `/feeds/directory/types/[gtfs|gtfs_rt|gbfs]`: Filtered listings highlighting high-quality verified feeds per transit spec.

---

## 2. SEO & Crawl Equity Benefits
1. **Elimination of Orphan Pages**: Every feed page will have at least 2–3 contextual inbound internal links from its location, producer, and protocol directory pages.
2. **Keyword Optimization**: Directory pages naturally capture high-volume search queries such as:
   - *"France GTFS transit data"*
   - *"San Francisco open transit feeds"*
   - *"Berlin GBFS bikeshare feed"*
3. **Structured Data**:
   - `BreadcrumbList` schema connecting `Home > Feeds Directory > Location > Feed`.
   - `DataCatalog` schema grouping feeds into authoritative collections.

---

## 3. Backend Requirements & API Design
To build fast, static (SSG/ISR) directory pages, the backend feed API should expose lightweight aggregation endpoints:

```http
GET /v1/aggregations/locations
Response:
[
  {
    "country_code": "US",
    "country_name": "United States",
    "feed_count": 1420,
    "subdivisions": ["CA", "NY", "IL", ...]
  },
  ...
]
```

```http
GET /v1/aggregations/producers
Response:
[
  {
    "producer_id": "sncf",
    "name": "SNCF Voyageurs",
    "country": "FR",
    "feed_count": 12
  },
  ...
]
```

---

## 4. Frontend Implementation Strategy
- **Rendering Strategy**: Next.js App Router Static Site Generation (`generateStaticParams`) with Incremental Static Regeneration (ISR, `revalidate = 86400`).
- **Components**:
  - `DirectoryGrid`: Card grid of countries, states, or agencies with feed count chips.
  - `DirectoryBreadcrumbs`: Standard accessible breadcrumbs with Schema.org markup.
  - `DirectoryFeedList`: Lightweight server-rendered summary table of feeds in that category.
