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

Every path below comes from one module, `lib/diff-layout.ts`
(`src/app/screens/GtfsDiffToolV2/lib/`): the build scripts write and the
app reads through it, so neither spells a path of its own. A diff folder
holds one folder per kind of output:

- `raw/`: the file-level diff, one table per GTFS file.
- `analysis/`: computed tables, named after the GTFS things they describe
  (stops, routes and shapes, services and their dates, pathways).
- `highlights/`: the notable changes, one file per section plus an index.
- `views/`: copies shaped for one viewer (the Trips view, the routes
  overview tiles). They are not needed to read the diff: everything in them
  can be derived from `raw/` and `analysis/`.
- `.build/`: build-only intermediates, never published.

Rebuilding a folder built with an older layout (`maps/`, `calendar/`,
`trips-diff.json`, `highlights.json`, …) removes those files: each step
clears what it wrote in older layouts too, and a hand-made
`maps/routes-overview.pmtiles` is moved to `views/` first.

| File | Generator | Read by |
|---|---|---|
| `manifest.json` | build script, last | Every file below with its size, plus the feeds. |
| `report.json` | entity step (`generate-gtfs-entity-diff.mjs`: files, analyses), then the build script (feeds, pathways, highlights) | The diff's entry point (lib/report.ts, schema 4): the feeds; one entry per GTFS file either feed has (presence, totals and change counts by its key, `part_of` for files counted inside another file's entities like stop_times.txt in trips.txt, its raw table, trip matching for trips.txt); each analysis under `analyses.<name>` with its JSON file and counts (`stops`, `routes`: route impact, `services`, `pathways`: stations); and the top highlights. No page grouping: the viewer groups files into pages (`lib/sections.ts`). Each step rewrites only its own part. Older builds: schema 3 plus `files.json`. |
| `raw/<file>.parquet` | entity step | The raw file diff: one table per GTFS file that changed (`raw/stops.parquet`, `raw/areas.parquet`, …; unchanged files get none), every changed row of both feeds once, with its action and `b_<column>` / `n_<column>` values. Rows identical in both feeds are stored for the trip files (trips, stop_times, frequencies) and the lookup files, stops.txt, routes.txt, calendar.txt and calendar_dates.txt: those tables hold every row of either feed, always written, so the other outputs store ids only and look names, positions, colours and service rows up there (`route_info_file`, `stop_info_file`, `calendar_rows_file`, `calendar_dates_rows_file`; lib/route-info.ts, lib/stop-info.ts, lib/calendar-rows.ts; the route and stop lookups are read with HTTP range requests so a page fetches only the columns it needs). Their unchanged rows are compact: `b_<column>` is NULL where the base value equals the new one (`compact_unchanged`). Elsewhere unchanged rows are counted (`counts.unchanged`) but left out (`unchanged_omitted`). The raw file diff view shows unchanged rows for the trip files only. Rows are compared on the columns both feeds have: a column only one feed has is a column change (`columns_added` / `columns_deleted`), not a row change, here and in the stops analysis. Trips are joined semantically, not by trip_id. `locations.geojson` has no table yet. |
| `analysis/stops.json`, `analysis/routes.json`, `analysis/services.json` | entity step | Each analysis's own JSON (its counts, settings and table paths: `table`, `shapes_table`, `tables`, `highlights_file`, `route_info_file`, `stop_info_file`, …), loaded when its page opens; plain JSON. |
| `analysis/stops.parquet` | entity step (`scripts/lib/map-tables.mjs`) | The stops analysis (`STOPS_COLUMNS` in `lib/route-tables.ts`): only what `raw/stops.parquet` can't give, one row per stop changed in stops.txt or whose served (route, direction) pairs differ between feeds, sorted by `stop_id`: `stop_id`, `moved_m` (null when either position is missing) and the (`route_id`, `direction_id`) pairs of every trip calling there in each feed (`served_base`, `served_new`, STRUCT lists; `direction_id` is `''` when trips have none). The Stops page joins it with `raw/stops.parquet` once when it loads (`stopsTableQuery`), computing name, coordinates, search text and list order there; its filters, counts, map points, list and selected stop are DuckDB-WASM queries on that table. The route detail derives a direction's added / removed / moved stops from it (`directionStops`). |
| `analysis/routes.parquet`, `analysis/shapes.parquet` | entity step | Typed columns only, the contract being `lib/route-tables.ts` (`ROUTES_COLUMNS`, `SHAPES_COLUMNS`). Routes: one row per route, sorted by `ord`, with the columns the Routes pages filter, search and list (status, names, `route_type`, flags, summary, networks and stop counts per feed, bounds) and its `directions` (STRUCT list: headsigns, the main shape id in each feed, `path_change_m`, diverging sections as encoded polylines). Shapes: one row per shape of either feed (a renamed pair once, under its new id with `renamed_from`; unused shapes too; a shape several routes use once, its added / removed deviation and diverging sections taken from its primary route), main shapes of some direction first (`main`), then by `shape_id`, in small row groups so the overview reads the main shapes only: status, deviation, points, `unused_*`, the lines (`geom_base` / `geom_new`, null when the shape is not in that feed; `geom_base` also null for unchanged, points-only and renamed shapes, whose new line stands for both), the (route, direction, trips) using it (`uses_*`) and the directions it is the main shape of (`main_*`). Every geometry column (`geom_*`, `diverge_*`) is a string in the [Google Encoded Polyline Algorithm Format](https://developers.google.com/maps/documentation/utilities/polylinealgorithm), precision 5, points stored latitude first (`lib/entity-diff-codec.ts` wraps `@googlemaps/polyline-codec`); any standard decoder reads it, e.g. Python `polyline.decode(s, geojson=True)` for `[lon, lat]` pairs. A route detail is assembled from these, `analysis/stops.parquet`, `raw/routes.parquet` and `raw/stops.parquet` when it is opened. Neither is the route lookup: see `raw/routes.parquet`. |
| `analysis/services.json` | entity step | The services analysis's index (`analyses.services` in report.json): which calendar files each feed has, service counts and totals, each feed's coverage, `active_counts` (date → services running in each feed), the two tables (`tables.services`, `tables.days`), `highlights_file`, and the raw tables holding the services' rows (`calendar_rows_file`, `calendar_dates_rows_file`, null when neither feed has the file). |
| `analysis/services.parquet` | entity step (`scripts/lib/calendar-tables.mjs`) | One row per service of either feed, sorted by `service_id`: `status`, the routes whose trips use it in each feed (`route_ids_base` / `route_ids_new`, VARCHAR lists), trips, active days and first / last active date in each feed (NULL where it is absent), and the number of dates it gained / lost. No rows or display text: the page joins `raw/calendar.parquet` for the weekly pattern, and an opened service is put back together from its row, its `service_dates.parquet` rows and its raw rows (lib/calendar-rows.ts). |
| `analysis/service_dates.parquet` | entity step | One row per service change on a date, sorted by date then `service_id`: `change` (`added` / `removed`: an added or deleted service's active date; `gained` / `lost` / `exception_only`: a kept service's) and `reason_code` (why a kept service's date changed). The exception in effect that day comes from `raw/calendar_dates.parquet`, the routes from `services.parquet`, the reason in words from the code and the service's calendar.txt rows. |
| `analysis/pathways.json` | `generate-gtfs-pathways-diff.mjs` | Only when a feed has `pathways.txt`. Stations' links and levels, and their nodes as stop id and status only: the station and node stops.txt rows (and field changes) are read from `raw/stops.parquet` (`stop_info_file`) when the page loads. |
| `highlights/index.json` | `generate-gtfs-highlights.mjs` | Every section's notable highlights in one ranking (the Highlights page and report.json's top few), without entity lists: `files` names each section's file. |
| `highlights/<section>.json` (`stops`, `routes`, `services`, `trips`) | entity step (stops, routes, services), highlights step (trips) | A section's highlights with their full entity lists (`section` names the section), the only copy: section pages load it for their highlight cards, and the server joins it into `highlights/index.json` for the Highlights and Trips pages. |
| `views/trips/index.json` | `generate-gtfs-trips-diff.mjs` | Trips view day index: dates, service sets (indices into `service_ids`, lib/trips-index-codec.ts), day types, names, and the trips tables (`trip_tables`). Stop names are not stored: they come from `raw/stops.parquet` (`stop_info_file`). |
| `views/trips/<side>.parquet` | same | Each feed's trips, one JSON row per trip, sorted by service; the Trips view reads the selected day's services. Feeds with more than 50,000 trips on a day (`trip_tables.by_route`) are sorted by route instead and read one route at a time. |
| `views/trips/calendar.json` | `generate-gtfs-trips-calendar.mjs` | Trips added / removed / modified on every date, for the Trips calendar and weekday table (lib/trips-calendar.ts). |
| `views/routes-overview.pmtiles` | hand-made, not written by the scripts | Prototype: the routes overview as vector tiles. Rebuilds keep it, and `analysis/routes.json` names it (`overview_tiles`) when present. |
| `.build/trips-service.json` | `generate-gtfs-trips-calendar.mjs` | Build-only, not published (manifest.json leaves dotfiles out) and not loaded by the pages: each route's service on the typical days, which the highlights step turns into the trips service highlights. |

JSON stays for what the first screen needs; anything row-sized is Parquet,
read in the browser with DuckDB-WASM: files up to 4 MB are downloaded whole,
larger ones read with HTTP range requests (one request per column chunk and
row group, hence 250k-row groups in the raw tables). Every Parquet file is
written as format V2 (delta-encoded numbers and strings, 38-50% smaller raw
tables). Whole JSON files are served gzip-compressed. Every write is read
back and checked by the generators. The polyline encoding is covered by
`entity-diff-codec.spec.ts`.
