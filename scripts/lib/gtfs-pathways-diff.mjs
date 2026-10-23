/**
 * Station-level diff of levels.txt + pathways.txt (+ the stops.txt rows that
 * make up each station's pathway graph).
 *
 * Pathways are folded into undirected "links": many feeds (MBTA, for one)
 * publish every corridor as two one-way rows, which reads as one thing to a
 * rider. A link is keyed by its two endpoints and its pathway_mode, so a
 * pathway whose pathway_id changed but whose endpoints, mode and attributes
 * did not is reported as "restructured" rather than removed + added.
 *
 * Routing (entrance -> platform reachability, step-free access) is computed
 * client-side from this payload, see
 * src/app/screens/GtfsDiffToolV2/lib/pathways-utils.ts.
 *
 * Input feeds have the shape produced by loadFeed() in
 * scripts/generate-gtfs-entity-diff.mjs: { files: Map<name, { header, rows }> }.
 */

const KEY_SEP = '|';

/** Columns that identify a pathway row rather than describe it. */
const PATHWAY_IDENTITY = new Set([
  'pathway_id',
  'from_stop_id',
  'to_stop_id',
  'pathway_mode',
  'is_bidirectional',
]);

/** "62.4840000" and "62.484" are the same value; don't report them. */
function sameValue(a, b) {
  if (a === b) return true;
  if (a === '' || b === '') return false;
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
}

function unionColumns(...tables) {
  const cols = [];
  for (const t of tables) for (const c of t?.header ?? []) if (!cols.includes(c)) cols.push(c);
  return cols;
}

function fieldChanges(base, next, columns, ignore = new Set()) {
  const out = [];
  for (const field of columns) {
    if (ignore.has(field)) continue;
    const b = base?.[field] ?? '';
    const n = next?.[field] ?? '';
    if (!sameValue(b, n)) out.push({ field, base_value: b, new_value: n });
  }
  return out;
}

/** Drop empty columns: the client treats a missing key as ''. */
function sparse(row) {
  if (!row) return null;
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== ''));
}

function rowStatus(base, next, changes) {
  if (!base) return 'added';
  if (!next) return 'deleted';
  return changes.length > 0 ? 'modified' : 'unchanged';
}

// ── Station membership ─────────────────────────────────────────────

/** stop_id -> station stop_id, following platform -> station for boarding areas. */
function stationOf(stops, stopId) {
  let s = stops.get(stopId);
  for (let hops = 0; s && hops < 3; hops++) {
    if (s.location_type === '1') return s.stop_id;
    if (!s.parent_station) return null;
    s = stops.get(s.parent_station);
  }
  return null;
}

function indexFeed(feed) {
  const stopsTable = feed.files.get('stops.txt');
  const stops = new Map((stopsTable?.rows ?? []).map((r) => [r.stop_id, r]));
  const levels = new Map((feed.files.get('levels.txt')?.rows ?? []).map((r) => [r.level_id, r]));
  const pathways = feed.files.get('pathways.txt')?.rows ?? [];
  const byStation = new Map(); // station_id -> pathway rows
  let orphans = 0;
  for (const p of pathways) {
    const st = stationOf(stops, p.from_stop_id) ?? stationOf(stops, p.to_stop_id);
    if (st == null) {
      orphans++;
      continue;
    }
    if (!byStation.has(st)) byStation.set(st, []);
    byStation.get(st).push(p);
  }
  return { stops, levels, pathways, byStation, orphans };
}

// ── Links ──────────────────────────────────────────────────────────

function linkKey(p) {
  const [a, b] = [p.from_stop_id, p.to_stop_id].sort();
  return { id: [a, b, p.pathway_mode].join(KEY_SEP), a, b };
}

function groupLinks(rows) {
  const links = new Map();
  for (const p of rows) {
    const { id, a, b } = linkKey(p);
    if (!links.has(id)) links.set(id, { id, a, b, mode: p.pathway_mode, rows: [] });
    links.get(id).rows.push(p);
  }
  return links;
}

/** The row describing travel a->b ('ab') or b->a ('ba') on this link, if any. */
function directionRow(link, dir) {
  if (!link) return null;
  const [from, to] = dir === 'ab' ? [link.a, link.b] : [link.b, link.a];
  return (
    link.rows.find((r) => r.from_stop_id === from && r.to_stop_id === to) ??
    link.rows.find((r) => r.is_bidirectional === '1') ??
    null
  );
}

