/**
 * @jest-environment node
 */
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import type {
  DayChanges,
  DayModifiedEntry,
  ServiceDiff,
} from './entity-diff-types';
import {
  type ServiceListFilters,
  dayCountsQuery,
  dayEntriesQuery,
  kindCountsQuery,
  serviceStatusCountsQuery,
  servicesPageQuery,
  toDayCounts,
  toDayEntryRow,
  toKindCounts,
} from './calendar-query';
import {
  CHANGE_KINDS,
  type CalendarFilters,
  DEFAULT_FILTERS,
  buildServiceRouteMap,
  filterDays,
  serviceMatches,
} from './calendar-utils';
import { normalizeText } from './stops-utils';

/**
 * The SQL runs in DuckDB over rows built like scripts/lib/calendar-tables.mjs
 * builds them, and is compared with the JS filters it replaces.
 */

const SEP = '\u001f';

function service(
  id: string,
  status: ServiceDiff['status'],
  routes: string[],
): ServiceDiff {
  return {
    service_id: id,
    status,
    base: null,
    new: null,
    route_ids: { base: routes, new: [] },
    trip_counts: { base: 3, new: 4 },
    calendar_field_changes: [],
    exception_changes: { added: [], removed: [], modified: [] },
    dates_gained: [],
    dates_lost: [],
  };
}

const SERVICES = [
  service('WK', 'modified', ['R1']),
  service('SAT', 'added', ['R2']),
  service('XMAS', 'deleted', ['R1', 'R3']),
  service('Été', 'unchanged', []),
];

const DAYS: Record<string, DayChanges> = {
  '20261224': {
    added: [{ service_id: 'XMAS', exception: { base: null, new: '1' } }],
    removed: [{ service_id: 'WK', exception: { base: null, new: '2' } }],
    modified: [],
  },
  '20261226': {
    added: [{ service_id: 'SAT', exception: null }],
    removed: [],
    modified: [
      {
        service_id: 'WK',
        exception: null,
        change: 'lost',
        reason: { code: 'weekday_removed', detail: 'saturday 1 → 0' },
      },
    ],
  },
};

let db: DuckDBInstance;
let con: DuckDBConnection;

async function rows(q: {
  sql: string;
  params: unknown[];
}): Promise<Array<Record<string, unknown>>> {
  const stmt = await con.prepare(q.sql);
  q.params.forEach((p, i) => stmt.bindValue(i + 1, p as string));
  return (await stmt.runAndReadAll()).getRowObjectsJS();
}

const routesOf = (s: ServiceDiff): string[] =>
  [...new Set([...s.route_ids.base, ...s.route_ids.new])].sort();
const wrap = (ids: string[]): string =>
  ids.length > 0 ? `${SEP}${ids.join(SEP)}${SEP}` : '';

beforeAll(async () => {
  db = await DuckDBInstance.create(':memory:');
  con = await db.connect();
  await con.run(`CREATE TABLE services (ord INTEGER, service_id VARCHAR, status VARCHAR, search VARCHAR,
    routes VARCHAR, route_ids VARCHAR, pattern VARCHAR, gained INTEGER, lost INTEGER,
    pattern_base VARCHAR, pattern_new VARCHAR, trips_base INTEGER, trips_new INTEGER, detail VARCHAR)`);
  const a = await con.createAppender('services');
  SERVICES.forEach((s, ord) => {
    a.appendInteger(ord);
    a.appendVarchar(s.service_id);
    a.appendVarchar(s.status);
    a.appendVarchar(normalizeText(s.service_id));
    a.appendVarchar(wrap(routesOf(s)));
    a.appendVarchar(JSON.stringify(routesOf(s)));
    a.appendVarchar('');
    a.appendInteger(0);
    a.appendInteger(0);
    a.appendVarchar('base pattern');
    a.appendVarchar('new pattern');
    a.appendInteger(s.trip_counts.base);
    a.appendInteger(s.trip_counts.new);
    a.appendVarchar(JSON.stringify(s));
    a.endRow();
  });
  a.closeSync();
  await con.run(`CREATE TABLE days (date VARCHAR, kind VARCHAR, kord INTEGER, ord INTEGER, service_id VARCHAR,
    has_exc BOOLEAN, exc_base VARCHAR, exc_new VARCHAR, change VARCHAR, reason_code VARCHAR,
    reason_detail VARCHAR, routes VARCHAR)`);
  const d = await con.createAppender('days');
  const byId = new Map(SERVICES.map((s) => [s.service_id, s]));
  for (const [date, day] of Object.entries(DAYS)) {
    CHANGE_KINDS.forEach((kind, kord) =>
      day[kind].forEach((e, ord) => {
        d.appendVarchar(date);
        d.appendVarchar(kind);
        d.appendInteger(kord);
        d.appendInteger(ord);
        d.appendVarchar(e.service_id);
        d.appendBoolean(e.exception != null);
        const m = e as Partial<DayModifiedEntry>;
        for (const v of [
          e.exception?.base,
          e.exception?.new,
          m.change,
          m.reason?.code,
          m.reason?.detail,
        ])
          if (v == null) d.appendNull();
          else d.appendVarchar(v);
        const s = byId.get(e.service_id);
        d.appendVarchar(wrap(s ? routesOf(s) : []));
        d.endRow();
      }),
    );
  }
  d.closeSync();
});

