/**
 * Row-level diff of trips.txt, stop_times.txt and frequencies.txt that joins
 * trips semantically (lib/trip-id-mapping.mjs) instead of by trip_id.
 *
 * A base trip is compared with the new trip it was matched to, so a feed
 * that renumbered every trip_id doesn't read as "every trip deleted and
 * re-added". Its stop_times rows are aligned by stop order (LCS on stop_id,
 * the same alignment as the Trips view), not by stop_sequence values.
 *
 * Each row gets one action:
 *   added / deleted / modified   a real change
 *   id_only                      only identifiers differ (trip_id, block_id,
 *                                service_id, stop_sequence, a renamed shape
 *                                on the same path, a stop renamed through
 *                                id_mappings.txt): not a change
 *   unchanged
 *
 * Fed one route at a time (feeds with millions of stop_times rows never sit
 * in memory at once): open, addRoute() for every route, finish(). Outputs:
 *   - the trips.txt EntityTypeDiff (counts per trip, children counts),
 *   - every row, to the Parquet writer (raw-diff-parquet.mjs).
 */

import { alignStops } from '../../src/app/screens/GtfsDiffToolV2/lib/trips-utils.ts';

/**
 * Columns whose differences alone make a row "id_only". Schedulers renumber
 * these on every export: trip_id, block_id, and service_id (MBTA
 * BUS20263-… -> BUS20264-…; what days a service runs is the calendar view's
 * job). shape_id is handled separately (lib/shape-match.mjs): a renamed
 * shape is an identifier change only when it follows the same path.
 */
const ID_COLUMNS = {
  'trips.txt': new Set(['trip_id', 'block_id', 'service_id']),
  'stop_times.txt': new Set(['trip_id', 'stop_sequence']),
  'frequencies.txt': new Set(['trip_id']),
};

function unionColumns(a, b) {
  const cols = [...(a?.header ?? [])];
  for (const c of b?.header ?? []) if (!cols.includes(c)) cols.push(c);
  return cols;
}

function groupByTrip(rows) {
  const out = new Map();
  for (const r of rows) {
    let list = out.get(r.trip_id);
    if (!list) out.set(r.trip_id, (list = []));
    list.push(r);
  }
  return out;
}

/** Values that differ in text but are the same thing. */
function sameEntity(column, b, n, sameShape) {
  // A renamed shape on the same path.
  if (column === 'shape_id') return sameShape != null && sameShape(b[column], n[column]);
  // A stop renamed through id_mappings.txt (feed-store.mjs sets _stop_key).
  if (column === 'stop_id') return b._stop_key != null && b._stop_key !== '' && b._stop_key === n._stop_key;
  return false;
}

/** Classifies one file's rows and streams them to its Parquet table. */
function fileCollector(file, baseTable, newTable, { lineOf, parquetTable, sameShape }) {
  const columns = unionColumns(baseTable, newTable);
  const baseCols = new Set(baseTable?.header ?? []);
  const newCols = new Set(newTable?.header ?? []);
  // Columns in one feed only would flag every row; they aren't compared.
  const compared = columns.filter((c) => !baseTable || !newTable || (baseCols.has(c) && newCols.has(c)));
  const idCols = ID_COLUMNS[file];

  return {
    /** Compares two rows of the same entity; returns the action. */
    compare(b, n) {
      const changes = [];
      let ids = false;
      for (const c of compared) {
        const bv = b[c] ?? '';
        const nv = n[c] ?? '';
        if (bv === nv) continue;
        if (idCols.has(c) || sameEntity(c, b, n, sameShape)) ids = true;
        else changes.push({ field: c, base_value: bv, new_value: nv });
      }
      return { action: changes.length > 0 ? 'modified' : ids ? 'id_only' : 'unchanged', changes };
    },
    emit(action, b, n, ctx, changes = []) {
      parquetTable?.append({
        action,
        ...ctx,
        base_line: b ? lineOf(b) ?? null : null,
        new_line: n ? lineOf(n) ?? null : null,
        changed: changes.map((c) => c.field),
        base: b,
        new: n,
      });
    },
    /** Writes the Parquet file; its description for entity-diff.json. */
    async finishParquet() {
      return parquetTable ? parquetTable.finish() : null;
    },
  };
}

/**
 * @param {object} o
 * @param o.baseFeed, o.newFeed  feeds from feed-store.mjs
 * @param o.lineOf    row -> 1-based CSV line number
 * @param o.parquet   writer from raw-diff-parquet.mjs, or null
 * @param o.sameShape (baseShapeId, newShapeId) -> boolean, or null
 */