function diffLink(id, baseLink, newLink, columns) {
  const ref = newLink ?? baseLink;
  const out = {
    id,
    a: ref.a,
    b: ref.b,
    mode: ref.mode,
    status: 'unchanged',
    base: (baseLink?.rows ?? []).map(sparse),
    new: (newLink?.rows ?? []).map(sparse),
    field_changes: [],
    id_changes: [],
  };
  if (!baseLink) return { ...out, status: 'added' };
  if (!newLink) return { ...out, status: 'deleted' };

  const perDir = {};
  for (const dir of ['ab', 'ba']) {
    const b = directionRow(baseLink, dir);
    const n = directionRow(newLink, dir);
    if (!b && !n) continue;
    perDir[dir] = !b || !n
      ? [{ field: 'direction', base_value: b ? 'Present' : 'Not present', new_value: n ? 'Present' : 'Not present' }]
      : fieldChanges(b, n, columns, PATHWAY_IDENTITY);
  }
  // A change seen identically in both directions is reported once.
  const ab = perDir.ab ?? [];
  const ba = perDir.ba ?? [];
  const same = (x, y) => x.field === y.field && x.base_value === y.base_value && x.new_value === y.new_value;
  for (const c of ab) {
    if (ba.some((d) => same(c, d))) out.field_changes.push(c);
    else out.field_changes.push({ ...c, direction: 'ab' });
  }
  for (const c of ba) if (!ab.some((d) => same(c, d))) out.field_changes.push({ ...c, direction: 'ba' });

  const baseIds = baseLink.rows.map((r) => r.pathway_id).sort();
  const newIds = newLink.rows.map((r) => r.pathway_id).sort();
  const idsChanged = baseIds.join(KEY_SEP) !== newIds.join(KEY_SEP);
  if (idsChanged) {
    for (const dir of ['ab', 'ba']) {
      const b = directionRow(baseLink, dir);
      const n = directionRow(newLink, dir);
      if (b && n && b.pathway_id !== n.pathway_id) {
        if (!out.id_changes.some((c) => c.base === b.pathway_id && c.new === n.pathway_id)) {
          out.id_changes.push({ base: b.pathway_id, new: n.pathway_id });
        }
      }
    }
  }
  const bidirChanged =
    baseLink.rows.some((r) => r.is_bidirectional === '1') !== newLink.rows.some((r) => r.is_bidirectional === '1');
  if (out.field_changes.length > 0) out.status = 'modified';
  else if (idsChanged || bidirChanged) out.status = 'restructured';
  return out;
}

// ── Station diff ───────────────────────────────────────────────────

const STATUS_ORDER = { deleted: 0, added: 1, modified: 2, restructured: 3, unchanged: 4 };

function diffStation(stationId, base, next, cols) {
  const baseRows = base.byStation.get(stationId) ?? [];
  const newRows = next.byStation.get(stationId) ?? [];
  const baseLinks = groupLinks(baseRows);
  const newLinks = groupLinks(newRows);

  const links = [...new Set([...baseLinks.keys(), ...newLinks.keys()])]
    .map((id) => diffLink(id, baseLinks.get(id), newLinks.get(id), cols.pathways))
    .sort((x, y) => STATUS_ORDER[x.status] - STATUS_ORDER[y.status] || x.id.localeCompare(y.id));

  const nodeIds = new Set();
  for (const l of links) nodeIds.add(l.a).add(l.b);
  const nodes = [...nodeIds].sort().map((stopId) => {
    const b = base.stops.get(stopId) ?? null;
    const n = next.stops.get(stopId) ?? null;
    const fc = b && n ? fieldChanges(b, n, cols.stops) : [];
    return { stop_id: stopId, status: rowStatus(b, n, fc), base: sparse(b), new: sparse(n), field_changes: fc };
  });

  const levelIds = new Set();
  for (const nd of nodes) {
    if (nd.base?.level_id) levelIds.add(nd.base.level_id);
    if (nd.new?.level_id) levelIds.add(nd.new.level_id);
  }
  const levels = [...levelIds].sort().map((levelId) => {
    const b = base.levels.get(levelId) ?? null;
    const n = next.levels.get(levelId) ?? null;
    const fc = b && n ? fieldChanges(b, n, cols.levels) : [];
    return { level_id: levelId, status: rowStatus(b, n, fc), base: sparse(b), new: sparse(n), field_changes: fc };
  });

  const changed =
    links.some((l) => l.status !== 'unchanged') ||
    nodes.some((n) => n.status !== 'unchanged') ||
    levels.some((l) => l.status !== 'unchanged');
  const baseStation = base.stops.get(stationId) ?? null;
  const newStation = next.stops.get(stationId) ?? null;
  return {
    station_id: stationId,
    name: (newStation ?? baseStation)?.stop_name ?? stationId,
    status: baseRows.length === 0 ? 'added' : newRows.length === 0 ? 'deleted' : changed ? 'modified' : 'unchanged',
    station: { base: sparse(baseStation), new: sparse(newStation) },
    levels,
    nodes,
    links,
  };
}

/**
 * Diff the pathway graphs of every station in two feeds.
 * Returns null when neither feed has pathways.txt.
 */
export function diffPathways(baseFeed, newFeed) {
  const present = (feed) => ({
    levels: feed.files.has('levels.txt'),
    pathways: feed.files.has('pathways.txt'),
  });
  if (!baseFeed.files.has('pathways.txt') && !newFeed.files.has('pathways.txt')) return null;

  const base = indexFeed(baseFeed);
  const next = indexFeed(newFeed);
  const cols = {
    stops: unionColumns(baseFeed.files.get('stops.txt'), newFeed.files.get('stops.txt')),
    levels: unionColumns(baseFeed.files.get('levels.txt'), newFeed.files.get('levels.txt')),
    pathways: unionColumns(baseFeed.files.get('pathways.txt'), newFeed.files.get('pathways.txt')),
  };

  const stationIds = [...new Set([...base.byStation.keys(), ...next.byStation.keys()])].sort();
  const stations = [];
  const unchanged = [];
  for (const id of stationIds) {
    const s = diffStation(id, base, next, cols);
    if (s.status === 'unchanged') unchanged.push(id);
    else stations.push(s);
  }

  return {
    present: { base: present(baseFeed), new: present(newFeed) },
    totals: {
      stations: { base: base.byStation.size, new: next.byStation.size },
      pathways: { base: base.pathways.length, new: next.pathways.length },
      levels: { base: base.levels.size, new: next.levels.size },
    },
    /** Pathways whose endpoints don't belong to any station (not diffed). */
    orphan_pathways: { base: base.orphans, new: next.orphans },
    unchanged_station_ids: unchanged,
    stations,
  };
}
