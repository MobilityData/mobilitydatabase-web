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
   into DuckDB (`scripts/lib/feed-store.mjs`), so stop_times and shapes
   never become JS rows, but large feeds still need a lot of memory: build
   one at a time (IDFM on an M3 Pro: about 9 min for entity, 2 min for
   trips, 1 min for the calendar; entity peaks at about 18 GB of memory plus
   4.5 GB of DuckDB files in the temp folder).

3. Reload `/gtfs-diff-tool-v2`.

## What gets written

| File | Generator | Read by |
|---|---|---|
| `manifest.json` | build script, last | Every file below with its size, plus the feeds. |
| `report.json` | build script | Report header, change counts per file (each tagged with its `group`, the summary section) and the top highlights. A group's counts are the sum of its files' (files with `part_of` excluded) unless the group carries its own (Routes, Service Dates, Pathways). The `*-highlights.json` files hold each section's highlights with full entity lists. |
| `entity-diff.json` | `generate-gtfs-entity-diff.mjs` | Per-entity summaries and counts; change lists of up to 500 items. |
| `categories/<id>.json` | same | A category's maps and calendar, loaded when its page opens; plain JSON, except coordinate lists stored as encoded polylines (`{ "$pl": "…" }`). |
| `maps/stops.parquet`, `maps/routes.parquet` | same (`scripts/lib/map-tables.mjs`) | The stops and routes maps: one row per changed stop / per route. The pages' filters, counts, map points, virtual-scrolled lists and selected entity are DuckDB-WASM queries on them; the category JSON keeps counts, overlays and precomputed highlights. |
| `calendar/services.parquet`, `calendar/days.parquet` | same (`scripts/lib/calendar-tables.mjs`) | The service calendar: one row per service, one per service change on a date. |
| `*_detail.parquet` (maps/, calendar/) | same | Each entity's full JSON, keyed and sorted by id with small row groups, read when one is opened; the list tables above leave it out so they stay small. |
| `entities/<file>.parquet` | same | Longer change lists, paged with DuckDB-WASM. |
| `raw/<file>.parquet` | same | The raw file diff: one table per GTFS file that changed (`raw/stops.parquet`, `raw/areas.parquet`, …; unchanged files get none), every row of both feeds once, with its action and `b_<column>` / `n_<column>` values. Listed in each category's `raw_tables`, with the file's key (`key_columns`) and any columns only one feed has. Trips are joined semantically, not by trip_id. `locations.geojson` has no table yet. |
| `trips-diff.json` | `generate-gtfs-trips-diff.mjs` | Trips view day index: dates, service sets (indices into `service_ids`, lib/trips-index-codec.ts), day types, names. |
| `trips/<side>.parquet` | same | Each feed's trips, sorted by service; the Trips view reads the selected day's services. Feeds with more than 50,000 trips on a day (`trip_tables.by_route`) are sorted by route instead and read one route at a time. |
| `pathways-diff.json` | `generate-gtfs-pathways-diff.mjs` | Only when a feed has `pathways.txt`. |

JSON stays for what the first screen needs; anything row-sized is Parquet,
read in the browser with DuckDB-WASM: files up to 4 MB are downloaded whole,
larger ones read with HTTP range requests (one request per column chunk and
row group, hence 250k-row groups in the raw tables). Every Parquet file is
written as format V2 (delta-encoded numbers and strings, 38-50% smaller raw
tables). Whole JSON files are
served gzip-compressed. Every write is
read back and checked by the generators. The polyline encoding is covered by
`entity-diff-codec.spec.ts`.
