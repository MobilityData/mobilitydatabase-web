/**
 * @jest-environment node
 */
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import type { DayChanges } from './entity-diff-types';
import {
  type CalendarViews,
  type ServiceListFilters,
  dayCountsQuery,
  dayEntriesQuery,
  kindCountsQuery,
  serviceRouteIdsQuery,
  serviceRowsQueries,
  serviceStatusCountsQuery,
  servicesPageQuery,
  toDayCounts,
  toDayEntryRow,
  toKindCounts,
  toServiceListRow,
} from './calendar-query';
import { CALENDAR_FIELDS, serviceDiffFromRows } from './calendar-rows';
import {
  type CalendarFilters,
  DEFAULT_FILTERS,
  filterDays,
  serviceMatches,
} from './calendar-utils';

/**
 * The SQL runs in DuckDB over tables shaped like the build writes them
 * (scripts/lib/calendar-tables.mjs, raw tables with lookup rows), and is
 * compared with the JS filters it replaces over the same changes.
 *
 *   WK    modified: Mon–Sat → Mon–Fri, and a "no service" exception on
 *         Thu 24 Dec added
 *   SAT   added (Saturdays), XMAS added (24 Dec only, by exception)
 *   OLD   deleted (Mon–Fri)
 *   Été   unchanged (its raw row compact)
 */

const ROUTES: Record<string, { base: string[]; new: string[] }> = {
  WK: { base: ['R1'], new: ['R1'] },
  SAT: { base: [], new: ['R2'] },
  XMAS: { base: [], new: ['R1', 'R3'] },
  OLD: { base: ['R1'], new: [] },
  Été: { base: [], new: [] },
};

