# Feed Detail Route Groups Architecture

## Motivation
Previously, feed detail routes used a proxy rewrite pattern:
- The proxy intercepted `/feeds/:feedDataType/:feedId` and rewrote it internally to `/feeds/:feedDataType/:feedId/authed` or `/feeds/:feedDataType/:feedId/static`.
- The `authed` and `static` route folders relied on custom HTTP header guards (`x-mdb-authed-proxy`, `x-mdb-static-proxy`) and called `notFound()` if accessed directly.

## Solution: Next.js Route Groups
Using route groups `(authed)` and `(static)` inside `src/app/[locale]/feeds/[feedDataType]/[feedId]`:
- URL paths remain clean and canonical: `/feeds/:feedDataType/:feedId` without exposing `/authed` or `/static` in URL segments.
- `(static)`: Leverages Next.js SSG / ISR for search engines and public visitors.
- `(authed)`: Serves authenticated users with personalized features (subscriptions, custom actions) using dynamic server rendering.
- Eliminates header guard vulnerabilities and simplifies the proxy routing middleware.