afterAll(() => {
  con.closeSync();
  db.closeSync();
});

const routes = buildServiceRouteMap(SERVICES);

describe('service-day changes SQL', () => {
  const cases: CalendarFilters[] = [
    DEFAULT_FILTERS,
    { ...DEFAULT_FILTERS, kinds: ['removed', 'modified'] },
    { ...DEFAULT_FILTERS, routeIds: ['R3'] },
    { ...DEFAULT_FILTERS, serviceIds: ['WK'] },
    { ...DEFAULT_FILTERS, exceptionType: '2' },
    { ...DEFAULT_FILTERS, exceptionType: 'none' },
    { ...DEFAULT_FILTERS, kinds: [] },
  ];

  it.each(cases)('counts each day like filterDays (%j)', async (f) => {
    const expected = Object.fromEntries(
      Object.entries(filterDays(DAYS, f, routes)).map(([d, day]) => [
        d,
        {
          added: day.added.length,
          removed: day.removed.length,
          modified: day.modified.length,
        },
      ]),
    );
    expect(toDayCounts(await rows(dayCountsQuery('days', f)))).toEqual(
      expected,
    );
  });

  it('counts kinds under the other filters', async () => {
    const f = {
      ...DEFAULT_FILTERS,
      kinds: ['added' as const],
      routeIds: ['R1'],
    };
    expect(toKindCounts(await rows(kindCountsQuery('days', f)))).toEqual({
      added: 1,
      removed: 1,
      modified: 1,
    });
  });

  it("lists a day's changes with their service, in section order", async () => {
    const list = (
      await rows(
        dayEntriesQuery('days', 'services', '20261226', DEFAULT_FILTERS),
      )
    ).map(toDayEntryRow);
    expect(list.map((r) => [r.kind, r.entry.service_id])).toEqual([
      ['added', 'SAT'],
      ['modified', 'WK'],
    ]);
    expect(list[1].entry).toEqual(DAYS['20261226'].modified[0]);
    expect(list[0]).toMatchObject({
      routeIds: ['R2'],
      patternNew: 'new pattern',
      trips: { base: 3, new: 4 },
    });
  });
});

describe('services SQL', () => {
  const list = async (f: ServiceListFilters): Promise<string[]> =>
    (await rows(servicesPageQuery('services', f, 0, 100))).map((r) =>
      String(r.service_id),
    );
  const none: ServiceListFilters = {
    serviceIds: [],
    routeIds: [],
    status: null,
    search: '',
  };

  it('filters like serviceMatches, then by status and search', async () => {
    const f = { ...DEFAULT_FILTERS, routeIds: ['R1'] };
    expect(await list({ ...none, routeIds: f.routeIds })).toEqual(
      SERVICES.filter((s) => serviceMatches(s.service_id, f, routes)).map(
        (s) => s.service_id,
      ),
    );
    expect(await list({ ...none, status: 'added' })).toEqual(['SAT']);
    expect(await list({ ...none, search: 'ete' })).toEqual(['Été']);
  });

  it('counts statuses under the other filters', async () => {
    const counts = await rows(
      serviceStatusCountsQuery('services', { ...none, status: 'added' }),
    );
    expect(Object.fromEntries(counts.map((r) => [r.status, r.n]))).toEqual({
      modified: 1,
      added: 1,
      deleted: 1,
      unchanged: 1,
    });
  });
});
