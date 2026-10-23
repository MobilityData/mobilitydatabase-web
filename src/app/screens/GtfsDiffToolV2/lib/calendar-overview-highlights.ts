/**
 * Notable highlights of the service calendar page: rider-facing calendar
 * regressions, from the full service and day lists. Run at build time
 * (scripts/lib/calendar-tables.mjs), since the page itself only queries those
 * lists from Parquet; the result is stored as calendar.overview_highlights.
 */

import type {
  GtfsDate,
  ServiceDiff,
  ServiceSnapshot,
} from './entity-diff-types';
import {
  type EntityRow,
  type Highlight,
  makeHighlight,
  plural,
  rankHighlights,
} from './highlights';
import { WEEKDAY_KEYS, formatGtfsDate, formatWeekdays } from './calendar-utils';

export type CalendarOverviewHighlight = Highlight<EntityRow[]>;

/** Highlights listing dates (they open the day), not services. */
export const DATE_HIGHLIGHTS: ReadonlySet<string> = new Set([
  'no_service_days',
  'no_service_dates_added',
  'extra_dates_removed',
]);

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A calendar ending fewer days earlier than this is not worth flagging. */
export const SHORTER_HORIZON_MIN_DAYS = 7;

// ── Active dates ───────────────────────────────────────────────────

function toUtc(d: GtfsDate): number {
  return Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
}

function fromUtc(t: number): GtfsDate {
  return new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
}

/** Dates a service runs on: its weekly pattern, then calendar_dates exceptions. */
export function snapshotActiveDates(s: ServiceSnapshot | null): Set<GtfsDate> {
  const dates = new Set<GtfsDate>();
  if (s == null) return dates;
  const cal = s.calendar;
  if (cal && /^\d{8}$/.test(cal.start_date) && /^\d{8}$/.test(cal.end_date)) {
    const flags = WEEKDAY_KEYS.map((k) => cal[k] === '1');
    if (flags.some(Boolean)) {
      for (
        let t = toUtc(cal.start_date);
        t <= toUtc(cal.end_date);
        t += 86400000
      ) {
        // getUTCDay: 0 = Sunday; WEEKDAY_KEYS start on Monday.
        if (flags[(new Date(t).getUTCDay() + 6) % 7]) dates.add(fromUtc(t));
      }
    }
  }
  for (const e of s.exceptions) {
    if (e.exception_type === '1') dates.add(e.date);
    else if (e.exception_type === '2') dates.delete(e.date);
  }
  return dates;
}

export type RemovedServiceFate =
  | { kind: 'renamed'; to: string }
  | { kind: 'replaced' }
  | { kind: 'ended' }
  | { kind: 'removed' };

/**
 * What became of each removed service, judged on what riders get within the
 * new calendar's dates (`window`; dates outside it are a horizon change):
 *   renamed   an added service runs on exactly the same dates, on all its routes
 *   ended     it never runs within the window
 *   replaced  each of its routes still has service on each of its dates
 *   removed   otherwise: some route loses service on some date
 */
export function classifyRemovedServices(
  services: ServiceDiff[],
  window: { start: GtfsDate | null; end: GtfsDate | null } = {
    start: null,
    end: null,
  },
): Map<string, RemovedServiceFate> {
  const removed = services.filter((s) => s.status === 'deleted');
  const current = services.filter(
    (s) => s.status !== 'deleted' && s.new != null,
  );
  const out = new Map<string, RemovedServiceFate>();
  if (removed.length === 0) return out;
  const inWindow = (d: GtfsDate): boolean =>
    (window.start == null || d >= window.start) &&
    (window.end == null || d <= window.end);

  // New-feed services by their exact date set, and every (route, date) served.
  const bySignature = new Map<string, ServiceDiff[]>();
  const served = new Set<string>();
  for (const s of current) {
    const dates = [...snapshotActiveDates(s.new)].sort();
    // Only a service_id new to the feed can be another one's new name.
    if (s.status === 'added') {
      const sig = dates.join(',');
      if (!bySignature.has(sig)) bySignature.set(sig, []);
      bySignature.get(sig)?.push(s);
    }
    for (const r of s.route_ids.new)
      for (const d of dates) served.add(`${r}|${d}`);
  }
  const taken = new Set<string>();
  for (const s of removed) {
    const dates = [...snapshotActiveDates(s.base)].sort();
    const kept = dates.filter(inWindow);
    const routes = s.route_ids.base;
    const twin = (bySignature.get(dates.join(',')) ?? []).find(
      (c) =>
        !taken.has(c.service_id) &&
        (routes.length === 0
          ? c.route_ids.new.length === 0
          : routes.every((r) => c.route_ids.new.includes(r))),
    );
    if (twin && dates.length > 0) {
      taken.add(twin.service_id);
      out.set(s.service_id, { kind: 'renamed', to: twin.service_id });
    } else if (kept.length === 0) {
      out.set(s.service_id, { kind: 'ended' });
    } else if (
      routes.length > 0 &&
      routes.every((r) => kept.every((d) => served.has(`${r}|${d}`)))
    ) {
      out.set(s.service_id, { kind: 'replaced' });
    } else {
      out.set(s.service_id, { kind: 'removed' });
    }
  }
  return out;
}