const DAYS: Record<string, DayChanges> = {
  '20261224': {
    added: [{ service_id: 'XMAS', exception: { base: null, new: '1' } }],
    removed: [{ service_id: 'OLD', exception: null }],
    modified: [
      {
        service_id: 'WK',
        exception: { base: null, new: '2' },
        change: 'lost',
        reason: { code: 'exception_added', detail: 'exception_type 2 added' },
      },
    ],
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

const V: CalendarViews = {
  days: 'days',
  services: 'services',
  calendar: 'raw_calendar',
  dates: 'raw_dates',
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

const sql = (v: string | null): string =>
  v == null ? 'NULL' : `'${v.replace(/'/g, "''")}'`;
const list = (ids: string[]): string =>
  `[${ids.map(sql).join(', ')}]::VARCHAR[]`;

/** A calendar.txt row's values: weekday flags, then start and end dates. */
function cal(days: string, start = '20260101', end = '20261231'): string[] {
  return [...days.split(''), start, end];
}

beforeAll(async () => {
  db = await DuckDBInstance.create(':memory:');
  con = await db.connect();
  await con.run(`CREATE TABLE services (service_id VARCHAR, status VARCHAR,
    route_ids_base VARCHAR[], route_ids_new VARCHAR[], trips_base INTEGER, trips_new INTEGER,
    active_days_base INTEGER, active_days_new INTEGER, first_date_base VARCHAR, last_date_base VARCHAR,
    first_date_new VARCHAR, last_date_new VARCHAR, gained INTEGER, lost INTEGER)`);
  await con.run(`INSERT INTO services VALUES
    ('WK', 'modified', ${list(ROUTES.WK.base)}, ${list(ROUTES.WK.new)}, 3, 4,
      312, 260, '20260101', '20261231', '20260101', '20261231', 0, 2),
    ('SAT', 'added', ${list(ROUTES.SAT.base)}, ${list(ROUTES.SAT.new)}, 0, 4,
      NULL, 52, NULL, NULL, '20260103', '20261226', 0, 0),
    ('XMAS', 'added', ${list(ROUTES.XMAS.base)}, ${list(ROUTES.XMAS.new)}, 0, 1,
      NULL, 1, NULL, NULL, '20261224', '20261224', 0, 0),
    ('OLD', 'deleted', ${list(ROUTES.OLD.base)}, ${list(ROUTES.OLD.new)}, 3, 0,
      261, NULL, '20260101', '20261231', NULL, NULL, 0, 0),
    ('Été', 'unchanged', ${list(ROUTES['Été'].base)}, ${list(ROUTES['Été'].new)}, 0, 0,
      313, 313, '20260101', '20261231', '20260101', '20261231', 0, 0)`);

  await con.run(
    `CREATE TABLE days (date VARCHAR, service_id VARCHAR, change VARCHAR, reason_code VARCHAR)`,
  );
  await con.run(`INSERT INTO days VALUES
    ('20261224', 'XMAS', 'added', NULL),
    ('20261224', 'OLD', 'removed', NULL),
    ('20261224', 'WK', 'lost', 'exception_added'),
    ('20261226', 'SAT', 'added', NULL),
    ('20261226', 'WK', 'lost', 'weekday_removed')`);

  // raw/calendar.parquet: action, key, then b_/n_ pairs per field.
  const fields = CALENDAR_FIELDS.flatMap((f) => [`b_${f}`, `n_${f}`]);
  await con.run(`CREATE TABLE raw_calendar (action VARCHAR, trip_key VARCHAR, changed VARCHAR,
    ${fields.map((c) => `${c} VARCHAR`).join(', ')})`);
  const calRow = (
    action: string,
    id: string,
    b: string[] | null,
    n: string[] | null,
    changed: string | null = null,
  ): string =>
    `(${sql(action)}, ${sql(id)}, ${sql(changed)}, ${CALENDAR_FIELDS.map(
      (_, i) => `${sql(b?.[i] ?? null)}, ${sql(n?.[i] ?? null)}`,
    ).join(', ')})`;
  await con.run(`INSERT INTO raw_calendar VALUES
    ${calRow('modified', 'WK', cal('1111110'), cal('1111100'), 'saturday')},
    ${calRow('added', 'SAT', null, cal('0000010'))},
    ${calRow('deleted', 'OLD', cal('1111100'), null)},
    ${calRow('unchanged', 'Été', null, cal('1111111'))}`);

  // raw/calendar_dates.parquet (key: service_id, date).
  await con.run(`CREATE TABLE raw_dates (action VARCHAR, trip_key VARCHAR,
    b_date VARCHAR, n_date VARCHAR, b_exception_type VARCHAR, n_exception_type VARCHAR)`);
  await con.run(`INSERT INTO raw_dates VALUES
    ('added', 'XMAS', NULL, '20261224', NULL, '1'),
    ('added', 'WK', NULL, '20261224', NULL, '2'),
    ('unchanged', 'Été', NULL, '20261225', NULL, '2')`);
});

afterAll(() => {
  con.closeSync();
  db.closeSync();
});

const routes = new Map(
  Object.entries(ROUTES).map(([id, r]) => [id, new Set([...r.base, ...r.new])]),
);

describe('service-day changes SQL', () => {
  const cases: CalendarFilters[] = [
    DEFAULT_FILTERS,
    { ...DEFAULT_FILTERS, kinds: ['removed', 'modified'] },
    { ...DEFAULT_FILTERS, routeIds: ['R3'] },
    { ...DEFAULT_FILTERS, routeIds: ['R1', 'R2'] },
    { ...DEFAULT_FILTERS, serviceIds: ['WK'] },
    { ...DEFAULT_FILTERS, exceptionType: '1' },
    { ...DEFAULT_FILTERS, exceptionType: '2' },
    { ...DEFAULT_FILTERS, exceptionType: 'none' },
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
    expect(toDayCounts(await rows(dayCountsQuery(V, f)))).toEqual(expected);
  });

  it('counts kinds under the other filters', async () => {
    const f = {
      ...DEFAULT_FILTERS,
      kinds: ['added' as const],
      routeIds: ['R1'],
    };
    expect(toKindCounts(await rows(kindCountsQuery(V, f)))).toEqual({
      added: 1,
      removed: 1,
      modified: 2,
    });
  });

  it("lists a day's changes in section order, as the build stored them", async () => {
    for (const [date, day] of Object.entries(DAYS)) {
      const list = (await rows(dayEntriesQuery(V, date, DEFAULT_FILTERS))).map(
        toDayEntryRow,
      );
      expect(list.map((r) => [r.kind, r.entry])).toEqual([
        ...day.added.map((e) => ['added', e]),
        ...day.removed.map((e) => ['removed', e]),
        ...day.modified.map((e) => ['modified', e]),
      ]);
    }
  });

  it("shows each service's routes, trips and patterns", async () => {
    const [xmas, old, wk] = (
      await rows(dayEntriesQuery(V, '20261224', DEFAULT_FILTERS))
    ).map(toDayEntryRow);
    expect(xmas).toMatchObject({
      routeIds: ['R1', 'R3'],
      patternBase: '',
      patternNew: 'Specific dates only · 1 date',
      trips: { base: 0, new: 1 },
    });
    expect(old.patternBase).toBe('Mon–Fri · Thu 1 Jan 2026 – Thu 31 Dec 2026');
    expect([wk.patternBase, wk.patternNew]).toEqual([
      'Mon–Sat · Thu 1 Jan 2026 – Thu 31 Dec 2026',
      'Mon–Fri · Thu 1 Jan 2026 – Thu 31 Dec 2026',
    ]);
  });

  it('works without the calendar raw tables', async () => {
    const v = { ...V, calendar: null, dates: null };
    const list = (
      await rows(dayEntriesQuery(v, '20261226', DEFAULT_FILTERS))
    ).map(toDayEntryRow);
    expect(list.map((r) => r.entry.service_id)).toEqual(['SAT', 'WK']);
    expect(
      toDayCounts(
        await rows(
          dayCountsQuery(v, { ...DEFAULT_FILTERS, exceptionType: 'none' }),
        ),
      ),
    ).toEqual({
      '20261224': { added: 1, removed: 1, modified: 1 },
      '20261226': { added: 1, removed: 0, modified: 1 },
    });
  });
});

describe('services SQL', () => {
  const page = async (f: ServiceListFilters): Promise<string[]> =>
    (await rows(servicesPageQuery(V, f, 0, 100))).map((r) =>
      String(r.service_id),
    );
  const none: ServiceListFilters = {
    serviceIds: [],
    routeIds: [],
    status: null,
    search: '',
  };

  it('lists modified, added, deleted then unchanged services', async () => {
    expect(await page(none)).toEqual(['WK', 'SAT', 'XMAS', 'OLD', 'Été']);
  });

  it('filters like serviceMatches, then by status and search', async () => {
    const f = { ...DEFAULT_FILTERS, routeIds: ['R1'] };
    expect(await page({ ...none, routeIds: f.routeIds })).toEqual(
      ['WK', 'XMAS', 'OLD'].filter((id) => serviceMatches(id, f, routes)),
    );
    expect(await page({ ...none, status: 'added' })).toEqual(['SAT', 'XMAS']);
    expect(await page({ ...none, search: 'ete' })).toEqual(['Été']);
  });

  it('shows the weekly pattern from the calendar.txt rows', async () => {
    const list = (await rows(servicesPageQuery(V, none, 0, 100))).map(
      toServiceListRow,
    );
    expect(list.map((s) => [s.service_id, s.pattern])).toEqual([
      ['WK', 'Mon–Sat → Mon–Fri'],
      ['SAT', 'Sat'],
      ['XMAS', 'Specific dates only'],
      ['OLD', 'Mon–Fri'],
      ['Été', 'Mon–Sun'],
    ]);
    expect(list[0]).toMatchObject({
      routeIds: ['R1'],
      gained: 0,
      lost: 2,
      trips: { base: 3, new: 4 },
      activeDays: { base: 312, new: 260 },
    });
    // NULL where the service isn't in that feed.
    expect(list[1]).toMatchObject({ activeDays: { base: 0, new: 52 } });
  });

  it('counts statuses under the other filters', async () => {
    const counts = await rows(
      serviceStatusCountsQuery('services', { ...none, status: 'added' }),
    );
    expect(Object.fromEntries(counts.map((r) => [r.status, r.n]))).toEqual({
      modified: 1,
      added: 2,
      deleted: 1,
      unchanged: 1,
    });
  });

  it('lists the routes any service is used by', async () => {
    const ids = (await rows(serviceRouteIdsQuery('services'))).map((r) =>
      String(r.route_id),
    );
    expect(ids.sort()).toEqual(['R1', 'R2', 'R3']);
  });
});

describe("a service's full record", () => {
  async function serviceDiff(
    id: string,
  ): Promise<ReturnType<typeof serviceDiffFromRows>> {
    const q = serviceRowsQueries(V, id);
    const [service] = await rows(q.service);
    return serviceDiffFromRows({
      service,
      calendar: (await rows(q.calendar))[0] ?? null,
      exceptions: await rows(q.exceptions),
      days: await rows(q.days),
    });
  }

  it('puts a modified service back together from its rows', async () => {
    const wk = await serviceDiff('WK');
    expect(wk).toMatchObject({
      service_id: 'WK',
      status: 'modified',
      route_ids: { base: ['R1'], new: ['R1'] },
      trip_counts: { base: 3, new: 4 },
      calendar_field_changes: [
        { field: 'saturday', base_value: '1', new_value: '0' },
      ],
      exception_changes: {
        added: [{ date: '20261224', exception_type: '2' }],
        removed: [],
        modified: [],
      },
      dates_gained: [],
      dates_lost: ['20261224', '20261226'],
    });
    expect(wk.base).toEqual({
      calendar: Object.fromEntries(
        CALENDAR_FIELDS.map((f, i) => [f, cal('1111110')[i]]),
      ),
      exceptions: [],
      active_day_count: 312,
      first_date: '20260101',
      last_date: '20261231',
    });
    expect(wk.new?.exceptions).toEqual([
      { date: '20261224', exception_type: '2' },
    ]);
  });

  it('reads compact unchanged rows as the same in both feeds', async () => {
    const ete = await serviceDiff('Été');
    expect(ete.base?.calendar).toEqual(ete.new?.calendar);
    expect(ete.base?.exceptions).toEqual([
      { date: '20261225', exception_type: '2' },
    ]);
    expect(ete.calendar_field_changes).toEqual([]);
    expect(ete.exception_changes.added).toEqual([]);
  });

  it('lists no changes for an added or deleted service', async () => {
    const xmas = await serviceDiff('XMAS');
    expect(xmas.base).toBeNull();
    expect(xmas.new?.calendar).toBeNull();
    expect(xmas.exception_changes.added).toEqual([]);
    const old = await serviceDiff('OLD');
    expect(old.new).toBeNull();
    expect(old.calendar_field_changes).toEqual([]);
  });

  it('reads every service at once for the build', async () => {
    const q = serviceRowsQueries(V, null);
    expect(await rows(q.service)).toHaveLength(5);
    expect(await rows(q.days)).toHaveLength(2);
  });
});
