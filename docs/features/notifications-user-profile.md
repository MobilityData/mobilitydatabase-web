# Notifications User Profile Section (#138)

## Overview
In accordance with [Issue #138](https://github.com/MobilityData/mobilitydatabase-web/issues/138), this feature provides a dedicated notification subscriptions management section in the user account profile.

## Functionality
- **List Subscriptions**: Fetches active subscriptions via `GET /v1/user/subscriptions` using SWR caching (`USER_SUBSCRIPTIONS_SWR_KEY`).
- **Toggle State**: Activates/deactivates subscriptions via `PATCH /v1/user/subscriptions/{id}`.
- **Unsubscribe**: Allows removing feed subscriptions via `DELETE /v1/user/subscriptions/{id}`.
- **Empty State**: Displays clear CTA to browse and subscribe to feeds when no active subscriptions exist.
