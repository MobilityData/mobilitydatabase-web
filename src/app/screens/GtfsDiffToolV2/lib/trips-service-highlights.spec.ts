import {
  type ComparedDay,
  type RouteService,
  durationText,
  hourText,
  serviceHighlights,
} from './trips-service-highlights';

const H = 3600;

/** Trips per hour from { hour: trips }. */
function hours(counts: Record<number, number>): number[] {
  const out = new Array<number>(30).fill(0);
  for (const [h, n] of Object.entries(counts)) out[Number(h)] = n;
  return out;
}

function route(
  id: string,
  base: Record<number, number>,
  next: Record<number, number>,
  span?: { base: [number, number]; new: [number, number] },
): RouteService {
  const total = (c: Record<number, number>): number =>
    Object.values(c).reduce((s, n) => s + n, 0);
  return {
    route: id,
    label: id,
    trips: { base: total(base), new: total(next) },
    added: 0,
    removed: 0,
    span: span ?? { base: [6 * H, 22 * H], new: [6 * H, 22 * H] },
    profile: { base: hours(base), new: hours(next) },
  };
}

function day(
  when: string,
  routes: RouteService[],
  opts: Partial<ComparedDay> = {},
): ComparedDay {
  return { s: 0, when, typical: true, routes, unserved: [], ...opts };
}

const STEADY = { 7: 4, 8: 4, 9: 4, 17: 4 };

describe('serviceHighlights', () => {
  it('flags nothing when the service is the same', () => {
    const doc = {
      schema: 1 as const,
      days: [day('weekdays', [route('10', STEADY, STEADY)])],
    };
    expect(serviceHighlights(doc)).toEqual([]);
  });

  it('calls out the day with the most trips added, as info', () => {
    const doc = {
      schema: 1 as const,
      days: [
        day('weekdays', [route('10', STEADY, STEADY)]),
        day('Sat 15 Aug', [route('10', STEADY, { ...STEADY, 21: 6, 22: 6 })], {
          typical: false,
        }),
      ],
    };
    const [h] = serviceHighlights(doc);
    expect(h).toMatchObject({
      id: 'service_added',
      severity: 'info',
      title: '12 more trips on Sat 15 Aug',
    });
    expect(h.entities).toMatchObject({
      kind: 'hours',
      rows: [{ route: '10' }],
    });
  });

  it('flags a route whose service ends earlier on a typical day', () => {
    const doc = {
      schema: 1 as const,
      days: [
        day('weekdays', [
          route('5', STEADY, STEADY, {
            base: [6 * H, 24 * H],
            new: [6 * H, 23 * H + 20 * 60],
          }),
        ]),
      ],
    };
    expect(serviceHighlights(doc).map((h) => h.title)).toEqual([
      'Route 5: last trip 40 min earlier on weekdays',
    ]);
  });

  it('flags fewer trips in an hour the route still runs', () => {
    const doc = {
      schema: 1 as const,
      days: [day('weekdays', [route('7', STEADY, { ...STEADY, 8: 2 })])],
    };
    const [h] = serviceHighlights(doc);
    expect(h.title).toBe('Route 7: 4 → 2 trips an hour at 8 am on weekdays');
    expect(h.entities).toMatchObject({ kind: 'hours', rows: [{ hour: 8 }] });
  });

  it('ignores a dropped hour (a span change) and small dips', () => {
    const doc = {
      schema: 1 as const,
      days: [
        day('weekdays', [
          route('7', STEADY, { ...STEADY, 17: 0 }),
          route('8', STEADY, { ...STEADY, 8: 3 }),
        ]),
      ],
    };
    expect(
      serviceHighlights(doc).filter((h) => h.id === 'less_frequent'),
    ).toEqual([]);
  });

  it('lists stops left without service, except excluded ones', () => {
    const doc = {
      schema: 1 as const,
      days: [
        day('weekdays', [], {
          unserved: [
            { id: 'S1', label: 'Pine Ave' },
            { id: 'S2', label: 'Elm St' },
          ],
        }),
        day('Sundays', [], { unserved: [{ id: 'S1', label: 'Pine Ave' }] }),
      ],
    };
    const [h] = serviceHighlights(doc, { exclude: new Set(['S2']) });
    expect(h).toMatchObject({
      id: 'stops_unserved',
      title: '1 stop no longer served',
      entities: {
        kind: 'stops',
        rows: [{ id: 'S1', label: 'Pine Ave', note: 'no trips' }],
      },
    });
  });
});

describe('formatting', () => {
  it('reads durations and hours', () => {
    expect(durationText(40 * 60)).toBe('40 min');
    expect(durationText(5 * H + 3 * 60)).toBe('5 h 03');
    expect(hourText(8)).toBe('8 am');
    expect(hourText(13)).toBe('1 pm');
    expect(hourText(24)).toBe('midnight');
    expect(hourText(25)).toBe('1 am');
  });
});
