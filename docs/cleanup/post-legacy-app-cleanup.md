# Post Legacy App Router Cleanup (#113)

## Overview
In accordance with [Issue #113](https://github.com/MobilityData/mobilitydatabase-web/issues/113), this milestone tracks the deprecation and cleanup of the legacy React Router application wrappers following the migration to Next.js 16 App Router.

## Scope of Cleanup
- Cleaned obsolete legacy routing wrappers and dead code paths.
- Verified all public and authenticated feed detail views navigate via Next.js App Router (`src/app/[locale]/...`).
- Consolidated navigation and providers under the root layout.
