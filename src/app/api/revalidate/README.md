# `/api/revalidate` Endpoint

This endpoint is used by external systems to trigger on-demand Next.js cache revalidation for feed pages. It exposes two HTTP methods:

- **GET** — Used exclusively by the Vercel cron job to revalidate all GBFS feed pages on a schedule.
- **POST** — Used by external systems to trigger targeted or full-site cache revalidation.

---

## GET

Revalidates all GBFS feed pages. This handler is invoked automatically by Vercel's cron scheduler (configured in `vercel.json`) at 4am UTC Monday–Saturday and 7am UTC Sunday.

### Authentication

Vercel automatically passes an `Authorization: Bearer <CRON_SECRET>` header on every cron invocation. The value must match the `CRON_SECRET` environment variable.

### Response

| Status | Body |
|--------|------|
| `200` | `{ "ok": true, "message": "All GBFS feeds revalidated successfully" }` |
| `401` | `{ "ok": false, "error": "Unauthorized" }` |
| `500` | `{ "ok": false, "error": "Server misconfigured: CRON_SECRET missing" }` |
| `500` | `{ "ok": false, "error": "Revalidation failed" }` |

---

## POST

Triggers targeted cache revalidation. The caller controls the scope of revalidation via the request body.

### Authentication

Include the `x-revalidate-secret` header with the value of the `REVALIDATE_SECRET` environment variable.

```
x-revalidate-secret: <REVALIDATE_SECRET>
```

### Request Body

```json
{
  "type": "<revalidation-type>",
  "feedIds": ["<feed-id-1>", "<feed-id-2>"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | Yes | The revalidation scope. Must be one of the valid types listed below. |
| `feedIds` | `string[]` | Only for `specific-feeds` | List of feed IDs to revalidate. Ignored for all other types. |

If the request body is missing or cannot be parsed, the endpoint falls back to the default: `type: "specific-feeds"` with an empty `feedIds` array (no-op).

### Valid `type` Values

| Type | Description |
|------|-------------|
| `full` | Revalidates the entire site (all pages and all cache tags). |
| `all-feeds` | Revalidates all GTFS, GTFS-RT, and GBFS feed detail pages and their shared cache tags. |
| `all-gtfs-feeds` | Revalidates all GTFS feed detail pages and the `feed-type-gtfs` cache tag. |
| `all-gtfs-rt-feeds` | Revalidates all GTFS-RT feed detail pages and the `feed-type-gtfs_rt` cache tag. |
| `all-gbfs-feeds` | Revalidates all GBFS feed detail pages and the `feed-type-gbfs` cache tag. |
| `specific-feeds` | Revalidates only the pages for the feed IDs listed in `feedIds`. Each feed is revalidated across all feed-type paths (GTFS, GTFS-RT, GBFS) and all locales. |

If an unrecognized or missing `type` is provided, the endpoint returns a `500` error:

```json
{ "ok": false, "error": "invalid or missing type parameter" }
```

### Response

| Status | Body |
|--------|------|
| `200` | `{ "ok": true, "message": "Revalidation triggered successfully" }` |
| `401` | `{ "ok": false, "error": "Unauthorized" }` |
| `500` | `{ "ok": false, "error": "Server misconfigured: REVALIDATE_SECRET missing" }` |
| `500` | `{ "ok": false, "error": "invalid or missing type parameter" }` |
| `500` | `{ "ok": false, "error": "Failed to revalidate" }` |

### Example Request

```bash
curl -X POST https://mobilitydatabase.org/api/revalidate \
  -H "Content-Type: application/json" \
  -H "x-revalidate-secret: <REVALIDATE_SECRET>" \
  -d '{ "type": "specific-feeds", "feedIds": ["feed-abc123", "feed-def456"] }'
```
