# Authenticated Route Groups Architecture

## Overview
Previously, pages requiring user authentication (such as `/account`, `/change-password`, `/verify-email`) manually rendered `<ReduxGateWrapper>` and `<ProtectedPageWrapper>` within their page components or local layouts.

## New Route Group Pattern
Next.js route groups `(authenticated)` allow sharing a root authenticated layout without altering the URL path structure:
- `src/app/[locale]/(authenticated)/layout.tsx`: Gates all subroutes with `ReduxGateWrapper` and `ProtectedPageWrapper`.
- Individual pages under `(authenticated)` automatically inherit authorization and Redux rehydration guards without redundant boilerplate.
- Simplifies testing and guarantees uniform authentication checks across all protected subroutes.
