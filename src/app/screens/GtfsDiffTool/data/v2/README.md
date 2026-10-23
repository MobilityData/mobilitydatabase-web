# GTFS diff v2 datasets

Each folder here is one generated diff of a feed pair, laid out exactly as
the future backend will publish it to object storage (two zips uploaded →
a processing job → these files under `diffs/<id>/`). The app's report is
served at `/gtfs-diff-tool-v2/<folder>`, with one page per entity
(`/<folder>/calendar`, `/stops`, `/routes`, `/trips`, …, and `/pathways` when
the feeds have pathways).

A folder is a diff once it has a `manifest.json`, the file the build writes
last. The app lists and serves diffs from their manifests only, and reads
every file through one base URL (`NEXT_PUBLIC_GTFS_DIFF_BASE_URL`, default
`/api/gtfs-diff-v2`, which serves these folders with HTTP range support like
S3 or GCS does). Pointing that variable at a bucket or CDN holding the same
layout needs no other change.

## Adding a dataset

1. Create a folder (letters, digits and dashes) and put the two GTFS zips in it.
   Mobility Database downloads (`…-mdb-<id>-<timestamp>.zip`) get a
   `<folder> · mdb-<id>` label automatically.
2. Build the diff:

   ```bash
   node scripts/build-gtfs-diff-dataset.mjs <folder>
   ```

   The older feed becomes the base, by `feed_info.feed_start_date` (else the
   earliest calendar date, else the timestamp in the file name). If the zips
   are named `base…`/`new…` the other way round, the script says so and uses
   the dates; `--keep-names` forces the names (one `base…` or `new…` zip is
   enough; e.g. `idfm`, an agency feed against its Google export, whose
   export looks older by date). `--only entity,trips,pathways,report`
   rebuilds a subset (the manifest is always rewritten). Feeds are loaded
   into DuckDB (`scripts/lib/feed-store.mjs`), so size is bounded by disk,
   not memory; still build one at a time (IDFM: about 12 min for entity,
   4 min for trips, 7 GB peak).

3. Reload `/gtfs-diff-tool-v2`.

## What gets written

| File | Generator | Read by |
|---|---|---|
| `manifest.json` | build script, last | Every file below with its size, plus the feeds. |
| `report.json` | build script | Report header and summary counts. |
| `entity-diff.json` | `generate-gtfs-entity-diff.mjs` | Per-entity summaries and counts; change lists of up to 500 items. |
| `categories/<id>.json` | same | A category's maps, calendar and inline file diffs, loaded when its page opens; deep-encoded (columns, polylines). |
| `maps/stops.parquet`, `maps/routes.parquet` | same (`scripts/lib/map-tables.mjs`) | The stops and routes maps: one row per changed stop / per route. The pages' filters, counts, map points, virtual-scrolled lists and selected entity are DuckDB-WASM queries on them; the category JSON keeps counts, overlays and precomputed highlights. |
| `calendar/services.parquet`, `calendar/days.parquet` | same (`scripts/lib/calendar-tables.mjs`) | The service calendar: one row per service, one per service change on a date. |
| `*_detail.parquet` (maps/, calendar/) | same | Each entity's full JSON, keyed and sorted by id with small row groups, read when one is opened; the list tables above leave it out so they stay small. |
| `entities/<file>.parquet` | same | Longer change lists, paged with DuckDB-WASM. |
| `raw/<file>.parquet` | same | Full row diffs (trips, stop_times, frequencies, shapes): every row of both feeds once, with its action. Trips are joined semantically, not by trip_id. |
| `trips-diff.json` | `generate-gtfs-trips-diff.mjs` | Trips view day index: dates, service sets, day types, names. |
| `trips/<side>.parquet` | same | Each feed's trips, sorted by service; the Trips view reads the selected day's services. Feeds with more than 50,000 trips on a day (`trip_tables.by_route`) are sorted by route instead and read one route at a time. |
| `pathways-diff.json` | `generate-gtfs-pathways-diff.mjs` | Only when a feed has `pathways.txt`. |

JSON stays for what the first screen needs; anything row-sized is Parquet,
read in the browser with DuckDB-WASM: files up to 4 MB are downloaded whole,
larger ones read with HTTP range requests (one request per column chunk and
row group, hence 250k-row groups in the raw tables). Whole JSON files are
served gzip-compressed. Every write is
read back and checked by the generators. The entity encoding is covered by
`entity-diff-codec.spec.ts`; `node scripts/compact-entity-diff.mjs <file>`
re-checks (and re-encodes) an existing `entity-diff.json`.
