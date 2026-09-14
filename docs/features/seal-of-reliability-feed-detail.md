# Seal of Reliability on Feed Detail Page (#141)

## Overview
In accordance with [Issue #141](https://github.com/MobilityData/mobilitydatabase-web/issues/141), this feature integrates the Seal of Reliability badging and evaluation summary into the GTFS Feed Detail page.

## Key Capabilities
- **Feed Detail Header Badge**: Displays `SealOfReliabilityChip` when `config.enableSealOfReliability` is enabled.
- **Direct Navigation**: Clicking the badge navigates users directly to the comprehensive reliability analysis view (`/feeds/{feedDataType}/{feedId}/seal-of-reliability`).
- **Loading & Error States**: Graceful fallback with tooltips and warning banners when reliability reports are unavailable or evaluating.
- **Criteria Evaluated**:
  - Availability (historical dataset snapshot uptime)
  - Compliance (canonical GTFS validator notice severity)
  - Freshness (feed update recency)
  - Continuity (long-term data availability)
