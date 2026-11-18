#!/usr/bin/env node
/**
 * Generate an entity-level GTFS diff (v2 POC) from two GTFS zip files.
 *
 * Writes report.json's files and analyses (lib/report.ts ReportDoc): one
 * entry per GTFS file of either feed (presence, totals, change counts by its
 * entity key, its raw row diff in raw/<file>.parquet), plus the analyses that
 * need more than one file: the stops map, the routes map (shapes, stop
 * patterns, trips) and the service calendar, each with its own JSON and
 * Parquet tables, and their counts. The rest of report.json (feeds, pathways
 * counts, highlights) is the report step's and is kept. Which files make up
 * which page is the viewer's choice (lib/sections.ts), not this output's.
 *
 * Usage:
 *   node scripts/generate-gtfs-entity-diff.mjs <base.zip> <new.zip> <report.json>
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { ident, openFeedStore, tableOf } from './lib/feed-store.mjs';
import { buildTripsIndex, forEachRoute, groupByTrip, routeCompactTrips } from './lib/gtfs-trips-diff.mjs';
import { MAPPING_PASSES, mapTrips, serviceMasks } from './lib/trip-id-mapping.mjs';
import { openTripsFamilyDiff } from './lib/trips-family-diff.mjs';
import { writeRoutesTable, writeStopsTable } from './lib/map-tables.mjs';
import { writeCalendarTables } from './lib/calendar-tables.mjs';
import { shapeMatcher } from './lib/shape-match.mjs';
import { ACTIONS, openRawParquet, parquetOptions, rawTablePath } from './lib/raw-diff-parquet.mjs';
import { flushTallies, markStartup, tally, timed, timer } from './lib/timings.mjs';
import { ANALYSIS_FILES } from '../src/app/screens/GtfsDiffToolV2/lib/diff-layout.ts';

const SCHEMA_VERSION = '2.1.0-poc';

// ── GTFS files ─────────────────────────────────────────────────────
//
// Every file the diff covers, in output order. Each is either:
//   - keyed:   one row per entity, identified by `key` (child files' rows
//              grouped under a parent column)
//   - grouped: entities are groups of rows sharing `groupBy` (shapes.txt by
//              shape_id)
//   - rawOnly: a raw row diff only (calendar files: the calendar analysis
//              diffs services)
//   - trips:   trips.txt and its child files, matched by content
//              (scripts/lib/trips-family-diff.mjs)

const FILES = [
  { file: 'agency.txt', key: ['agency_id'] },
  { file: 'attributions.txt', key: ['attribution_id'] },
  // lookup: other files reference these entities, so their raw table holds
  // every row of either feed (unchanged ones compact), not only changes.
  { file: 'stops.txt', key: ['stop_id'], lookup: true },
  { file: 'levels.txt', key: ['level_id'] },
  { file: 'pathways.txt', key: ['pathway_id'] },
  { file: 'shapes.txt', groupBy: 'shape_id', key: ['shape_pt_sequence'] },
  { file: 'routes.txt', key: ['route_id'], lookup: true },
  { file: 'networks.txt', key: ['network_id'] },
  { file: 'route_networks.txt', key: ['route_id'] },
  { file: 'areas.txt', key: ['area_id'] },
  { file: 'stop_areas.txt', key: ['area_id', 'stop_id'] },
  {
    file: 'trips.txt',
    trips: true,
    key: ['trip_id'],
    children: [
      { file: 'stop_times.txt', parent: 'trip_id', key: ['stop_sequence'] },
      { file: 'frequencies.txt', parent: 'trip_id', key: ['start_time'] },
    ],
  },
  // The services analysis (analysis/services.*) stores no rows: a service's
  // calendar.txt row and calendar_dates.txt exceptions are looked up here.
  { file: 'calendar.txt', key: ['service_id'], rawOnly: true, lookup: true },
  { file: 'calendar_dates.txt', key: ['service_id', 'date'], rawOnly: true, lookup: true },
  {
    file: 'fare_attributes.txt',
    key: ['fare_id'],
    children: [
      {
        file: 'fare_rules.txt',
        parent: 'fare_id',
        key: ['route_id', 'origin_id', 'destination_id', 'contains_id'],
      },
    ],
  },
  {
    file: 'fare_products.txt',
    key: ['fare_product_id', 'rider_category_id', 'fare_media_id'],
  },
  { file: 'fare_media.txt', key: ['fare_media_id'] },
  {
    file: 'fare_leg_rules.txt',
    key: [
      'network_id',
      'from_area_id',
      'to_area_id',
      'from_timeframe_group_id',
      'to_timeframe_group_id',
      'fare_product_id',
    ],
  },
  {
    file: 'fare_leg_join_rules.txt',
    key: ['from_network_id', 'to_network_id', 'from_stop_id', 'to_stop_id'],
  },
  {
    file: 'fare_transfer_rules.txt',
    key: [
      'from_leg_group_id',
      'to_leg_group_id',
      'fare_product_id',
      'transfer_count',
      'duration_limit',
    ],
  },
  { file: 'rider_categories.txt', key: ['rider_category_id'] },
  {
    file: 'timeframes.txt',
    key: ['timeframe_group_id', 'start_time', 'end_time', 'service_id'],
  },
  { file: 'booking_rules.txt', key: ['booking_rule_id'] },
  { file: 'location_groups.txt', key: ['location_group_id'] },
  { file: 'location_group_stops.txt', key: ['location_group_id', 'stop_id'] },
  { file: 'locations.geojson', geojson: true },
  { file: 'feed_info.txt', key: [] },
  {
    file: 'translations.txt',
    key: ['table_name', 'field_name', 'language', 'record_id', 'record_sub_id', 'field_value'],
  },
  {
    file: 'transfers.txt',
    key: ['from_stop_id', 'to_stop_id', 'from_route_id', 'to_route_id', 'from_trip_id', 'to_trip_id'],
  },
];

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const CALENDAR_FIELDS = [...WEEKDAYS, 'start_date', 'end_date'];

// ── Feed loading (scripts/lib/feed-store.mjs) ──────────────────────

/** Source line number (1-based, header = 1) of each loaded row object. */
const ROW_LINES = new WeakMap();

/** SQL value of a column as the JS rows hold it (trimmed, '' when empty or missing). */
function sqlValue(alias, column, header) {
  return header.includes(column) ? `coalesce(trim(${alias}.${ident(column)}), '')` : "''";
}

// ── Generic entity diff ────────────────────────────────────────────

const KEY_SEP = '\u001f';

function keyOf(row, cols) {
  return cols.map((c) => row[c] ?? '').join(KEY_SEP);
}

/** Index rows by key; duplicate keys get an occurrence suffix so nothing is lost. */
function indexRows(rows, cols) {
  const map = new Map();
  rows.forEach((row, i) => {
    let k = cols.length === 0 ? String(i) : keyOf(row, cols);
    if (map.has(k)) {
      let n = 2;
      while (map.has(`${k}#${n}`)) n++;
      k = `${k}#${n}`;
    }
    map.set(k, row);
  });
  return map;
}

function fieldChanges(baseRow, newRow, columns, ignore = []) {
  const changes = [];
  for (const col of columns) {
    if (ignore.includes(col)) continue;
    const b = baseRow[col] ?? '';
    const n = newRow[col] ?? '';
    if (b !== n) changes.push({ field: col, base_value: b, new_value: n });
  }
  return changes;
}

function unionColumns(a, b) {
  const cols = [...(a?.header ?? [])];
  for (const c of b?.header ?? []) if (!cols.includes(c)) cols.push(c);
  return cols;
}

/** The columns rows are compared on: both feeds' when both have the file. */
function sharedColumns(a, b) {
  const columns = unionColumns(a, b);
  if (!a || !b) return columns;
  return columns.filter((c) => a.header.includes(c) && b.header.includes(c));
}

function displayKey(k) {
  return k.split(KEY_SEP).filter((p) => p !== '').join(' / ') || '(row)';
}

/** Diff rows of two (optional) tables keyed by `cols`. Returns counts + per-key status. */
function diffTables(baseTable, newTable, cols) {
  const baseIdx = indexRows(baseTable?.rows ?? [], cols);
  const newIdx = indexRows(newTable?.rows ?? [], cols);
  const columns = unionColumns(baseTable, newTable);
  const counts = { added: 0, deleted: 0, modified: 0, unchanged: 0 };
  const changes = [];
  for (const [k, b] of baseIdx) {
    const n = newIdx.get(k);
    if (!n) {
      counts.deleted++;
      changes.push({ key: k, status: 'deleted', base: b });
    } else {
      const fc = fieldChanges(b, n, columns);
      if (fc.length > 0) {
        counts.modified++;
        changes.push({ key: k, status: 'modified', field_changes: fc, base: b, new: n });
      } else counts.unchanged++;
    }
  }
  for (const [k, n] of newIdx) {
    if (!baseIdx.has(k)) {
      counts.added++;
      changes.push({ key: k, status: 'added', new: n });
    }
  }
  return { counts, changes, columns };
}

