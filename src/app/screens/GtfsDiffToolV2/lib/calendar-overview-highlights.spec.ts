import type { CalendarRow, ServiceDiff } from './entity-diff-types';
import {
  DATE_HIGHLIGHTS,
  calendarOverviewHighlights,
  classifyRemovedServices,
  snapshotActiveDates,
  type CalendarHighlightInput,
} from './calendar-overview-highlights';

const weekdays: CalendarRow = {
  monday: '1',
  tuesday: '1',
  wednesday: '1',
  thursday: '1',
  friday: '1',
  saturday: '1',
  sunday: '0',
  start_date: '20260101',
  end_date: '20261231',
};

function service(over: Partial<ServiceDiff>): ServiceDiff {
  const snap = {
    calendar: weekdays,
    exceptions: [],
    active_day_count: 300,
    first_date: '20260101',
    last_date: '20261231',
  };
  return {
    service_id: 'S',
    status: 'modified',
    base: snap,
    new: snap,
    route_ids: { base: [], new: [] },
    trip_counts: { base: 10, new: 10 },
    calendar_field_changes: [],
    exception_changes: { added: [], removed: [], modified: [] },
    dates_gained: [],
    dates_lost: [],
    ...over,
  };
}

function input(over: Partial<CalendarHighlightInput>): CalendarHighlightInput {
  return {
    services: [],
    active_counts: {},
    coverage: {
      base: { start: '20260101', end: '20261231' },
      new: { start: '20260101', end: '20261231' },
    },
    ...over,
  };
}

describe('calendar overview highlights', () => {
  it('finds nothing in an unchanged calendar', () => {
    expect(
      calendarOverviewHighlights(
        input({
          services: [service({ status: 'unchanged' })],
          active_counts: { '20260105': [3, 3] },
        }),
      ),
    ).toEqual([]);
  });

  it('ranks dark days, removals, cuts and dropped weekdays', () => {
    const h = calendarOverviewHighlights(
      input({
        services: [
          service({
            service_id: 'GONE',
            status: 'deleted',
            new: null,
            trip_counts: { base: 12, new: 0 },
          }),
          service({
            service_id: 'CUT',
            dates_lost: ['20260301', '20260302', '20260303'],
            dates_gained: ['20260401'],
            new: {
              calendar: weekdays,
              exceptions: [],
              active_day_count: 298,
              first_date: null,
              last_date: null,
            },
          }),
          service({
            service_id: 'SAT',
            calendar_field_changes: [
              { field: 'saturday', base_value: '1', new_value: '0' },
            ],
          }),
        ],
        active_counts: {
          '20260105': [3, 0], // dark, inside the new coverage
          '20250105': [3, 0], // outside it: ignored
          '20260106': [3, 2],
        },
      }),
    );
    expect(h.map((x) => x.id)).toEqual([
      'no_service_days',
      'services_removed',
      'weekday_dropped',
      'fewer_days',
    ]);
    expect(h[0].entities).toEqual([
      {
        id: 'Mon 5 Jan 2026',
        label: '',
        note: '3 services → none',
        openId: '20260105',
      },
    ]);
    expect(h[1].entities?.[0]).toMatchObject({
      id: 'GONE',
      note: 'had 300 days · 12 trips',
    });
    expect(h[2].entities?.[0].note).toBe('no longer Sat');
    expect(h[3].entities?.[0].note).toBe('−2 days (300 → 298)');
  });

  it('groups exception changes by date, and opens dates as dates', () => {
    const h = calendarOverviewHighlights(
      input({
        services: [
          service({
            service_id: 'A',
            exception_changes: {
              added: [{ date: '20261225', exception_type: '2' }],
              removed: [],
              modified: [],
            },
          }),
          service({
            service_id: 'B',
            exception_changes: {
              added: [{ date: '20261225', exception_type: '2' }],
              removed: [{ date: '20260704', exception_type: '1' }],
              modified: [],
            },
          }),
        ],
      }),
    );
    const holidays = h.find((x) => x.id === 'no_service_dates_added');
    expect(holidays?.title).toBe('No-service exceptions added on 1 date');
    expect(holidays?.entities).toEqual([
      {
        id: 'Fri 25 Dec 2026',
        label: 'A, B',
        note: '2 services suspended',
        openId: '20261225',
      },
    ]);
    expect(
      h.find((x) => x.id === 'extra_dates_removed')?.entities?.[0].openId,
    ).toBe('20260704');
    expect([...DATE_HIGHLIGHTS].every((id) => typeof id === 'string')).toBe(
      true,
    );
  });

  it('flags a shorter horizon and unused services', () => {
    const h = calendarOverviewHighlights(
      input({
        services: [
          service({ service_id: 'IDLE', trip_counts: { base: 0, new: 0 } }),
        ],
        coverage: {
          base: { start: '20260101', end: '20261231' },
          new: { start: '20260101', end: '20261130' },
        },
      }),
    );
    expect(h.map((x) => x.id)).toEqual(['coverage_shorter', 'unused_services']);
    expect(h[0].title).toBe('The calendar ends 31 days earlier');
    expect(h[0].entities).toBeUndefined();
  });

  it('ignores a calendar ending under a week earlier', () => {
    const h = calendarOverviewHighlights(
      input({
        coverage: {
          base: { start: '20260101', end: '20261231' },
          new: { start: '20260101', end: '20261225' },
        },
      }),
    );
    expect(h).toEqual([]);
  });
});