export interface CalendarHighlightInput {
  services: ServiceDiff[];
  /** [base, new] active services per date, over both feeds' coverage. */
  active_counts: Record<GtfsDate, [number, number]>;
  coverage: {
    base: { start: GtfsDate | null; end: GtfsDate | null };
    new: { start: GtfsDate | null; end: GtfsDate | null };
  };
}

function daysBetween(a: GtfsDate, b: GtfsDate): number {
  const d = (s: string): number =>
    Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
  return Math.round((d(b) - d(a)) / 86400000);
}

function serviceRow(s: ServiceDiff, note: string): EntityRow {
  return {
    id: s.service_id,
    label: formatWeekdays((s.new ?? s.base)?.calendar),
    note,
  };
}

/** Dates → services that changed on them, for exception highlights. */
function byDate(
  services: ServiceDiff[],
  pick: (s: ServiceDiff) => GtfsDate[],
): Array<{ date: GtfsDate; services: string[] }> {
  const map = new Map<GtfsDate, string[]>();
  for (const s of services) {
    for (const d of pick(s)) {
      if (!map.has(d)) map.set(d, []);
      map.get(d)?.push(s.service_id);
    }
  }
  return [...map.entries()]
    .map(([date, ids]) => ({ date, services: ids.sort() }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function servicesText(ids: string[]): string {
  return ids.length <= 2
    ? ids.join(', ')
    : `${ids.slice(0, 2).join(', ')} +${ids.length - 2}`;
}

export function calendarOverviewHighlights(
  cal: CalendarHighlightInput,
): CalendarOverviewHighlight[] {
  const out: CalendarOverviewHighlight[] = [];
  const modified = cal.services.filter((s) => s.status === 'modified');

  // Days inside the new feed's coverage that lose every service.
  const { start, end } = cal.coverage.new;
  const dark = Object.entries(cal.active_counts)
    .filter(
      ([d, [b, n]]) =>
        b > 0 &&
        n === 0 &&
        start != null &&
        end != null &&
        d >= start &&
        d <= end,
    )
    .sort(([a], [b]) => a.localeCompare(b));
  if (dark.length > 0) {
    out.push(
      makeHighlight(
        'no_service_days',
        0.95,
        `${plural(dark.length, 'day')} lose all service`,
        'Service ran on these dates in the original feed; no service runs in the new one.',
        dark.map(([d, [b]]) => ({
          id: formatGtfsDate(d),
          label: '',
          note: `${plural(b, 'service')} → none`,
          openId: d,
        })),
      ),
    );
  }

  // Removed services, unless renamed, replaced or past for the riders they
  // served.
  const fate = classifyRemovedServices(cal.services, cal.coverage.new);
  const deleted = cal.services.filter((s) => s.status === 'deleted');
  const withFate = (...kinds: Array<RemovedServiceFate['kind']>) =>
    deleted.filter((s) =>
      kinds.includes(fate.get(s.service_id)?.kind ?? 'removed'),
    );
  const removed = withFate('removed');
  if (removed.length > 0) {
    out.push(
      makeHighlight(
        'services_removed',
        0.9,
        `${plural(removed.length, 'service')} removed`,
        'In the original calendar only, and some of their routes lose service on their dates.',
        removed.map((s) =>
          serviceRow(
            s,
            `had ${plural(s.base?.active_day_count ?? 0, 'day')} · ${plural(s.trip_counts.base, 'trip')}`,
          ),
        ),
      ),
    );
  }
  const renamed = withFate('renamed', 'replaced');
  if (renamed.length > 0) {
    out.push(
      makeHighlight(
        'services_renamed',
        0.15,
        `${plural(renamed.length, 'service')} renamed or replaced`,
        'Gone from the new calendar under their service_id, but their routes keep service on the same dates.',
        renamed.map((s) => {
          const f = fate.get(s.service_id);
          return serviceRow(
            s,
            f?.kind === 'renamed'
              ? `renamed to ${f.to}`
              : 'covered by other services',
          );
        }),
      ),
    );
  }
  const ended = withFate('ended');
  if (ended.length > 0) {
    out.push(
      makeHighlight(
        'services_ended',
        0.1,
        `${plural(ended.length, 'service')} ended before the new calendar`,
        'They only ran on dates the new calendar does not cover.',
        ended.map((s) => {
          const last =
            s.base?.last_date ?? [...snapshotActiveDates(s.base)].sort().at(-1);
          return serviceRow(
            s,
            last ? `last ran ${formatGtfsDate(last)}` : 'no dates',
          );
        }),
      ),
    );
  }

  // Services that run on fewer days overall (net of days gained).
  const fewer = modified
    .map((s) => ({ s, net: s.dates_lost.length - s.dates_gained.length }))
    .filter((x) => x.net > 0)
    .sort((a, b) => b.net - a.net);
  if (fewer.length > 0) {
    out.push(
      makeHighlight(
        'fewer_days',
        0.5 + 0.4 * Math.min(1, fewer[0].net / 60),
        `${plural(fewer.length, 'service')} run on fewer days`,
        `Up to ${plural(fewer[0].net, 'day')} fewer for one service.`,
        fewer.map(({ s, net }) =>
          serviceRow(
            s,
            `−${plural(net, 'day')} (${s.base?.active_day_count ?? 0} → ${s.new?.active_day_count ?? 0})`,
          ),
        ),
      ),
    );
  }

  // A weekday dropped from the regular pattern.
  const dropped = modified
    .map((s) => ({
      s,
      days: WEEKDAY_KEYS.map((k, i) => {
        const c = s.calendar_field_changes.find((x) => x.field === k);
        return c && c.base_value === '1' && c.new_value !== '1'
          ? WEEKDAY_SHORT[i]
          : null;
      }).filter((d): d is string => d != null),
    }))
    .filter((x) => x.days.length > 0);
  if (dropped.length > 0) {
    out.push(
      makeHighlight(
        'weekday_dropped',
        0.65,
        `${plural(dropped.length, 'service')} no longer run on some weekdays`,
        'A weekday changed from 1 to 0 in calendar.txt.',
        dropped.map(({ s, days }) =>
          serviceRow(s, `no longer ${days.join(', ')}`),
        ),
      ),
    );
  }

  // No-service exceptions (type 2) added on services that still exist.
  const holidays = byDate(modified, (s) =>
    s.exception_changes.added
      .filter((e) => e.exception_type === '2')
      .map((e) => e.date),
  );
  if (holidays.length > 0) {
    out.push(
      makeHighlight(
        'no_service_dates_added',
        0.55 + 0.2 * Math.min(1, holidays.length / 20),
        `No-service exceptions added on ${plural(holidays.length, 'date')}`,
        'calendar_dates.txt rows with exception_type 2 added.',
        holidays.map(({ date, services }) => ({
          id: formatGtfsDate(date),
          label: servicesText(services),
          note: `${plural(services.length, 'service')} suspended`,
          openId: date,
        })),
      ),
    );
  }

  // Extra-service exceptions (type 1) removed.
  const extra = byDate(modified, (s) =>
    s.exception_changes.removed
      .filter((e) => e.exception_type === '1')
      .map((e) => e.date),
  );
  if (extra.length > 0) {
    out.push(
      makeHighlight(
        'extra_dates_removed',
        0.5,
        `Extra service removed on ${plural(extra.length, 'date')}`,
        'calendar_dates.txt rows with exception_type 1 removed.',
        extra.map(({ date, services }) => ({
          id: formatGtfsDate(date),
          label: servicesText(services),
          note: `${plural(services.length, 'service')} no longer added`,
          openId: date,
        })),
      ),
    );
  }

  // The new calendar stops earlier than the original one.
  const be = cal.coverage.base.end;
  const ne = cal.coverage.new.end;
  const shorterBy =
    be && ne && ne < be && start != null && start <= be
      ? daysBetween(ne, be)
      : 0;
  if (be && ne && shorterBy >= SHORTER_HORIZON_MIN_DAYS) {
    const days = shorterBy;
    out.push(
      makeHighlight(
        'coverage_shorter',
        0.6,
        `The calendar ends ${plural(days, 'day')} earlier`,
        `Service is published until ${formatGtfsDate(ne)}, instead of ${formatGtfsDate(be)}.`,
      ),
    );
  }

  // Services no trip uses: usually leftovers.
  const unused = cal.services.filter(
    (s) => s.status !== 'deleted' && s.new != null && s.trip_counts.new === 0,
  );
  if (unused.length > 0) {
    out.push(
      makeHighlight(
        'unused_services',
        0.25,
        `${plural(unused.length, 'service')} no trip uses`,
        'In the new calendar, but no trip in trips.txt refers to them.',
        unused.map((s) =>
          serviceRow(s, `${plural(s.new?.active_day_count ?? 0, 'day')}`),
        ),
      ),
    );
  }

  return rankHighlights(out);
}