export async function openTripsFamilyDiff({ baseFeed, newFeed, lineOf, parquet, sameShape }) {
  const table = (feed, f) => feed.files.get(f) ?? null;
  const bt = table(baseFeed, 'trips.txt');
  const nt = table(newFeed, 'trips.txt');
  const sb = table(baseFeed, 'stop_times.txt');
  const sn = table(newFeed, 'stop_times.txt');
  const qb = table(baseFeed, 'frequencies.txt');
  const qn = table(newFeed, 'frequencies.txt');
  const rowLine = (row) => row._line ?? lineOf(row);

  const collect = async (file, b, n) =>
    b || n
      ? fileCollector(file, b, n, {
          lineOf: rowLine,
          sameShape,
          parquetTable: parquet ? await parquet.table(file, unionColumns(b, n)) : null,
        })
      : null;
  const files = {
    trips: await collect('trips.txt', bt, nt),
    stopTimes: await collect('stop_times.txt', sb, sn),
    frequencies: await collect('frequencies.txt', qb, qn),
  };
  const freqByTrip = (rows) => {
    const out = new Map();
    for (const r of rows ?? []) {
      let list = out.get(r.trip_id);
      if (!list) out.set(r.trip_id, (list = []));
      list.push(r);
    }
    return out;
  };
  const freq = { base: freqByTrip(qb?.rows), new: freqByTrip(qn?.rows) };

  // Per trip: its own row's action and its children's real changes.
  const trips = new Map(); // key -> { base, new, action, changes, children }
  const tripEntry = (k) => {
    let e = trips.get(k);
    if (!e) trips.set(k, (e = { base: null, new: null, action: 'unchanged', changes: [], children: {} }));
    return e;
  };
  const childCount = (k, file, action) => {
    if (action !== 'added' && action !== 'deleted' && action !== 'modified') return;
    const e = tripEntry(k);
    const c = (e.children[file] ??= { added: 0, deleted: 0, modified: 0 });
    c[action]++;
  };

  return {
    /**
     * One route of both feeds.
     * @param sides   { base: { trips, stopTimes }, new: { … } } (gtfs-trips-diff.mjs forEachRoute)
     * @param mapping Map<base trip_id, new trip_id> for this route
     */
    addRoute(sides, mapping) {
      const targets = new Set(mapping.values());
      // Base trip -> the key it is joined on: its matched new trip_id; else
      // its own id, unless a matched base trip already claims that new id.
      const keyOf = (id) => mapping.get(id) ?? (targets.has(id) ? `${id}\u0000base` : id);
      const newTripById = new Map(sides.new.trips.map((r) => [r.trip_id, r]));
      const baseTripByKey = new Map(sides.base.trips.map((r) => [keyOf(r.trip_id), r]));
      // Route / service / direction of each trip key, for filtering the table.
      const ctxOf = (k, baseId, newId) => {
        const t = (newId != null ? newTripById.get(newId) : null) ?? baseTripByKey.get(k);
        return {
          route_id: t?.route_id ?? null,
          service_id: t?.service_id ?? null,
          direction_id: t?.direction_id ?? null,
          trip_key: newId ?? baseId,
          base_trip_id: baseId,
          new_trip_id: newId,
        };
      };

      // ── trips.txt ──────────────────────────────────────────────────
      if (files.trips) {
        const fc = files.trips;
        const consumed = new Set();
        for (const b of sides.base.trips) {
          const k = keyOf(b.trip_id);
          const n = newTripById.get(k);
          const e = tripEntry(k);
          e.base = b;
          if (!n) {
            e.action = 'deleted';
            fc.emit('deleted', b, null, { ...ctxOf(k, b.trip_id, null), seq: 0 });
            continue;
          }
          consumed.add(k);
          e.new = n;
          const { action, changes } = fc.compare(b, n);
          e.action = action;
          e.changes = changes;
          fc.emit(action, b, n, { ...ctxOf(k, b.trip_id, n.trip_id), seq: 0 }, changes);
        }
        for (const n of sides.new.trips) {
          if (consumed.has(n.trip_id)) continue;
          const e = tripEntry(n.trip_id);
          e.new = n;
          e.action = 'added';
          fc.emit('added', null, n, { ...ctxOf(n.trip_id, null, n.trip_id), seq: 0 });
        }
      }

      // ── stop_times.txt: aligned by stop order within matched trips ──
      if (files.stopTimes) {
        const fc = files.stopTimes;
        const baseGroups = groupByTrip(sides.base.stopTimes);
        const newGroups = groupByTrip(sides.new.stopTimes);
        const stop = (r) => r._stop_key || r.stop_id;
        const consumed = new Set();
        for (const [baseId, brows] of baseGroups) {
          const k = keyOf(baseId);
          const nrows = newGroups.get(k);
          if (!nrows) {
            brows.forEach((b, i) => {
              fc.emit('deleted', b, null, { ...ctxOf(k, baseId, null), seq: i });
              childCount(k, 'stop_times.txt', 'deleted');
            });
            continue;
          }
          consumed.add(k);
          const ctx = ctxOf(k, baseId, k);
          alignStops(brows.map(stop), nrows.map(stop)).forEach((o, i) => {
            const b = o.bi != null ? brows[o.bi] : null;
            const n = o.ni != null ? nrows[o.ni] : null;
            if (o.op === 'keep') {
              const { action, changes } = fc.compare(b, n);
              fc.emit(action, b, n, { ...ctx, seq: i }, changes);
              childCount(k, 'stop_times.txt', action);
            } else {
              const action = o.op === 'add' ? 'added' : 'deleted';
              fc.emit(action, b, n, { ...ctx, seq: i });
              childCount(k, 'stop_times.txt', action);
            }
          });
        }
        for (const [newId, nrows] of newGroups) {
          if (consumed.has(newId)) continue;
          nrows.forEach((n, i) => {
            fc.emit('added', null, n, { ...ctxOf(newId, null, newId), seq: i });
            childCount(newId, 'stop_times.txt', 'added');
          });
        }
      }

      // ── frequencies.txt ────────────────────────────────────────────
      if (files.frequencies) {
        const fc = files.frequencies;
        const fkey = (tripKey, r) => `${tripKey}\u001f${r.start_time}`;
        const newRows = sides.new.trips.flatMap((t) => freq.new.get(t.trip_id) ?? []);
        const newByKey = new Map(newRows.map((r) => [fkey(r.trip_id, r), r]));
        const consumed = new Set();
        for (const b of sides.base.trips.flatMap((t) => freq.base.get(t.trip_id) ?? [])) {
          const k = keyOf(b.trip_id);
          const n = newByKey.get(fkey(k, b));
          if (!n) {
            fc.emit('deleted', b, null, { ...ctxOf(k, b.trip_id, null), seq: 0 });
            childCount(k, 'frequencies.txt', 'deleted');
            continue;
          }
          consumed.add(fkey(k, b));
          const { action, changes } = fc.compare(b, n);
          fc.emit(action, b, n, { ...ctxOf(k, b.trip_id, n.trip_id), seq: 0 }, changes);
          childCount(k, 'frequencies.txt', action);
        }
        for (const n of newRows) {
          if (consumed.has(fkey(n.trip_id, n))) continue;
          fc.emit('added', null, n, { ...ctxOf(n.trip_id, null, n.trip_id), seq: 0 });
          childCount(n.trip_id, 'frequencies.txt', 'added');
        }
      }
    },

    /** Writes the Parquet files; returns the trips.txt entity and raw table descriptions. */
    async finish() {
      const rawTables = [];
      for (const fc of [files.trips, files.stopTimes, files.frequencies]) {
        const t = fc ? await fc.finishParquet() : null;
        if (t) rawTables.push(t);
      }

      // ── trips.txt entity: one entry per changed trip ───────────────
      const counts = { added: 0, deleted: 0, modified: 0, unchanged: 0 };
      let idOnly = 0;
      const changes = [];
      for (const [k, e] of trips) {
        const childChanged = Object.keys(e.children).length > 0;
        const status =
          e.action === 'added' || e.action === 'deleted'
            ? e.action
            : e.action === 'modified' || childChanged
              ? 'modified'
              : 'unchanged';
        if (!e.base || !e.new) {
          // Child rows of a trip missing from trips.txt in one feed.
          if (status === 'unchanged') continue;
        }
        counts[status]++;
        if (status === 'unchanged') {
          if (e.action === 'id_only') idOnly++;
          continue;
        }
        const row = e.new ?? e.base;
        const renamed = e.base && e.new && e.base.trip_id !== e.new.trip_id;
        const entry = {
          key: renamed ? `${e.base.trip_id} → ${e.new.trip_id}` : (row?.trip_id ?? k),
          status,
          context: { route_id: row?.route_id ?? '', service_id: row?.service_id ?? '' },
        };
        if (e.changes.length > 0) entry.field_changes = e.changes;
        if (childChanged) entry.children = e.children;
        changes.push(entry);
      }
      const order = { modified: 0, added: 1, deleted: 2 };
      changes.sort((a, b) => order[a.status] - order[b.status] || a.key.localeCompare(b.key));

      return {
        entityType: {
          file: 'trips.txt',
          primary_key: ['trip_id'],
          child_files: ['stop_times.txt', 'frequencies.txt'].filter((f) => baseFeed.files.has(f) || newFeed.files.has(f)),
          present: { base: bt != null, new: nt != null },
          total: { base: bt?.rows.length ?? 0, new: nt?.rows.length ?? 0 },
          counts,
          id_only: idOnly,
          changes,
        },
        rawTables,
      };
    },
  };
}