const week: CalendarRow = {
  ...weekdays,
  start_date: '20260105', // Monday
  end_date: '20260111',
};

describe('removed services', () => {
  it('expands a weekly pattern with exceptions', () => {
    const dates = snapshotActiveDates({
      calendar: { ...week, saturday: '0' },
      exceptions: [
        { date: '20260107', exception_type: '2' },
        { date: '20260111', exception_type: '1' },
      ],
      active_day_count: 0,
      first_date: null,
      last_date: null,
    });
    expect([...dates].sort()).toEqual([
      '20260105',
      '20260106',
      '20260108',
      '20260109',
      '20260111',
    ]);
  });

  it('tells renamed and replaced services from removed ones', () => {
    const snap = (cal: CalendarRow) => ({
      calendar: cal,
      exceptions: [],
      active_day_count: 6,
      first_date: null,
      last_date: null,
    });
    const gone = (id: string, routes: string[], cal = week) =>
      service({
        service_id: id,
        status: 'deleted',
        base: snap(cal),
        new: null,
        route_ids: { base: routes, new: [] },
      });
    const added = (id: string, routes: string[], cal: CalendarRow) =>
      service({
        service_id: id,
        status: 'added',
        base: null,
        new: snap(cal),
        route_ids: { base: [], new: routes },
      });
    const services = [
      gone('OLD', ['R1']),
      added('NEW', ['R1'], week), // same dates, same route: renamed
      gone('SPLIT', ['R2']),
      added('WD', ['R2'], { ...week, saturday: '0' }),
      added('SAT', ['R2'], {
        ...weekdays,
        start_date: '20260110',
        end_date: '20260110',
        monday: '0',
        tuesday: '0',
        wednesday: '0',
        thursday: '0',
        friday: '0',
      }),
      gone('CUT', ['R3']), // nothing runs R3 any more
      // Only ran before the new calendar starts.
      gone('PAST', ['R3'], {
        ...week,
        start_date: '20251201',
        end_date: '20251207',
      }),
    ];
    expect(
      Object.fromEntries(
        classifyRemovedServices(services, {
          start: '20260101',
          end: '20261231',
        }),
      ),
    ).toEqual({
      OLD: { kind: 'renamed', to: 'NEW' },
      SPLIT: { kind: 'replaced' },
      CUT: { kind: 'removed' },
      PAST: { kind: 'ended' },
    });

    const h = calendarOverviewHighlights(input({ services }));
    const removed = h.find((x) => x.id === 'services_removed');
    expect(removed?.title).toBe('1 service removed');
    expect(removed?.entities?.map((e) => e.id)).toEqual(['CUT']);
    const renamed = h.find((x) => x.id === 'services_renamed');
    expect(renamed?.severity).toBe('warning');
    expect(renamed?.entities?.map((e) => [e.id, e.note])).toEqual([
      ['OLD', 'renamed to NEW'],
      ['SPLIT', 'covered by other services'],
    ]);
    expect(h.find((x) => x.id === 'services_ended')?.entities).toEqual([
      { id: 'PAST', label: 'Mon–Sat', note: 'last ran Sat 6 Dec 2025' },
    ]);
  });
});