function groupBy(rows, col) {
  const map = new Map();
  for (const r of rows) {
    const k = r[col] ?? '';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

function emptyCounts() {
  return { added: 0, deleted: 0, modified: 0, unchanged: 0 };
}

function pickLabel(row, labelCols) {
  if (!row || !labelCols) return undefined;
  const parts = labelCols.map((c) => row[c]).filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function pickContext(base, next, ctxCols) {
  if (!ctxCols) return undefined;
  const ctx = {};
  for (const c of ctxCols) ctx[c] = next?.[c] ?? base?.[c] ?? '';
  return ctx;
}

/**
 * Group diff of a file kept in DuckDB (shapes.txt by shape_id), as the JS
 * diff would do it: rows keyed by spec.key (repeated keys paired in file
 * order), compared on every column. Groups come in first-appearance order,
 * base file then new.
 */
async function diffGroupsSql(store, spec) {
  const tb = store.base.files.get(spec.file);
  const tn = store.new.files.get(spec.file);
  const columns = unionColumns(tb, tn);
  const side = (t) => {
    if (!t?.sql) return 'SELECT NULL::VARCHAR AS g, NULL::VARCHAR AS k, NULL::VARCHAR AS sig, NULL::BIGINT AS line WHERE false';
    const v = (c) => sqlValue('s', c, t.header);
    return `SELECT ${v(spec.groupBy)} AS g, concat_ws(chr(31), ${spec.key.map(v).join(', ')}) AS k,
      concat_ws(chr(31), ${columns.map(v).join(', ')}) AS sig, s._line AS line FROM ${ident(t.sql)} s`;
  };
  // Rows are only joined for groups in both feeds (none for IDFM vs Google,
  // whose shape_ids all differ); one-sided groups are counted as they are.
  const occ = 'row_number() OVER (PARTITION BY g, k ORDER BY line) AS occ';
  const rows = await store.all(
    `WITH b AS (${side(tb)}), n AS (${side(tn)}),
       bg AS (SELECT g, count(*)::INTEGER AS c, min(line) AS l FROM b GROUP BY g),
       ng AS (SELECT g, count(*)::INTEGER AS c, min(line) AS l FROM n GROUP BY g),
       shared AS (SELECT g FROM bg SEMI JOIN ng USING (g)),
       bj AS (SELECT *, ${occ} FROM b WHERE g IN (SELECT g FROM shared)),
       nj AS (SELECT *, ${occ} FROM n WHERE g IN (SELECT g FROM shared)),
       joined AS (
         SELECT coalesce(bj.g, nj.g) AS g,
           count(*) FILTER (WHERE bj.k IS NOT NULL AND nj.k IS NULL)::INTEGER AS deleted,
           count(*) FILTER (WHERE bj.k IS NULL AND nj.k IS NOT NULL)::INTEGER AS added,
           count(*) FILTER (WHERE bj.sig <> nj.sig)::INTEGER AS modified
         FROM bj FULL OUTER JOIN nj ON bj.g = nj.g AND bj.k = nj.k AND bj.occ = nj.occ
         GROUP BY 1
       )
     SELECT g, coalesce(j.deleted, CASE WHEN ng.g IS NULL THEN bg.c ELSE 0 END) AS deleted,
       coalesce(j.added, CASE WHEN bg.g IS NULL THEN ng.c ELSE 0 END) AS added,
       coalesce(j.modified, 0) AS modified,
       bg.g IS NOT NULL AS in_base, ng.g IS NOT NULL AS in_new
     FROM bg FULL OUTER JOIN ng USING (g) LEFT JOIN joined j USING (g)
     ORDER BY bg.l NULLS LAST, ng.l`,
  );
  return rows.map((r) => ({ ...r, g: String(r.g) }));
}

function diffEntityType(baseFeed, newFeed, spec, sqlGroups) {
  const baseTable = baseFeed.files.get(spec.file);
  const newTable = newFeed.files.get(spec.file);
  const present = { base: baseTable != null, new: newTable != null };
  const result = {
    file: spec.file,
    primary_key: spec.groupBy ? [spec.groupBy] : spec.key ?? [],
    child_files: (spec.children ?? []).map((c) => c.file),
    present,
    total: { base: 0, new: 0 },
    counts: emptyCounts(),
    changes: [],
  };
  if (!present.base && !present.new) return result;

  if (spec.geojson) {
    const baseFeatures = new Map((baseTable?.features ?? []).map((f) => [String(f.id), f]));
    const newFeatures = new Map((newTable?.features ?? []).map((f) => [String(f.id), f]));
    result.primary_key = ['id'];
    result.total = { base: baseFeatures.size, new: newFeatures.size };
    for (const [id, f] of baseFeatures) {
      const n = newFeatures.get(id);
      if (!n) {
        result.counts.deleted++;
        result.changes.push({ key: id, status: 'deleted' });
      } else if (JSON.stringify(f) !== JSON.stringify(n)) {
        result.counts.modified++;
        result.changes.push({ key: id, status: 'modified' });
      } else result.counts.unchanged++;
    }
    for (const id of newFeatures.keys()) {
      if (!baseFeatures.has(id)) {
        result.counts.added++;
        result.changes.push({ key: id, status: 'added' });
      }
    }
    return result;
  }

  if (spec.groupBy) {
    // Entities with no parent file (shapes.txt): each group's rows compared
    // as children, in DuckDB (diffGroupsSql).
    const groups = sqlGroups?.get(spec.file) ?? [];
    result.total = { base: groups.filter((g) => g.in_base).length, new: groups.filter((g) => g.in_new).length };
    for (const g of groups) {
      const children = { [spec.file]: { added: g.added, deleted: g.deleted, modified: g.modified } };
      if (!g.in_base) {
        result.counts.added++;
        result.changes.push({ key: g.g, status: 'added', children });
      } else if (!g.in_new) {
        result.counts.deleted++;
        result.changes.push({ key: g.g, status: 'deleted', children });
      } else if (g.added + g.deleted + g.modified > 0) {
        result.counts.modified++;
        result.changes.push({ key: g.g, status: 'modified', children });
      } else result.counts.unchanged++;
    }
    return result;
  }

  const parentDiff = diffTables(baseTable, newTable, spec.key);
  result.total = { base: baseTable?.rows.length ?? 0, new: newTable?.rows.length ?? 0 };

  // Child row changes grouped by parent key.
  const childChanges = new Map(); // parentKey -> { file -> counts }
  for (const child of spec.children ?? []) {
    const cb = baseFeed.files.get(child.file);
    const cn = newFeed.files.get(child.file);
    if (!cb && !cn) continue;
    const baseGroups = groupBy(cb?.rows ?? [], child.parent);
    const newGroups = groupBy(cn?.rows ?? [], child.parent);
    const parents = new Set([...baseGroups.keys(), ...newGroups.keys()]);
    for (const p of parents) {
      const { counts } = diffTables(
        baseGroups.has(p) ? { header: cb.header, rows: baseGroups.get(p) } : null,
        newGroups.has(p) ? { header: cn.header, rows: newGroups.get(p) } : null,
        child.key,
      );
      if (counts.added + counts.deleted + counts.modified === 0) continue;
      if (!childChanges.has(p)) childChanges.set(p, {});
      childChanges.get(p)[child.file] = {
        added: counts.added,
        deleted: counts.deleted,
        modified: counts.modified,
      };
    }
  }

  const changedKeys = new Set();
  for (const c of parentDiff.changes) {
    changedKeys.add(c.key);
    const entry = {
      key: displayKey(c.key),
      status: c.status,
      label: pickLabel(c.new ?? c.base, spec.label),
      context: pickContext(c.base, c.new, spec.context),
    };
    if (c.field_changes) entry.field_changes = c.field_changes;
    // Only single-column parent keys can be joined with children.
    const children = spec.key.length === 1 ? childChanges.get(c.key) : undefined;
    if (children) entry.children = children;
    result.changes.push(entry);
    result.counts[c.status]++;
  }
  result.counts.unchanged = parentDiff.counts.unchanged;

  // Parents whose own row is unchanged but whose children changed → modified.
  if (spec.key.length === 1) {
    const baseIdx = indexRows(baseTable?.rows ?? [], spec.key);
    const newIdx = indexRows(newTable?.rows ?? [], spec.key);
    for (const [p, children] of childChanges) {
      if (changedKeys.has(p) || !baseIdx.has(p) || !newIdx.has(p)) continue;
      result.counts.unchanged--;
      result.counts.modified++;
      result.changes.push({
        key: displayKey(p),
        status: 'modified',
        label: pickLabel(newIdx.get(p), spec.label),
        context: pickContext(baseIdx.get(p), newIdx.get(p), spec.context),
        children,
      });
    }
  }

  const order = { modified: 0, added: 1, deleted: 2 };
  result.changes.sort((a, b) => order[a.status] - order[b.status] || a.key.localeCompare(b.key));
  return result;
}

// ── Raw file diff (raw/<file>.parquet) ─────────────────────────────

/**
 * Every changed row of one keyed file (stops.txt, calendar_dates.txt, …) to
 * raw/<file>.parquet, or null when the file did not change. A `lookup` file
 * (stops, routes, calendar, calendar_dates) keeps its unchanged rows too, compact (base values NULL
 * where equal to the new ones), and always gets a table. trip_key and
 * base/new_trip_id hold the first key column's value (returned as
 * key_column; the whole key as key_columns), seq the CSV line, so rows sort
 * in file order within a key.
 */
async function writeRawFileTable(parquet, fileName, baseTable, newTable, key, lookup = false) {
  if (!baseTable && !newTable) return null;
  const columns = unionColumns(baseTable, newTable);
  const baseCols = new Set(baseTable?.header ?? []);
  const newCols = new Set(newTable?.header ?? []);
  // Columns in one feed only are column changes, not row changes.
  const compared = sharedColumns(baseTable, newTable);
  const columnsAdded = baseTable && newTable ? newTable.header.filter((c) => !baseCols.has(c)) : [];
  const columnsDeleted = baseTable && newTable ? baseTable.header.filter((c) => !newCols.has(c)) : [];
  const baseIdx = indexRows(baseTable?.rows ?? [], key);
  const newIdx = indexRows(newTable?.rows ?? [], key);
  const rowsChanged = () => {
    for (const [k, b] of baseIdx) {
      const n = newIdx.get(k);
      if (!n || fieldChanges(b, n, compared).length > 0) return true;
    }
    for (const k of newIdx.keys()) if (!baseIdx.has(k)) return true;
    return false;
  };
  const fileChanged = !baseTable || !newTable || columnsAdded.length + columnsDeleted.length > 0;
  if (!lookup && !fileChanged && !rowsChanged()) return null;
  const keyColumn = key[0];
  const table = await parquet.table(fileName, columns);
  const append = (action, b, n, changed, compactBase = false) =>
    table.append({
      compactBase,
      action,
      trip_key: (n ?? b)[keyColumn] ?? '',
      base_trip_id: b ? (b[keyColumn] ?? '') : null,
      new_trip_id: n ? (n[keyColumn] ?? '') : null,
      seq: ROW_LINES.get(n ?? b) ?? null,
      base_line: b ? (ROW_LINES.get(b) ?? null) : null,
      new_line: n ? (ROW_LINES.get(n) ?? null) : null,
      changed,
      base: b,
      new: n,
    });
  for (const [k, b] of baseIdx) {
    const n = newIdx.get(k);
    if (!n) append('deleted', b, null, null);
    else {
      const fc = fieldChanges(b, n, compared).map((c) => c.field);
      if (fc.length > 0) append('modified', b, n, fc);
      // Unchanged rows (a column one feed lacks aside) are counted, not
      // written, but in lookup files.
      else if (lookup) append('unchanged', b, n, null, true);
      else table.skip('unchanged');
    }
  }
  for (const [k, n] of newIdx) if (!baseIdx.has(k)) append('added', null, n, null);
  return {
    ...(await table.finish()),
    ...(keyColumn ? { key_column: keyColumn } : {}),
    key_columns: key,
    ...(columnsAdded.length > 0 ? { columns_added: columnsAdded } : {}),
    ...(columnsDeleted.length > 0 ? { columns_deleted: columnsDeleted } : {}),
  };
}

// ── Stops map payload ──────────────────────────────────────────────

/** Coordinate changes below this distance are treated as precision noise, not a move. */
const MOVE_THRESHOLD_M = 1;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371008.8;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function coordOf(row) {
  const lat = parseFloat(row?.stop_lat);
  const lon = parseFloat(row?.stop_lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lon, lat] : null;
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

/** Changed stops with full before/after rows. */
async function diffStopsMap(baseFeed, newFeed, store) {
  const baseTable = baseFeed.files.get('stops.txt');
  const newTable = newFeed.files.get('stops.txt');
  if (!baseTable && !newTable) return null;
  const columns = unionColumns(baseTable, newTable);
  // As in raw/stops.parquet (writeRawFileTable), which the stops page reads:
  // a column only one feed has is a column change, not a stop change.
  const compared = sharedColumns(baseTable, newTable);
  const baseIdx = new Map((baseTable?.rows ?? []).map((r) => [r.stop_id, r]));
  const newIdx = new Map((newTable?.rows ?? []).map((r) => [r.stop_id, r]));

  // (route, direction) pairs serving each stop, from every trip (stop_times
  // joined to trips): the stops table's served_base / served_new, and the
  // popup's route list. direction_id is '' when trips have none.
  const servedPairs = async (feed, side) => {
    const out = new Map();
    const st = feed.files.get('stop_times.txt');
    const trips = feed.files.get('trips.txt');
    if (!st?.sql) return out;
    // _route is joined on the raw trip_id (feed-store.mjs): so is direction_id.
    const hasDir = trips?.header.includes('direction_id') ?? false;
    const rows = await store.all(
      `SELECT DISTINCT trim(st.stop_id) AS s, trim(st._route) AS r,
         ${hasDir ? "coalesce(trim(tr.direction_id), '')" : "''"} AS d
       FROM ${ident(st.sql)} st
       ${hasDir ? `LEFT JOIN (SELECT DISTINCT trip_id, direction_id FROM ${ident(tableOf(side, 'trips.txt'))}) tr ON tr.trip_id = st.trip_id` : ''}
       WHERE st._route IS NOT NULL`,
    );
    for (const r of rows) {
      if (!out.has(r.s)) out.set(r.s, new Map());
      out.get(r.s).set(`${r.r}${KEY_SEP}${r.d}`, { route_id: r.r, direction_id: r.d });
    }
    return out;
  };
  const [baseServed, newServed] = [
    await timed('stops map: (route, direction) per stop (SQL, base)', () => servedPairs(baseFeed, 'base')),
    await timed('stops map: (route, direction) per stop (SQL, new)', () => servedPairs(newFeed, 'new')),
  ];
  const byPair = (x, y) => x.route_id.localeCompare(y.route_id) || x.direction_id.localeCompare(y.direction_id);
  const servedOf = (m, id) => [...(m.get(id)?.values() ?? [])].sort(byPair);
  const routesOf = (pairs) => [...new Set(pairs.map((p) => p.route_id))].sort();
  const movedOf = (bc, nc) => (bc && nc ? Math.round(haversineMeters(bc[1], bc[0], nc[1], nc[0]) * 10) / 10 : null);
  const endStops = timer('stops map: changed stops');

  const stops = [];
  const counts = { added: 0, deleted: 0, modified: 0, unchanged: 0, moved: 0 };
  for (const id of new Set([...baseIdx.keys(), ...newIdx.keys()])) {
    const b = baseIdx.get(id) ?? null;
    const n = newIdx.get(id) ?? null;
    const fc = b && n ? fieldChanges(b, n, compared) : [];
    const status = !b ? 'added' : !n ? 'deleted' : fc.length > 0 ? 'modified' : 'unchanged';
    counts[status]++;
    if (status === 'unchanged') continue;
    const bc = coordOf(b);
    const nc = coordOf(n);
    const movedM = movedOf(bc, nc);
    const moved = movedM != null && movedM >= MOVE_THRESHOLD_M;
    const served = { base: servedOf(baseServed, id), new: servedOf(newServed, id) };
    if (moved) counts.moved++;
    stops.push({
      stop_id: id,
      status,
      name: (n ?? b).stop_name ?? '',
      base: b,
      new: n,
      base_coord: bc && [round6(bc[0]), round6(bc[1])],
      new_coord: nc && [round6(nc[0]), round6(nc[1])],
      field_changes: fc,
      moved_m: movedM,
      moved,
      route_ids: { base: routesOf(served.base), new: routesOf(served.new) },
      served,
    });
  }
  // The stops table also holds every stop whose served (route, direction)
  // pairs differ, its stops.txt row unchanged or not (not in `stops`).
  const listed = new Set(stops.map((st) => st.stop_id));
  const servedChanges = [];
  for (const id of new Set([...baseServed.keys(), ...newServed.keys()])) {
    if (listed.has(id)) continue;
    const served = { base: servedOf(baseServed, id), new: servedOf(newServed, id) };
    const key = (pairs) => pairs.map((p) => `${p.route_id}${KEY_SEP}${p.direction_id}`).join('\u001e');
    if (key(served.base) === key(served.new)) continue;
    servedChanges.push({ stop_id: id, moved_m: movedOf(coordOf(baseIdx.get(id)), coordOf(newIdx.get(id))), served });
  }
  const order = { modified: 0, added: 1, deleted: 2 };
  stops.sort((a, b) => order[a.status] - order[b.status] || a.stop_id.localeCompare(b.stop_id));
  endStops({ rows: stops.length });
  console.log(`  stops map: ${stops.length} changed stops, ${servedChanges.length} more with changed (route, direction) pairs`);

  return {
    columns,
    counts,
    stops,
    served_changes: servedChanges,
    routes: routeLookup(baseFeed, newFeed),
  };
}

// ── Routes map payload ─────────────────────────────────────────────

/** Path deviations below this are treated as the same road. */
const PATH_CHANGE_THRESHOLD_M = 30;
const SIMPLIFY_TOLERANCE_M = 4;

/** Local equirectangular projection in metres around `lat0`. */
function projector(lat0) {
  const k = Math.cos((lat0 * Math.PI) / 180) * 111320;
  return ([lon, lat]) => [lon * k, lat * 110540];
}

function pointSegmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Distance (m) from each point of `line` to polyline `other`. */
function distancesToLine(line, other) {
  if (line.length === 0 || other.length === 0) return line.map(() => Infinity);
  const proj = projector(line[0][1]);
  const a = line.map(proj);
  const b = other.map(proj);
  return a.map((p) => {
    if (b.length === 1) return Math.hypot(p[0] - b[0][0], p[1] - b[0][1]);
    let min = Infinity;
    for (let i = 0; i + 1 < b.length; i++) min = Math.min(min, pointSegmentDistance(p, b[i], b[i + 1]));
    return min;
  });
}

/** Ramer–Douglas–Peucker simplification in metres. */
function simplify(points, tolM) {
  if (points.length <= 2) return points;
  const proj = projector(points[0][1]);
  const pts = points.map(proj);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [i, j] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = pointSegmentDistance(pts[k], pts[i], pts[j]);
      if (d > maxD) {
        maxD = d;
        idx = k;
      }
    }
    if (maxD > tolM && idx !== -1) {
      keep[idx] = 1;
      stack.push([i, idx], [idx, j]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const round5 = (n) => Math.round(n * 1e5) / 1e5;

/** Runs of `line` farther than the threshold from `other`, padded by one vertex for continuity. */
function divergingSections(line, other) {
  if (!line || !other) return [];
  const d = distancesToLine(line, other);
  const sections = [];
  let start = -1;
  for (let i = 0; i <= line.length; i++) {
    const far = i < line.length && d[i] > PATH_CHANGE_THRESHOLD_M;
    if (far && start === -1) start = i;
    if (!far && start !== -1) {
      sections.push(line.slice(Math.max(0, start - 1), Math.min(line.length, i + 1)));
      start = -1;
    }
  }
  return sections;
}

/** LCS-based diff of two stop sequences. */
function sequenceDiff(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: 'keep', stop_id: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ op: 'remove', stop_id: a[i++] });
    else ops.push({ op: 'add', stop_id: b[j++] });
  }
  while (i < n) ops.push({ op: 'remove', stop_id: a[i++] });
  while (j < m) ops.push({ op: 'add', stop_id: b[j++] });
  return ops;
}

function topKey(map) {
  let best = null;
  for (const [k, v] of map) if (best == null || v > best[1]) best = [k, v];
  return best?.[0] ?? null;
}

/**
 * direction -> stop pattern -> { stops, count, shapes } of one route and
 * feed, from forEachRoute's rows (stop_times by trip and sequence). Stops
 * are compared by their original id when the feed renames them per trip
 * (id_mappings.txt).
 */
function routePatterns(rows) {
  const byTrip = groupByTrip(rows.stopTimes);
  const dirs = new Map();
  for (const t of rows.trips) {
    const seq = (byTrip.get(t.trip_id) ?? []).map((r) => r._stop_key || r.stop_id);
    const key = seq.join(KEY_SEP);
    const dir = t.direction_id ?? '';
    if (!dirs.has(dir)) dirs.set(dir, new Map());
    const patterns = dirs.get(dir);
    if (!patterns.has(key)) patterns.set(key, { stops: seq, count: 0, shapes: new Map() });
    const pat = patterns.get(key);
    pat.count++;
    if (t.shape_id) pat.shapes.set(t.shape_id, (pat.shapes.get(t.shape_id) ?? 0) + 1);
  }
  return dirs;
}

/**
 * Per-route trips, services, stops, and per-direction stop patterns +
 * geometry for one feed. `patterns` is route_id -> routePatterns();
 * `shapes` the feed's loadShapes().
 */
function routeProfiles(feed, shapes, patterns) {
  const stopCoord = new Map((feed.files.get('stops.txt')?.rows ?? []).map((r) => [r.stop_id, coordOf(r)]));

  const profiles = new Map();
  for (const t of feed.files.get('trips.txt')?.rows ?? []) {
    if (!profiles.has(t.route_id)) {
      profiles.set(t.route_id, { trips: 0, services: new Set(), serviceTrips: new Map(), shapes: new Set(), stops: new Set(), dirs: new Map() });
    }
    const p = profiles.get(t.route_id);
    p.trips++;
    p.services.add(t.service_id);
    p.serviceTrips.set(t.service_id, (p.serviceTrips.get(t.service_id) ?? 0) + 1);
    if (t.shape_id) p.shapes.add(t.shape_id);
    const dir = t.direction_id ?? '';
    if (!p.dirs.has(dir)) p.dirs.set(dir, { trips: 0, patterns: patterns.get(t.route_id)?.get(dir) ?? new Map(), headsigns: new Map() });
    const d = p.dirs.get(dir);
    d.trips++;
    if (t.trip_headsign) d.headsigns.set(t.trip_headsign, (d.headsigns.get(t.trip_headsign) ?? 0) + 1);
  }
  for (const p of profiles.values()) {
    for (const d of p.dirs.values()) for (const pat of d.patterns.values()) for (const s of pat.stops) p.stops.add(s);
  }

  for (const p of profiles.values()) {
    for (const d of p.dirs.values()) {
      let main = null;
      for (const pat of d.patterns.values()) if (main == null || pat.count > main.count) main = pat;
      d.main = main?.stops ?? [];
      d.headsign = topKey(d.headsigns);
      const shapeId = main ? topKey(main.shapes) : null;
      const shape = shapeId ? shapes.get(shapeId) : null;
      d.geometry = shape ? shape.display : displayLine(d.main.map((s) => stopCoord.get(s)).filter(Boolean));
      d.shape_id = shapeId;
    }
  }
  return profiles;
}

const DAY_TYPES = { weekday: [0, 1, 2, 3, 4], saturday: [5], sunday: [6] };

/**
 * Trips each route runs on a typical weekday, Saturday and Sunday of one
 * feed: for every date of that day type in the feed's service window (its
 * first to last active date), the route's trips whose service runs that day
 * (calendar.txt + calendar_dates.txt); the most common count wins (ties go to
 * the larger). `profiles` is routeProfiles().
 */
function typicalTrips(feed, profiles) {
  const services = feedServices(feed);
  let start = null;
  let end = null;
  for (const s of services.values()) {
    for (const d of s.activeDates) {
      if (start == null || d < start) start = d;
      if (end == null || d > end) end = d;
    }
  }
  const byRoute = new Map();
  if (start == null) return { window: null, byRoute };
  const dates = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push([d, weekdayIndex(d)]);
  for (const [routeId, p] of profiles) {
    const perDate = new Map();
    for (const [sid, n] of p.serviceTrips) {
      for (const d of services.get(sid)?.activeDates ?? []) perDate.set(d, (perDate.get(d) ?? 0) + n);
    }
    const typical = {};
    for (const [type, days] of Object.entries(DAY_TYPES)) {
      const freq = new Map();
      for (const [d, wd] of dates) {
        if (!days.includes(wd)) continue;
        const c = perDate.get(d) ?? 0;
        freq.set(c, (freq.get(c) ?? 0) + 1);
      }
      let best = 0;
      let bestN = -1;
      for (const [c, k] of freq) if (k > bestN || (k === bestN && c > best)) [best, bestN] = [c, k];
      typical[type] = best;
    }
    byRoute.set(routeId, typical);
  }
  return { window: { start, end }, byRoute };
}

function routeNetworks(feed) {
  const out = new Map();
  for (const r of feed.files.get('route_networks.txt')?.rows ?? []) out.set(r.route_id, r.network_id);
  for (const r of feed.files.get('routes.txt')?.rows ?? []) if (r.network_id && !out.has(r.route_id)) out.set(r.route_id, r.network_id);
  return out;
}

// ── Route shapes ───────────────────────────────────────────────────

/** Same-id shapes deviating less than this only changed points or precision. */
const SHAPE_SAME_M = 2;
/** Simplification used to classify shapes (keeps the error well under SHAPE_SAME_M). */
const SHAPE_COMPARE_TOLERANCE_M = 0.5;

/**
 * shape_id -> { count (rows), sig (hash of every row, in order), lons, lats,
 * pts, display } from DuckDB. Coordinates stay in typed arrays (IDFM:
 * 12M points); `pts` builds [[lon, lat]] on each read, `display` is the
 * simplified line, kept.
 */
async function loadShapes(store, feed, columns) {
  const out = new Map();
  const t = feed.files.get('shapes.txt');
  if (!t?.sql) return out;
  const v = (c) => sqlValue('s', c, t.header);
  const rows = await store.all(
    `SELECT trim(s.shape_id) AS id, count(*)::INTEGER AS count,
       md5(string_agg(concat_ws(chr(31), ${columns.map(v).join(', ')}), chr(30) ORDER BY s._seq, s._line)) AS sig,
       list(s._lon ORDER BY s._seq, s._line) FILTER (WHERE s._lon IS NOT NULL AND s._lat IS NOT NULL) AS lons,
       list(s._lat ORDER BY s._seq, s._line) FILTER (WHERE s._lon IS NOT NULL AND s._lat IS NOT NULL) AS lats
     FROM ${ident(t.sql)} s GROUP BY 1 ORDER BY min(s._line)`,
  );
  // In file order, like the JS loader (rename matching is greedy).
  for (const r of rows) {
    const shape = {
      count: r.count,
      sig: r.sig,
      lons: Float64Array.from(r.lons ?? []),
      lats: Float64Array.from(r.lats ?? []),
      get size() {
        return this.lons.length;
      },
      get pts() {
        const pts = new Array(this.lons.length);
        for (let i = 0; i < pts.length; i++) pts[i] = [this.lons[i], this.lats[i]];
        return pts;
      },
      get display() {
        if (this._display === undefined) this._display = displayLine(this.pts);
        return this._display;
      },
    };
    out.set(r.id, shape);
  }
  return out;
}

/** Same coordinates, point for point. */
function sameCoords(a, b) {
  if (a.lons.length !== b.lons.length) return false;
  for (let i = 0; i < a.lons.length; i++) if (a.lons[i] !== b.lons[i] || a.lats[i] !== b.lats[i]) return false;
  return true;
}

/**
 * shape_id -> { trips, routes: Map(route_id -> trips), dirs: Set, uses:
 * Map(route + direction -> { route_id, direction_id, trips }) } from
 * trips.txt (direction_id '' when the trip has none).
 */
function shapeUsage(feed) {
  const out = new Map();
  for (const t of feed.files.get('trips.txt')?.rows ?? []) {
    if (!t.shape_id) continue;
    if (!out.has(t.shape_id)) out.set(t.shape_id, { trips: 0, routes: new Map(), dirs: new Set(), uses: new Map() });
    const u = out.get(t.shape_id);
    const dir = t.direction_id ?? '';
    u.trips++;
    u.routes.set(t.route_id, (u.routes.get(t.route_id) ?? 0) + 1);
    u.dirs.add(dir);
    const k = `${t.route_id}${KEY_SEP}${dir}`;
    if (!u.uses.has(k)) u.uses.set(k, { route_id: t.route_id, direction_id: dir, trips: 0 });
    u.uses.get(k).trips++;
  }
  return out;
}

/** (route, direction) pairs, by route_id then direction_id. */
function byRouteDir(x, y) {
  return x.route_id.localeCompare(y.route_id) || x.direction_id.localeCompare(y.direction_id);
}

/**
 * Is every vertex of `a` within `limit` m of polyline `b`? Flat projected
 * [x0, y0, x1, y1, …] arrays. Each vertex searches outward from the
 * segment the previous one matched, so similar lines cost O(n + m).
 */
function withinDistance(a, b, limit) {
  const segs = b.length / 2 - 1;
  if (segs < 1) return false;
  const lim2 = limit * limit;
  const near = (px, py, i) => {
    const ax = b[2 * i];
    const ay = b[2 * i + 1];
    const dx = b[2 * i + 2] - ax;
    const dy = b[2 * i + 3] - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const ex = px - (ax + t * dx);
    const ey = py - (ay + t * dy);
    return ex * ex + ey * ey <= lim2;
  };
  let last = 0;
  for (let k = 0; k < a.length; k += 2) {
    const px = a[k];
    const py = a[k + 1];
    let hit = -1;
    for (let d = 0; d < segs && hit === -1; d++) {
      if (last + d < segs && near(px, py, last + d)) hit = last + d;
      else if (d > 0 && last - d >= 0 && near(px, py, last - d)) hit = last - d;
    }
    if (hit === -1) return false;
    last = hit;
  }
  return true;
}

/** Symmetric max distance (m) between two polylines. */
function lineDeviation(a, b) {
  if (a.length < 2 || b.length < 2) return Infinity;
  const sa = simplify(a, SHAPE_COMPARE_TOLERANCE_M);
  const sb = simplify(b, SHAPE_COMPARE_TOLERANCE_M);
  return Math.max(Math.max(...distancesToLine(sa, sb)), Math.max(...distancesToLine(sb, sa)));
}

/** How far `line` strays (m) from the nearest of `others`, point by point. */
function noveltyFrom(line, others) {
  if (line.length === 0) return 0;
  if (others.length === 0) return Infinity;
  const min = line.map(() => Infinity);
  for (const o of others) {
    const d = distancesToLine(line, o);
    for (let i = 0; i < d.length; i++) if (d[i] < min[i]) min[i] = d[i];
  }
  return Math.max(...min);
}

function displayLine(pts) {
  return pts.length > 1 ? simplify(pts, SIMPLIFY_TOLERANCE_M).map(([x, y]) => [round5(x), round5(y)]) : null;
}

/**
 * Every shape grouped under the routes whose trips use it (either feed),
 * classified against its other version, with renames detected by geometry.
 * Returns per-route shape lists, shapes no trip uses, one row per shape
 * (the shapes table, `rows`, with `rowByBase` / `rowByNew` to find a row by
 * either feed's id) and pairing info for the raw Parquet table.
 */
async function diffRouteShapes(store) {
  const baseFeed = store.base;
  const newFeed = store.new;
  const columns = unionColumns(baseFeed.files.get('shapes.txt'), newFeed.files.get('shapes.txt'));
  const bs = await timed('shapes: load base shapes (SQL + arrays)', () => loadShapes(store, baseFeed, columns), (m) => ({ rows: m.size }));
  const ns = await timed('shapes: load new shapes (SQL + arrays)', () => loadShapes(store, newFeed, columns), (m) => ({ rows: m.size }));
  const bu = timed('shapes: usage from trips.txt (base)', () => shapeUsage(baseFeed));
  const nu = timed('shapes: usage from trips.txt (new)', () => shapeUsage(newFeed));
  const endRenames = timer('shapes: rename matching (geometry)');
  const round = (m) => (Number.isFinite(m) ? Math.round(m * 10) / 10 : null);

  // Renames: a shape only in base and one only in new, used by a common
  // route, with the same geometry.
  const onlyBase = [...bs.keys()].filter((id) => !ns.has(id));
  const onlyNew = [...ns.keys()].filter((id) => !bs.has(id));
  // Base-only shapes by route (a new shape is only compared with those of
  // its routes; IDFM vs Google share no shape_id, 10k x 10k pairs).
  const onlyBaseByRoute = new Map();
  for (const bid of onlyBase) {
    for (const r of bu.get(bid)?.routes.keys() ?? ['']) {
      if (!onlyBaseByRoute.has(r)) onlyBaseByRoute.set(r, []);
      onlyBaseByRoute.get(r).push(bid);
    }
  }
  const baseOrder = new Map(onlyBase.map((id, i) => [id, i]));
  const renamedFrom = new Map(); // new id -> base id
  const renamedTo = new Map(); // base id -> new id
  const near = (a, i, b, j) => haversineMeters(a.lats[i], a.lons[i], b.lats[j], b.lons[j]) <= SHAPE_SAME_M * 5;
  // Prefilter before the exact lineDeviation: lines simplified at 1 m in one
  // projection for the whole feed, kept flat. Conservative (simplification
  // and projection errors are well under the slack), so only pairs that
  // can't be within SHAPE_SAME_M are dropped: IDFM vs Google share endpoints
  // on nearly every same-route pair.
  const first = bs.values().next().value ?? ns.values().next().value;
  const project = projector(first?.lats[0] ?? 0);
  const coarse = new Map(); // shape object -> Float64Array
  const coarseOf = (shape) => {
    let flat = coarse.get(shape);
    if (!flat) {
      const pts = simplify(shape.pts, 1).map(project);
      flat = new Float64Array(pts.length * 2);
      pts.forEach(([x, y], i) => {
        flat[2 * i] = x;
        flat[2 * i + 1] = y;
      });
      coarse.set(shape, flat);
    }
    return flat;
  };
  const PREFILTER_M = SHAPE_SAME_M * 2 + 1;
  const maybeSame = (a, b) => {
    const ca = coarseOf(a);
    const cb = coarseOf(b);
    return withinDistance(ca, cb, PREFILTER_M) && withinDistance(cb, ca, PREFILTER_M);
  };
  for (const nid of onlyNew) {
    const routesN = [...(nu.get(nid)?.routes.keys() ?? [])];
    const candidates =
      routesN.length > 0
        ? [...new Set(routesN.flatMap((r) => onlyBaseByRoute.get(r) ?? []))].sort((x, y) => baseOrder.get(x) - baseOrder.get(y))
        : onlyBase;
    let best = null;
    for (const bid of candidates) {
      if (renamedTo.has(bid)) continue;
      const a = bs.get(bid);
      const b = ns.get(nid);
      // Cheap pre-check: same geometry means the endpoints line up.
      if (a.size < 2 || b.size < 2) continue;
      if (!near(a, 0, b, 0) || !near(a, a.size - 1, b, b.size - 1)) continue;
      const same = sameCoords(a, b);
      if (!same && !maybeSame(a, b)) continue;
      const dev = same ? 0 : lineDeviation(a.pts, b.pts);
      if (dev <= SHAPE_SAME_M && (best == null || dev < best.dev)) best = { bid, dev };
    }
    if (best) {
      renamedFrom.set(nid, best.bid);
      renamedTo.set(best.bid, nid);
    }
  }

  endRenames(() => ({ rows: renamedFrom.size }));
  // Display geometry per route and feed, for novelty of added/removed shapes.
  const endLines = timer('shapes: display lines per route (simplify)');
  const routeLines = (shapes, usage) => {
    const out = new Map();
    for (const [id, u] of usage) {
      const shape = shapes.get(id);
      if (!shape || shape.size < 2) continue;
      for (const r of u.routes.keys()) {
        if (!out.has(r)) out.set(r, []);
        out.get(r).push({ id, line: shape.display });
      }
    }
    return out;
  };
  const baseLines = routeLines(bs, bu);
  const newLines = routeLines(ns, nu);
  endLines();

  const endClassify = timer('shapes: classify + path comparison (deviation, divergence)');
  const byRoute = new Map(); // route_id -> shape entries
  const unused = [];
  const rows = []; // one per shape (renamed pairs: one, under the new id)
  const rowByBase = new Map();
  const rowByNew = new Map();
  const primaryRoute = new Map(); // shape key (new id, else base id) -> route_id
  const ids = [...new Set([...bs.keys(), ...ns.keys()])].filter((id) => !renamedTo.has(id)).sort();
  for (const id of ids) {
    const baseId = ns.has(id) ? (renamedFrom.get(id) ?? (bs.has(id) ? id : null)) : id;
    const newId = ns.has(id) ? id : null;
    const b = baseId ? bs.get(baseId) : null;
    const n = newId ? ns.get(newId) : null;
    const ub = baseId ? bu.get(baseId) : undefined;
    const un = newId ? nu.get(newId) : undefined;

    let status;
    let deviation = null;
    if (b && n) {
      const same = sameCoords(b, n);
      deviation = same ? 0 : lineDeviation(b.pts, n.pts);
      if (renamedFrom.has(id)) status = 'renamed';
      else if (same && b.sig === n.sig) status = 'unchanged';
      else if (deviation < SHAPE_SAME_M) status = 'points';
      else if (deviation <= PATH_CHANGE_THRESHOLD_M) status = 'redrawn';
      else status = 'rerouted';
    } else status = n ? 'added' : 'deleted';

    const routes = [...new Set([...(ub?.routes.keys() ?? []), ...(un?.routes.keys() ?? [])])].sort();
    const entryBase = {
      shape_id: newId ?? baseId,
      status,
      ...(renamedFrom.has(id) ? { renamed_from: baseId } : {}),
      points: { base: b?.count ?? 0, new: n?.count ?? 0 },
      unused: { base: b != null && ub == null, new: n != null && un == null },
    };
    const geometry = { base: b ? b.display : null, new: n ? n.display : null };
    const primary = [...(un?.routes.keys() ?? []), ...(ub?.routes.keys() ?? [])][0] ?? null;
    primaryRoute.set(newId ?? baseId, primary);
    // Both lines only when they differ visibly; renamed / points-only /
    // unchanged shapes draw just their current line.
    const keepGeometry = status !== 'unchanged' && status !== 'points' && status !== 'renamed';
    // The shapes table's row. A shape several routes use is stored once:
    // its deviation and diverging sections (relative to the route's shapes
    // in the other feed when added / removed) are its primary route's.
    const row = {
      shape_id: newId ?? baseId,
      status,
      renamed_from: renamedFrom.has(id) ? baseId : null,
      deviation_m: round(deviation),
      points: entryBase.points,
      unused: entryBase.unused,
      geometry: keepGeometry ? geometry : { base: null, new: geometry.new ?? geometry.base },
      diverge: { added: [], removed: [] },
      uses: {
        base: [...(ub?.uses.values() ?? [])].sort(byRouteDir),
        new: [...(un?.uses.values() ?? [])].sort(byRouteDir),
      },
      main: { base: [], new: [] },
    };
    rows.push(row);
    if (baseId) rowByBase.set(baseId, row);
    if (newId) rowByNew.set(newId, row);

    if (routes.length === 0) {
      unused.push({ ...entryBase, deviation_m: round(deviation), geometry });
      continue;
    }
    for (const r of routes) {
      // Added/removed shapes: how far they stray from the route's shapes in the other feed.
      let dev = deviation;
      let diverge = { added: [], removed: [] };
      if (status === 'added' && geometry.new) {
        const others = (baseLines.get(r) ?? []).map((x) => x.line);
        dev = noveltyFrom(geometry.new, others);
        if (dev > PATH_CHANGE_THRESHOLD_M && others.length > 0) diverge.added = others.length === 1 ? divergingSections(geometry.new, others[0]) : novelSections(geometry.new, others);
      } else if (status === 'deleted' && geometry.base) {
        const others = (newLines.get(r) ?? []).map((x) => x.line);
        dev = noveltyFrom(geometry.base, others);
        if (dev > PATH_CHANGE_THRESHOLD_M && others.length > 0) diverge.removed = others.length === 1 ? divergingSections(geometry.base, others[0]) : novelSections(geometry.base, others);
      } else if (status === 'rerouted') {
        diverge = { added: divergingSections(geometry.new, geometry.base), removed: divergingSections(geometry.base, geometry.new) };
      }
      if (r === primary) {
        row.deviation_m = round(dev);
        row.diverge = diverge;
      }
      if (!byRoute.has(r)) byRoute.set(r, []);
      byRoute.get(r).push({
        ...entryBase,
        deviation_m: round(dev),
        trips: { base: ub?.routes.get(r) ?? 0, new: un?.routes.get(r) ?? 0 },
        directions: [...new Set([...(ub?.dirs ?? []), ...(un?.dirs ?? [])])].sort(),
        other_routes: {
          base: [...(ub?.routes.keys() ?? [])].filter((x) => x !== r).sort(),
          new: [...(un?.routes.keys() ?? [])].filter((x) => x !== r).sort(),
        },
        geometry: keepGeometry ? geometry : { base: null, new: geometry.new ?? geometry.base },
        diverge,
      });
    }
  }
  endClassify({ rows: ids.length });
  return { byRoute, unused, rows, rowByBase, rowByNew, renamedFrom, primaryRoute, baseShapes: bs, newShapes: ns };
}

/** Runs of `line` farther than the threshold from every line in `others`. */
function novelSections(line, others) {
  const min = line.map(() => Infinity);
  for (const o of others) {
    const d = distancesToLine(line, o);
    for (let i = 0; i < d.length; i++) if (d[i] < min[i]) min[i] = d[i];
  }
  const sections = [];
  let start = -1;
  for (let i = 0; i <= line.length; i++) {
    const far = i < line.length && min[i] > PATH_CHANGE_THRESHOLD_M;
    if (far && start === -1) start = i;
    if (!far && start !== -1) {
      sections.push(line.slice(Math.max(0, start - 1), Math.min(line.length, i + 1)));
      start = -1;
    }
  }
  return sections;
}

/** Raw shapes rows per query (writeShapesRaw). */
const SHAPES_BATCH_ROWS = 500000;

const SHAPE_STATUSES = ['rerouted', 'redrawn', 'points', 'added', 'deleted', 'renamed', 'unchanged'];

/** A shape changes the route's path when it is re-routed, or added/removed onto new road. */
function isPathChange(sh) {
  if (sh.status === 'rerouted') return true;
  if (sh.status === 'added' || sh.status === 'deleted') return (sh.deviation_m ?? Infinity) > PATH_CHANGE_THRESHOLD_M;
  return false;
}

/**
 * Every shapes.txt row of both feeds, by route, for the raw diff table
 * (Parquet): rows of each shape pair joined on shape_pt_sequence in DuckDB
 * and copied straight to <dataset>/raw/shapes.parquet.
 */
async function writeShapesRaw(parquet, store, shapeInfo) {
  const bt = store.base.files.get('shapes.txt');
  const nt = store.new.files.get('shapes.txt');
  if (!parquet || (!bt?.sql && !nt?.sql)) return null;
  const columns = unionColumns(bt, nt);
  const compared = columns.filter((c) => c !== 'shape_id');
  const { baseShapes: bs, newShapes: ns, renamedFrom, primaryRoute } = shapeInfo;
  const renamedTo = new Map([...renamedFrom].map(([n, b]) => [b, n]));
  const ids = [...new Set([...bs.keys(), ...ns.keys()])].filter((id) => !(renamedTo.has(id) && !ns.has(id)));

  // (key, base shape, new shape, route, batch) of every pair, in table
  // order. Rows are written a batch of shapes at a time (IDFM: 15M rows
  // don't fit DuckDB's memory cap in one query), in that order, so the
  // table needs no final sort.
  const endPairs = timer('shapes raw: pairs table');
  const pairs = ids.map((id) => {
    const baseId = ns.has(id) ? (renamedFrom.get(id) ?? (bs.has(id) ? id : null)) : id;
    const newId = ns.has(id) ? id : null;
    const key = newId ?? baseId;
    const rows = (baseId ? bs.get(baseId).count : 0) + (newId ? ns.get(newId).count : 0);
    return { key, baseId, newId, route: primaryRoute.get(key) ?? null, rows };
  });
  const byte = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  pairs.sort((a, b) => (a.route == null) - (b.route == null) || byte(a.route ?? '', b.route ?? '') || byte(a.key, b.key));
  await store.run('CREATE OR REPLACE TABLE shape_pairs (key VARCHAR, base_id VARCHAR, new_id VARCHAR, route_id VARCHAR, batch INTEGER)');
  const appender = await store.con.createAppender('shape_pairs');
  const str = (v) => (v == null ? appender.appendNull() : appender.appendVarchar(v));
  let batch = 0;
  let batchRows = 0;
  for (const p of pairs) {
    if (batchRows > 0 && batchRows + p.rows > SHAPES_BATCH_ROWS) {
      batch++;
      batchRows = 0;
    }
    batchRows += p.rows;
    str(p.key);
    str(p.baseId);
    str(p.newId);
    str(p.route);
    appender.appendInteger(batch);
    appender.endRow();
  }
  appender.closeSync();
  endPairs({ rows: pairs.length });

  // Rows of one feed's shapes: those with a counterpart in the other feed
  // (joined row by row below), or without one (passed straight through, so
  // feeds sharing no shape_id, like IDFM vs Google, need no join at all).
  const side = (t, idCol, paired, b) => {
    const cols = columns.map((c, i) => `${t?.sql ? sqlValue('s', c, t.header) : 'NULL::VARCHAR'} AS c${i}`).join(', ');
    if (!t?.sql) return `SELECT NULL::VARCHAR AS key, NULL::VARCHAR AS k, NULL::BIGINT AS line, NULL::BIGINT AS occ, ${cols} WHERE false`;
    const k = sqlValue('s', 'shape_pt_sequence', t.header);
    const other = idCol === 'base_id' ? 'new_id' : 'base_id';
    return `SELECT p.key, ${k} AS k, s._line AS line,
        ${paired ? `row_number() OVER (PARTITION BY p.key, ${k} ORDER BY s._line)` : 'NULL::BIGINT'} AS occ, ${cols}
      FROM shape_pairs p JOIN ${ident(t.sql)} s ON trim(s.shape_id) = p.${idCol}
      WHERE p.batch = ${b} AND p.${other} IS ${paired ? 'NOT ' : ''}NULL`;
  };
  const changed = compared.map((c) => {
    const i = columns.indexOf(c);
    return `CASE WHEN b.c${i} <> n.c${i} THEN '${c}' END`;
  });
  const rel = rawTablePath('shapes.txt');
  const path = join(parquet.datasetDir, rel);
  const select = (b) =>
    `WITH b AS (${side(bt, 'base_id', true, b)}), n AS (${side(nt, 'new_id', true, b)}),
       j AS (
         SELECT coalesce(b.key, n.key) AS key, coalesce(b.k, n.k) AS k, b.line AS bl, n.line AS nl,
           b.key IS NOT NULL AS hb, n.key IS NOT NULL AS hn,
           ${changed.length > 0 ? `nullif(concat_ws(',', ${changed.join(', ')}), '')` : 'NULL::VARCHAR'} AS changed,
           ${columns.map((_, i) => `b.c${i} AS b${i}, n.c${i} AS n${i}`).join(', ')}
         FROM b FULL OUTER JOIN n ON b.key = n.key AND b.k = n.k AND b.occ = n.occ
         UNION ALL
         SELECT b.key, b.k, b.line, NULL, true, false, NULL, ${columns.map((_, i) => `b.c${i}, NULL`).join(', ')}
         FROM (${side(bt, 'base_id', false, b)}) b
         UNION ALL
         SELECT n.key, n.k, NULL, n.line, false, true, NULL, ${columns.map((_, i) => `NULL, n.c${i}`).join(', ')}
         FROM (${side(nt, 'new_id', false, b)}) n
       )
       SELECT
         CASE WHEN NOT j.hb THEN 'added' WHEN NOT j.hn THEN 'deleted' WHEN j.changed IS NOT NULL THEN 'modified'
              WHEN p.base_id IS DISTINCT FROM p.new_id THEN 'id_only' ELSE 'unchanged' END AS action,
         p.route_id, NULL::VARCHAR AS service_id, NULL::VARCHAR AS direction_id, j.key AS trip_key,
         CASE WHEN j.hb THEN p.base_id END AS base_trip_id, CASE WHEN j.hn THEN p.new_id END AS new_trip_id,
         TRY_CAST(j.k AS INTEGER) AS seq, j.bl::INTEGER AS base_line, j.nl::INTEGER AS new_line, j.changed,
         ${columns.map((c, i) => `j.b${i} AS ${ident(`b_${c}`)}, j.n${i} AS ${ident(`n_${c}`)}`).join(', ')}
       FROM j JOIN shape_pairs p ON p.key = j.key AND p.batch = ${b}
       ORDER BY p.route_id NULLS LAST, trip_key, seq`;
  const endJoin = timer('shapes raw: row join (SQL batches)');
  for (let b = 0; b <= batch; b++) {
    await store.run(b === 0 ? `CREATE OR REPLACE TABLE shapes_raw AS ${select(b)}` : `INSERT INTO shapes_raw ${select(b)}`);
  }
  endJoin({ calls: batch + 1 });
  // Every row is counted; unchanged ones are not written (raw-diff-parquet.mjs).
  const counts = Object.fromEntries(ACTIONS.map((a) => [a, 0]));
  let rows = 0;
  for (const r of await store.all('SELECT action, count(*)::INTEGER AS n FROM shapes_raw GROUP BY action')) {
    counts[r.action] = r.n;
    if (r.action !== 'unchanged') rows += r.n;
  }
  // Insertion order is the table order (preserve_insertion_order).
  await timed(
    `write ${rel} (COPY)`,
    () => store.run(`COPY (SELECT * FROM shapes_raw WHERE action <> 'unchanged') TO '${path.replace(/'/g, "''")}' (${parquetOptions()})`),
    () => ({ bytes: statSync(path).size }),
  );
  await store.run('DROP TABLE shapes_raw');
  await store.run('DROP TABLE shape_pairs');
  return {
    file: 'shapes.txt',
    path: rel,
    rows,
    bytes: statSync(path).size,
    columns,
    counts,
    ...(counts.unchanged > 0 ? { unchanged_omitted: true } : {}),
  };
}

function diffRoutesMap(store, shapeInfo, patterns) {
  const baseFeed = store.base;
  const newFeed = store.new;
  const baseTable = baseFeed.files.get('routes.txt');
  const newTable = newFeed.files.get('routes.txt');
  if (!baseTable && !newTable) return null;
  const columns = unionColumns(baseTable, newTable);
  // As in raw/routes.parquet, which the route panel reads the changes from.
  const compared = sharedColumns(baseTable, newTable);
  const baseRows = new Map((baseTable?.rows ?? []).map((r) => [r.route_id, r]));
  const newRows = new Map((newTable?.rows ?? []).map((r) => [r.route_id, r]));
  const bp = timed('routes map: route profiles (base)', () => routeProfiles(baseFeed, shapeInfo.baseShapes, patterns.base));
  const np = timed('routes map: route profiles (new)', () => routeProfiles(newFeed, shapeInfo.newShapes, patterns.new));
  const bn = routeNetworks(baseFeed);
  const nn = routeNetworks(newFeed);
  // The first feedServices() call builds the feed's services (cached for the calendar).
  const tb = timed('routes map: typical trips (base, + services build)', () => typicalTrips(baseFeed, bp));
  const tn = timed('routes map: typical trips (new, + services build)', () => typicalTrips(newFeed, np));
  const endRoutes = timer('routes map: per-route comparison + stop lookup');
  const referenced = new Set();
  // Agencies of both feeds (new names win). A feed with one agency may leave
  // routes.agency_id empty: those routes belong to that agency.
  const agencyNames = new Map();
  for (const feed of [baseFeed, newFeed]) {
    for (const a of feed.files.get('agency.txt')?.rows ?? []) agencyNames.set(a.agency_id ?? '', a.agency_name ?? '');
  }
  const soleAgency = (feed) => {
    const rows = feed.files.get('agency.txt')?.rows ?? [];
    return rows.length === 1 ? (rows[0].agency_id ?? '') : '';
  };
  const [baseSole, newSole] = [soleAgency(baseFeed), soleAgency(newFeed)];

  const routes = [];
  const ids = [...new Set([...baseRows.keys(), ...newRows.keys(), ...bp.keys(), ...np.keys()])].sort();
  for (const id of ids) {
    const b = baseRows.get(id) ?? null;
    const n = newRows.get(id) ?? null;
    const pb = bp.get(id);
    const pn = np.get(id);
    const row = n ?? b ?? {};
    const fc = b && n ? fieldChanges(b, n, compared) : [];
    const stopsB = pb?.stops ?? new Set();
    const stopsN = pn?.stops ?? new Set();
    const added = [...stopsN].filter((s) => !stopsB.has(s)).sort();
    const removed = [...stopsB].filter((s) => !stopsN.has(s)).sort();
    const servicesB = [...(pb?.services ?? [])].sort();
    const servicesN = [...(pn?.services ?? [])].sort();

    const directions = [];
    for (const dir of [...new Set([...(pb?.dirs.keys() ?? []), ...(pn?.dirs.keys() ?? [])])].sort()) {
      const db = pb?.dirs.get(dir);
      const dn = pn?.dirs.get(dir);
      const gb = db?.geometry ?? null;
      const gn = dn?.geometry ?? null;
      const devNew = gb && gn ? Math.max(...distancesToLine(gn, gb)) : null;
      const devBase = gb && gn ? Math.max(...distancesToLine(gb, gn)) : null;
      const pathChangeM = devNew == null ? null : Math.round(Math.max(devNew, devBase));
      for (const s of [...(db?.main ?? []), ...(dn?.main ?? [])]) referenced.add(s);
      directions.push({
        direction_id: dir,
        headsign: { base: db?.headsign ?? null, new: dn?.headsign ?? null },
        trips: { base: db?.trips ?? 0, new: dn?.trips ?? 0 },
        pattern_count: { base: db?.patterns.size ?? 0, new: dn?.patterns.size ?? 0 },
        shape_id: { base: db?.shape_id ?? null, new: dn?.shape_id ?? null },
        pattern_diff: sequenceDiff(db?.main ?? [], dn?.main ?? []),
        geometry: { base: gb, new: gn },
        path_change_m: pathChangeM,
        diverge: {
          added: pathChangeM != null && pathChangeM > PATH_CHANGE_THRESHOLD_M ? divergingSections(gn, gb) : [],
          removed: pathChangeM != null && pathChangeM > PATH_CHANGE_THRESHOLD_M ? divergingSections(gb, gn) : [],
        },
      });
    }
    for (const s of [...added, ...removed]) referenced.add(s);

    const order = Object.fromEntries(SHAPE_STATUSES.map((st, i) => [st, i]));
    const shapes = (shapeInfo?.byRoute.get(id) ?? []).sort(
      (x, y) => order[x.status] - order[y.status] || x.shape_id.localeCompare(y.shape_id, undefined, { numeric: true }),
    );

    const flags = {
      attributes: fc.length > 0,
      stops: added.length + removed.length > 0 || directions.some((d) => d.pattern_diff.some((o) => o.op !== 'keep')),
      path: directions.some((d) => (d.path_change_m ?? 0) > PATH_CHANGE_THRESHOLD_M) || shapes.some(isPathChange),
      trips: directions.some((d) => d.trips.base !== d.trips.new),
      services: servicesB.join('|') !== servicesN.join('|'),
      network: (bn.get(id) ?? '') !== (nn.get(id) ?? ''),
    };
    const inBase = b != null || pb != null;
    const inNew = n != null || pn != null;
    const status = !inBase ? 'added' : !inNew ? 'deleted' : Object.values(flags).some(Boolean) ? 'modified' : 'unchanged';
    const sortOrder = Number.parseFloat(row.route_sort_order ?? '');
    const typB = tb.byRoute.get(id);
    const typN = tn.byRoute.get(id);
    routes.push({
      route_id: id,
      status,
      agency_id: n?.agency_id || b?.agency_id || (n ? newSole : baseSole),
      short_name: row.route_short_name ?? '',
      long_name: row.route_long_name ?? '',
      route_type: row.route_type ?? '',
      color: row.route_color ?? '',
      text_color: row.route_text_color ?? '',
      base: b,
      new: n,
      field_changes: fc,
      flags,
      networks: { base: bn.get(id) ?? null, new: nn.get(id) ?? null },
      trips: { base: pb?.trips ?? 0, new: pn?.trips ?? 0 },
      typical_trips: Object.fromEntries(
        Object.keys(DAY_TYPES).map((type) => [type, { base: typB?.[type] ?? 0, new: typN?.[type] ?? 0 }]),
      ),
      sort_order: Number.isFinite(sortOrder) ? sortOrder : null,
      services: { base: servicesB, new: servicesN },
      stops: { base_count: stopsB.size, new_count: stopsN.size, added, removed },
      directions,
      shapes,
    });
  }

  // Stop lookup for every stop drawn on a route, with its own change status.
  const baseStops = new Map((baseFeed.files.get('stops.txt')?.rows ?? []).map((r) => [r.stop_id, r]));
  const newStops = new Map((newFeed.files.get('stops.txt')?.rows ?? []).map((r) => [r.stop_id, r]));
  const stopCols = unionColumns(baseFeed.files.get('stops.txt'), newFeed.files.get('stops.txt'));
  const stops = {};
  for (const id of referenced) {
    const b = baseStops.get(id);
    const n = newStops.get(id);
    const c = coordOf(n ?? b);
    if (!c) continue;
    const bc = coordOf(b);
    const movedM = bc && coordOf(n) ? haversineMeters(bc[1], bc[0], c[1], c[0]) : 0;
    stops[id] = {
      name: (n ?? b)?.stop_name ?? '',
      coord: [round6(c[0]), round6(c[1])],
      status: !b ? 'added' : !n ? 'deleted' : fieldChanges(b, n, stopCols).length > 0 ? 'modified' : 'unchanged',
      moved_m: Math.round(movedM * 10) / 10,
    };
  }

  // Each direction's main shape in each feed: the shapes table's main_base /
  // main_new (routes and directions are sorted, so the lists are too).
  for (const r of routes) {
    for (const d of r.directions) {
      const pair = { route_id: r.route_id, direction_id: d.direction_id };
      if (d.shape_id.base) shapeInfo.rowByBase.get(d.shape_id.base)?.main.base.push(pair);
      if (d.shape_id.new) shapeInfo.rowByNew.get(d.shape_id.new)?.main.new.push(pair);
    }
  }

  endRoutes({ rows: routes.length });
  const counts = emptyCounts();
  for (const r of routes) counts[r.status]++;
  return {
    columns,
    path_change_threshold_m: PATH_CHANGE_THRESHOLD_M,
    shape_same_m: SHAPE_SAME_M,
    service_window: { base: tb.window, new: tn.window },
    counts,
    agencies: [...agencyNames]
      .map(([agencyId, name]) => ({ agency_id: agencyId, name: name || agencyId || 'Agency' }))
      .sort((x, y) => x.name.localeCompare(y.name)),
    routes,
    stops,
    // Read by the routes highlights only; the shapes table holds them.
    unused_shapes: shapeInfo?.unused ?? [],
    // The shapes table's rows (map-tables.mjs writeRoutesTable).
    shape_rows: shapeInfo?.rows ?? [],
  };
}

// ── Date helpers (GTFS dates are YYYYMMDD, handled in UTC) ─────────

function toDate(s) {
  return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
}

function fromDate(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function addDays(s, n) {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
}

function daysBetween(a, b) {
  return Math.round((toDate(b) - toDate(a)) / 86400000);
}

/** 0 = Monday … 6 = Sunday */
function weekdayIndex(s) {
  return (toDate(s).getUTCDay() + 6) % 7;
}

// ── Calendar entity diff ───────────────────────────────────────────

const SERVICES_OF = new WeakMap();

/** buildServices(feed), built once per feed (read-only for callers). */
function feedServices(feed) {
  if (!SERVICES_OF.has(feed)) SERVICES_OF.set(feed, buildServices(feed));
  return SERVICES_OF.get(feed);
}

function buildServices(feed) {
  const services = new Map();
  const get = (id) => {
    if (!services.has(id)) services.set(id, { calendar: null, exceptions: new Map() });
    return services.get(id);
  };
  for (const row of feed.files.get('calendar.txt')?.rows ?? []) {
    const cal = {};
    for (const f of CALENDAR_FIELDS) cal[f] = row[f] ?? '';
    get(row.service_id).calendar = cal;
  }
  for (const row of feed.files.get('calendar_dates.txt')?.rows ?? []) {
    get(row.service_id).exceptions.set(row.date, row.exception_type);
  }
  for (const s of services.values()) s.activeDates = activeDates(s);
  return services;
}

function weekdayFlags(cal) {
  return WEEKDAYS.map((d) => cal?.[d] === '1');
}

function inRange(cal, d) {
  return cal != null && d >= cal.start_date && d <= cal.end_date;
}

function activeDates(service) {
  const dates = new Set();
  const cal = service.calendar;
  if (cal && /^\d{8}$/.test(cal.start_date) && /^\d{8}$/.test(cal.end_date)) {
    const flags = weekdayFlags(cal);
    for (let d = cal.start_date; d <= cal.end_date; d = addDays(d, 1)) {
      if (flags[weekdayIndex(d)]) dates.add(d);
    }
  }
  for (const [d, t] of service.exceptions) {
    if (t === '1') dates.add(d);
    else if (t === '2') dates.delete(d);
  }
  return dates;
}

/** Explain why `service` gained or lost `date` between base and new. */
function explainDateChange(b, n, d) {
  const be = b.exceptions.get(d) ?? null;
  const ne = n.exceptions.get(d) ?? null;
  if (be !== ne) {
    if (be == null) return { code: 'exception_added', detail: `exception_type ${ne} added` };
    if (ne == null) return { code: 'exception_removed', detail: `exception_type ${be} removed` };
    return { code: 'exception_type_changed', detail: `exception_type ${be} → ${ne}` };
  }
  if (!b.calendar && n.calendar) return { code: 'calendar_added', detail: 'calendar.txt row added' };
  if (b.calendar && !n.calendar) return { code: 'calendar_removed', detail: 'calendar.txt row removed' };
  const bin = inRange(b.calendar, d);
  const nin = inRange(n.calendar, d);
  if (bin !== nin) {
    return nin
      ? { code: 'period_extended', detail: `period ${b.calendar.start_date}–${b.calendar.end_date} → ${n.calendar.start_date}–${n.calendar.end_date}` }
      : { code: 'period_shortened', detail: `period ${b.calendar.start_date}–${b.calendar.end_date} → ${n.calendar.start_date}–${n.calendar.end_date}` };
  }
  const wd = WEEKDAYS[weekdayIndex(d)];
  return {
    code: n.calendar[wd] === '1' ? 'weekday_added' : 'weekday_removed',
    detail: `${wd} ${b.calendar[wd]} → ${n.calendar[wd]}`,
  };
}

function serializeService(s) {
  if (!s) return null;
  return {
    calendar: s.calendar,
    exceptions: [...s.exceptions.entries()]
      .map(([date, exception_type]) => ({ date, exception_type }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    active_day_count: s.activeDates.size,
    first_date: minOf(s.activeDates),
    last_date: maxOf(s.activeDates),
  };
}

function minOf(set) {
  let m = null;
  for (const v of set) if (m == null || v < m) m = v;
  return m;
}

function maxOf(set) {
  let m = null;
  for (const v of set) if (m == null || v > m) m = v;
  return m;
}

function serviceRoutes(feed) {
  const routes = new Map(); // service_id -> Set(route_id)
  const trips = new Map(); // service_id -> trip count
  for (const t of feed.files.get('trips.txt')?.rows ?? []) {
    if (!routes.has(t.service_id)) routes.set(t.service_id, new Set());
    routes.get(t.service_id).add(t.route_id);
    trips.set(t.service_id, (trips.get(t.service_id) ?? 0) + 1);
  }
  return { routes, trips };
}

function routeLookup(baseFeed, newFeed) {
  const out = {};
  const baseIds = new Set((baseFeed.files.get('routes.txt')?.rows ?? []).map((r) => r.route_id));
  const newIds = new Set((newFeed.files.get('routes.txt')?.rows ?? []).map((r) => r.route_id));
  for (const feed of [baseFeed, newFeed]) {
    for (const r of feed.files.get('routes.txt')?.rows ?? []) {
      out[r.route_id] = {
        short_name: r.route_short_name ?? '',
        long_name: r.route_long_name ?? '',
        color: r.route_color ?? '',
        text_color: r.route_text_color ?? '',
        presence: baseIds.has(r.route_id) && newIds.has(r.route_id) ? 'both' : baseIds.has(r.route_id) ? 'base' : 'new',
      };
    }
  }
  return out;
}

function diffCalendar(baseFeed, newFeed) {
  const baseServices = feedServices(baseFeed);
  const newServices = feedServices(newFeed);
  const baseRoutes = serviceRoutes(baseFeed);
  const newRoutes = serviceRoutes(newFeed);
  const services = [];
  const days = {}; // YYYYMMDD -> { added: [], removed: [], modified: [] }
  const day = (d) => (days[d] ??= { added: [], removed: [], modified: [] });
  const counts = emptyCounts();
  const ids = [...new Set([...baseServices.keys(), ...newServices.keys()])].sort();

  for (const id of ids) {
    const b = baseServices.get(id) ?? null;
    const n = newServices.get(id) ?? null;
    const routeIds = {
      base: [...(baseRoutes.routes.get(id) ?? [])].sort(),
      new: [...(newRoutes.routes.get(id) ?? [])].sort(),
    };
    const entry = {
      service_id: id,
      status: 'unchanged',
      base: serializeService(b),
      new: serializeService(n),
      route_ids: routeIds,
      trip_counts: { base: baseRoutes.trips.get(id) ?? 0, new: newRoutes.trips.get(id) ?? 0 },
      calendar_field_changes: [],
      exception_changes: { added: [], removed: [], modified: [] },
      dates_gained: [],
      dates_lost: [],
    };

    if (!b) {
      entry.status = 'added';
      for (const d of n.activeDates) {
        const exc = n.exceptions.get(d) ?? null;
        day(d).added.push({ service_id: id, exception: exc ? { base: null, new: exc } : null });
      }
    } else if (!n) {
      entry.status = 'deleted';
      for (const d of b.activeDates) {
        const exc = b.exceptions.get(d) ?? null;
        day(d).removed.push({ service_id: id, exception: exc ? { base: exc, new: null } : null });
      }
    } else {
      if (b.calendar && n.calendar) {
        entry.calendar_field_changes = fieldChanges(b.calendar, n.calendar, CALENDAR_FIELDS);
      } else if (b.calendar || n.calendar) {
        entry.calendar_field_changes = CALENDAR_FIELDS.map((f) => ({
          field: f,
          base_value: b.calendar?.[f] ?? '',
          new_value: n.calendar?.[f] ?? '',
        }));
      }
      const excDates = new Set([...b.exceptions.keys(), ...n.exceptions.keys()]);
      for (const d of [...excDates].sort()) {
        const be = b.exceptions.get(d);
        const ne = n.exceptions.get(d);
        if (be == null) entry.exception_changes.added.push({ date: d, exception_type: ne });
        else if (ne == null) entry.exception_changes.removed.push({ date: d, exception_type: be });
        else if (be !== ne) entry.exception_changes.modified.push({ date: d, base_exception_type: be, new_exception_type: ne });
      }
      entry.dates_gained = [...n.activeDates].filter((d) => !b.activeDates.has(d)).sort();
      entry.dates_lost = [...b.activeDates].filter((d) => !n.activeDates.has(d)).sort();

      const hasChanges =
        entry.calendar_field_changes.length > 0 ||
        entry.exception_changes.added.length + entry.exception_changes.removed.length + entry.exception_changes.modified.length > 0;
      if (hasChanges) entry.status = 'modified';

      const flipped = new Set([...entry.dates_gained, ...entry.dates_lost]);
      const excOf = (d) => {
        const be = b.exceptions.get(d) ?? null;
        const ne = n.exceptions.get(d) ?? null;
        return be || ne ? { base: be, new: ne } : null;
      };
      for (const d of entry.dates_gained) {
        day(d).modified.push({ service_id: id, change: 'gained', exception: excOf(d), reason: explainDateChange(b, n, d) });
      }
      for (const d of entry.dates_lost) {
        day(d).modified.push({ service_id: id, change: 'lost', exception: excOf(d), reason: explainDateChange(b, n, d) });
      }
      // Exception records that changed without flipping the day's activity
      // (e.g. a redundant "no service" exception on a day the service never ran).
      for (const d of excDates) {
        if (flipped.has(d) || b.exceptions.get(d) === n.exceptions.get(d)) continue;
        day(d).modified.push({ service_id: id, change: 'exception_only', exception: excOf(d), reason: explainDateChange(b, n, d) });
      }
    }
    counts[entry.status]++;
    services.push(entry);
  }

  // Active service counts per day across the union of both feeds' coverage.
  const allBase = new Set();
  const allNew = new Set();
  for (const s of baseServices.values()) for (const d of s.activeDates) allBase.add(d);
  for (const s of newServices.values()) for (const d of s.activeDates) allNew.add(d);
  const coverage = {
    base: { start: minOf(allBase), end: maxOf(allBase) },
    new: { start: minOf(allNew), end: maxOf(allNew) },
  };
  const start = [coverage.base.start, coverage.new.start].filter(Boolean).sort()[0];
  const end = [coverage.base.end, coverage.new.end].filter(Boolean).sort().at(-1);
  const activeCounts = {};
  if (start && end) {
    for (let d = start; d <= end; d = addDays(d, 1)) {
      let bc = 0;
      let nc = 0;
      for (const s of baseServices.values()) if (s.activeDates.has(d)) bc++;
      for (const s of newServices.values()) if (s.activeDates.has(d)) nc++;
      activeCounts[d] = [bc, nc];
    }
  }

  const sortedDays = Object.fromEntries(Object.keys(days).sort().map((d) => [d, days[d]]));

  return {
    files: ['calendar.txt', 'calendar_dates.txt'],
    present: {
      base: ['calendar.txt', 'calendar_dates.txt'].filter((f) => baseFeed.files.has(f)),
      new: ['calendar.txt', 'calendar_dates.txt'].filter((f) => newFeed.files.has(f)),
    },
    counts,
    total: { base: baseServices.size, new: newServices.size },
    coverage,
    services,
    days: sortedDays,
    active_counts: activeCounts,
  };
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const [basePath, newPath, outPath] = process.argv.slice(2);
  if (!basePath || !newPath || !outPath) {
    console.error('Usage: node scripts/generate-gtfs-entity-diff.mjs <base.zip> <new.zip> <report.json>');
    process.exit(1);
  }
  markStartup();
  const knownFiles = new Set(FILES.flatMap((e) => [e.file, ...(e.children ?? []).map((ch) => ch.file)]));
  // Both feeds in DuckDB; stop_times and shapes are only queried, never
  // held as JS rows (scripts/lib/feed-store.mjs).
  const store = await timed('feed store: open (total)', () =>
    openFeedStore({ basePath, newPath, files: knownFiles, lineOf: ROW_LINES }),
  );
  try {
    await timed('writeEntityDiff (total)', () => writeEntityDiff(store, outPath));
  } finally {
    timed('feed store: close', () => store.close());
  }
}

async function writeEntityDiff(store, outPath) {
  const baseFeed = store.base;
  const newFeed = store.new;

  const outDir = dirname(outPath);

  const t1 = Date.now();
  const shapeInfo = await timed('shapes: diffRouteShapes (total)', () => diffRouteShapes(store));
  console.log(`Shapes: ${shapeInfo.baseShapes.size} -> ${shapeInfo.newShapes.size}, ${shapeInfo.renamedFrom.size} renamed, ${shapeInfo.unused.length} unused, ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  const hasShapes = (feed) => feed.files.get('shapes.txt')?.sql != null;
  const sameShape = hasShapes(baseFeed) && hasShapes(newFeed)
    ? timed('shapes: shapeMatcher (same-path index)', () => shapeMatcher(shapeInfo.baseShapes, shapeInfo.newShapes))
    : null;

  // Trips are joined semantically, not by trip_id: schedulers renumber every
  // trip on each export. Matched route by route; every row of
  // trips/stop_times/frequencies also goes to Parquet (<dataset>/raw/) for
  // the browsable raw diff table.
  const t0 = Date.now();
  const masks = timed('trip matching: service masks (buildTripsIndex)', () => serviceMasks(buildTripsIndex(baseFeed, newFeed, new Set())));
  const matching = { mapped: 0, renamed: 0, base_trips: 0, new_trips: 0 };
  const perPass = MAPPING_PASSES.map(() => 0);
  // Stop patterns per route, for the Routes map (collected in the same pass).
  const patterns = { base: new Map(), new: new Map() };
  const parquet = await openRawParquet(dirname(outPath));
  let tripsFamily;
  let shapesRaw;
  try {
    const family = await openTripsFamilyDiff({ store, baseFeed, newFeed, lineOf: (row) => ROW_LINES.get(row), parquet, sameShape });
    // Per-route parts, summed (flushTallies() below).
    const endLoop = timer('routes loop (trip matching + trips/stop_times/frequencies diff): total');
    await forEachRoute(store, async (route, sides, i, total) => {
      const baseTrips = tally('routes loop: compact trips (base)', () => routeCompactTrips(store, 'base', sides.base));
      const newTrips = tally('routes loop: compact trips (new)', () => routeCompactTrips(store, 'new', sides.new));
      const { map, perPass: passes } = tally('routes loop: trip matching (mapTrips)', () => mapTrips(baseTrips, newTrips, masks));
      passes.forEach((n, p) => (perPass[p] += n));
      matching.mapped += map.size;
      for (const [b, n] of map) if (b !== n) matching.renamed++;
      matching.base_trips += sides.base.trips.length;
      matching.new_trips += sides.new.trips.length;
      tally('routes loop: family.addRoute (all three files)', () => family.addRoute(sides, map, route));
      tally('routes loop: stop patterns (routePatterns)', () => {
        for (const side of ['base', 'new']) patterns[side].set(route, routePatterns(sides[side]));
      });
      if ((i + 1) % 200 === 0 || i + 1 === total) {
        console.log(`  trips: ${i + 1}/${total} routes, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      }
    });
    endLoop(() => ({ rows: matching.base_trips + matching.new_trips }));
    flushTallies();
    tripsFamily = await timed('trips family: finish (raw parquet + entity)', () => family.finish());
    console.log(
      `Trip matching: ${matching.mapped} of ${matching.base_trips} base trips paired with a new trip ` +
        `(${matching.renamed} with a new trip_id; ${perPass.map((n, p) => `${n} by ${MAPPING_PASSES[p]}`).join(', ')}), ` +
        `${((Date.now() - t0) / 1000).toFixed(0)} s`,
    );
    shapesRaw = await timed('shapes raw: writeShapesRaw (total)', () => writeShapesRaw(parquet, store, shapeInfo), (t) => ({ rows: t?.rows, bytes: t?.bytes }));
  } finally {
    parquet.close();
  }
  if (shapesRaw) console.log(`  ${shapesRaw.path}: ${shapesRaw.rows} rows, ${Math.round(shapesRaw.bytes / 1024)} KB ${JSON.stringify(shapesRaw.counts)}`);
  for (const t of tripsFamily.rawTables) {
    console.log(`  ${t.path}: ${t.rows} rows, ${Math.round(t.bytes / 1024)} KB ${JSON.stringify(t.counts)}`);
  }

  // Grouped files kept in DuckDB (shapes.txt) are diffed there.
  const sqlGroups = new Map();
  for (const spec of FILES) {
    if (spec.groupBy) sqlGroups.set(spec.file, await timed(`entity diff ${spec.file} (SQL groups)`, () => diffGroupsSql(store, spec), (g) => ({ rows: g.length })));
  }

  // Every file: its entity diff (counts by key) and its raw row diff. Shapes
  // and the trip files have their own writers (above).
  const entityTypes = new Map([[tripsFamily.entityType.file, tripsFamily.entityType]]);
  const rawTables = new Map([...tripsFamily.rawTables, ...(shapesRaw ? [shapesRaw] : [])].map((t) => [t.file, t]));
  const fileParquet = await openRawParquet(outDir);
  try {
    for (const spec of FILES) {
      if (spec.trips) continue;
      if (!spec.rawOnly) {
        const et = timed(`entity diff ${spec.file}`, () => diffEntityType(baseFeed, newFeed, spec, sqlGroups), (e) => ({ rows: e.counts.added + e.counts.deleted + e.counts.modified }));
        entityTypes.set(spec.file, et);
      }
      if (spec.geojson || spec.groupBy) continue;
      const keyed = [{ file: spec.file, key: spec.key, lookup: spec.lookup }, ...(spec.children ?? []).map((c) => ({ file: c.file, key: [c.parent, ...c.key] }))];
      for (const e of keyed) {
        const t = await timed(`raw table ${e.file} (writeRawFileTable)`, () =>
          writeRawFileTable(fileParquet, e.file, baseFeed.files.get(e.file), newFeed.files.get(e.file), e.key, e.lookup),
        );
        if (!t) continue;
        const changed = t.counts.added + t.counts.deleted + t.counts.modified;
        console.log(`  ${t.path}: ${t.rows} rows (${changed} changed), ${Math.round(t.bytes / 1024)} KB`);
        rawTables.set(t.file, t);
      }
    }
  } finally {
    fileParquet.close();
  }

  // One entry per file either feed has. A child file (stop_times.txt) names
  // its parent: its rows count toward the parent's entities.
  const parentOf = new Map(FILES.flatMap((spec) => (spec.children ?? []).map((c) => [c.file, spec.file])));
  const inFeed = (file) => ({ base: baseFeed.files.has(file), new: newFeed.files.has(file) });
  const files = [];
  for (const spec of FILES) {
    for (const file of [spec.file, ...(spec.children ?? []).map((c) => c.file)]) {
      const et = entityTypes.get(file);
      const raw = rawTables.get(file);
      const present = et ? et.present : inFeed(file);
      if (!present.base && !present.new) continue;
      const { changes: _changes, child_files: _children, ...entity } = et ?? {};
      files.push({
        file,
        present,
        ...(et ? { total: entity.total, primary_key: entity.primary_key, counts: entity.counts } : {}),
        ...(et?.id_only != null ? { id_only: et.id_only } : {}),
        ...(parentOf.has(file) ? { part_of: parentOf.get(file) } : {}),
        ...(raw ? { raw_table: raw } : {}),
        ...(spec.trips && file === spec.file ? { trip_matching: matching } : {}),
      });
    }
  }

  // Analyses over several files, each with its own JSON and Parquet tables,
  // loaded by their page.
  const analyses = {};
  const writeAnalysis = (name, doc) => {
    const rel = ANALYSIS_FILES[name];
    const endWrite = timer(`write ${rel}`);
    mkdirSync(dirname(join(outDir, rel)), { recursive: true });
    const text = JSON.stringify(doc);
    writeFileSync(join(outDir, rel), text);
    endWrite({ bytes: text.length });
    const c = doc.counts;
    analyses[name] = {
      file: rel,
      ...(c ? { counts: { added: c.added, deleted: c.deleted, modified: c.modified, unchanged: c.unchanged } } : {}),
    };
    console.log(`  ${rel}: ${Math.round(text.length / 1024)} KB`);
  };
  const stopsMap = await timed('stops map: diffStopsMap', () => diffStopsMap(baseFeed, newFeed, store));
  const routesMap = timed('routes map: diffRoutesMap', () => diffRoutesMap(store, shapeInfo, patterns));
  const calendar = timed('calendar: diffCalendar', () => diffCalendar(baseFeed, newFeed));

  // Every page's route chips (stops and routes maps, calendar, Trips) read
  // names, colours and feeds from the routes.txt raw table, which holds
  // every route (lib/route-info); the documents point to it. Route details
  // look their stops up in the stops.txt one (lib/stop-info).
  let stopsDoc = stopsMap && (await timed('stops map: writeStopsTable (total)', () => writeStopsTable(outDir, stopsMap)));
  let routesDoc = routesMap && (await timed('routes map: writeRoutesTable (total)', () => writeRoutesTable(outDir, routesMap)));
  let calendarDoc = await timed('calendar: writeCalendarTables (total)', () => writeCalendarTables(outDir, calendar));
  const routesRaw = rawTables.get('routes.txt');
  const stopsRaw = rawTables.get('stops.txt');
  const routeInfo = routesRaw ? { route_info_file: routesRaw.path } : {};
  if (stopsDoc) {
    const { routes: _r, ...rest } = stopsDoc;
    stopsDoc = { ...rest, ...routeInfo };
    console.log(`  ${stopsDoc.table.path}: ${stopsDoc.table.rows} stops, ${Math.round(stopsDoc.table.bytes / 1024)} KB`);
    writeAnalysis('stops', stopsDoc);
  }
  if (routesDoc) {
    routesDoc = {
      ...routesDoc,
      ...routeInfo,
      ...(stopsRaw ? { stop_info_file: stopsRaw.path } : {}),
      ...(stopsDoc ? { stop_moves_file: stopsDoc.table.path } : {}),
    };
    console.log(`  ${routesDoc.table.path}: ${routesDoc.table.rows} routes, ${Math.round(routesDoc.table.bytes / 1024)} KB`);
    const sh = routesDoc.shapes_table;
    console.log(`  ${sh.path}: ${sh.rows} shapes, ${Math.round(sh.bytes / 1024)} KB`);
    writeAnalysis('routes', routesDoc);
  }
  if (calendarDoc) {
    // A service's rows: the calendar.txt and calendar_dates.txt raw tables.
    const rowsFile = (file) => rawTables.get(file)?.path ?? null;
    calendarDoc = {
      ...calendarDoc,
      ...routeInfo,
      calendar_rows_file: rowsFile('calendar.txt'),
      calendar_dates_rows_file: rowsFile('calendar_dates.txt'),
    };
    for (const t of Object.values(calendarDoc.tables)) console.log(`  ${t.path}: ${t.rows} rows, ${Math.round(t.bytes / 1024)} KB`);
    writeAnalysis('services', calendarDoc);
  }

  // report.json: this step's part (files, analyses) replaces its previous
  // one; the report step's (feeds, pathways counts, highlights) is kept.
  let previous = {};
  try {
    if (existsSync(outPath)) previous = JSON.parse(readFileSync(outPath, 'utf8'));
  } catch {
    previous = {};
  }
  const kept = previous.schema === 4 && previous.analyses?.pathways ? { pathways: previous.analyses.pathways } : {};
  const out = {
    ...previous,
    schema: 4,
    dataset: basename(dirname(outPath)),
    generated_at: new Date().toISOString(),
    metadata: {
      schema_version: SCHEMA_VERSION,
      generated_at: new Date().toISOString(),
      base_feed: { source: baseFeed.source },
      new_feed: { source: newFeed.source },
      files: {
        base: baseFeed.allFiles,
        new: newFeed.allFiles,
      },
    },
    files,
    analyses: { ...analyses, ...kept },
  };
  timed(`write ${basename(outPath)}`, () => writeFileSync(outPath, JSON.stringify(out)), () => ({ bytes: statSync(outPath).size }));
  const kb = Math.round(statSync(outPath).size / 1024);
  console.log(`Wrote ${outPath} (${kb} KB)`);
  for (const f of files) {
    if (f.counts) console.log(`  ${f.file.padEnd(26)} +${f.counts.added} -${f.counts.deleted} ~${f.counts.modified} =${f.counts.unchanged}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
