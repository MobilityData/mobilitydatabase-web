/**
 * A service put back together from the calendar analysis tables
 * (analysis/services.parquet, analysis/service_dates.parquet) and the calendar raw
 * tables (raw/calendar.parquet, raw/calendar_dates.parquet: every row of
 * either feed, unchanged ones compact: base values NULL where equal to the
 * new ones). The analysis stores results only, the raw tables the rows.
 *
 * The SQL (lib/calendar-query) names raw columns with these prefixes:
 *   calendar.txt        cal_action, b_<field> / n_<field> (CALENDAR_FIELDS)
 *   calendar_dates.txt  exc_action, b_exception_type / n_exception_type
 *
 * Shared by the app (DuckDB-WASM) and the build scripts (DuckDB in Node).
 * Pure; type-only imports besides calendar-utils.
 */

import { WEEKDAY_KEYS, weekdayIndex } from './calendar-utils';
import type {
  CalendarRow,
  DayException,
  DayReasonCode,
  DiffType,
  ExceptionType,
  FieldChange,
  GtfsDate,
  ServiceDiff,
  ServiceSnapshot,
} from './entity-diff-types';

export const CALENDAR_FIELDS = [
  ...WEEKDAY_KEYS,
  'start_date',
  'end_date',
] as const;

type Row = Record<string, unknown>;

const text = (v: unknown): string =>
  typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'bigint'
      ? v.toString()
      : '';

const textOrNull = (v: unknown): string | null => (v == null ? null : text(v));

/** A raw table action ('' when the service has no row in the file). */
function actionOf(v: unknown): string {
  return text(v);
}

/** A list column read as JSON text (to_json), else []. */
export function jsonList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(text);
  if (typeof v !== 'string' || v === '') return [];
  const parsed: unknown = JSON.parse(v);
  return Array.isArray(parsed) ? parsed.map(text) : [];
}

// ── Raw rows ───────────────────────────────────────────────────────

/** A service's calendar.txt row in each feed (null where it has none). */
export interface CalendarSides {
  base: CalendarRow | null;
  new: CalendarRow | null;
}

/** The calendar.txt rows of a row selecting cal_action and b_/n_ fields. */
export function calendarSides(r: Row | null | undefined): CalendarSides {
  const action = actionOf(r?.cal_action);
  if (r == null || action === '') return { base: null, new: null };
  const side = (prefix: 'b' | 'n'): CalendarRow | null => {
    if (prefix === 'b' && action === 'added') return null;
    if (prefix === 'n' && action === 'deleted') return null;
    const row: Record<string, string> = {};
    for (const f of CALENDAR_FIELDS)
      row[f] = text(
        prefix === 'b' && action === 'unchanged'
          ? (r[`b_${f}`] ?? r[`n_${f}`])
          : r[`${prefix}_${f}`],
      );
    return row as unknown as CalendarRow;
  };
  return { base: side('b'), new: side('n') };
}

/** A calendar_dates.txt row: its date and exception type in each feed. */
export interface ExceptionSides extends DayException {
  date: GtfsDate;
}

/** The exception of a row selecting date, exc_action and b_/n_exception_type. */
export function exceptionSides(r: Row): ExceptionSides {
  const action = actionOf(r.exc_action);
  const b = textOrNull(r.b_exception_type);
  const n = textOrNull(r.n_exception_type);
  return {
    date: text(r.date),
    base: (action === 'added'
      ? null
      : action === 'unchanged'
        ? (b ?? n)
        : b) as ExceptionType | null,
    new: (action === 'deleted' || action === ''
      ? null
      : n) as ExceptionType | null,
  };
}

// ── Day reasons ────────────────────────────────────────────────────

/**
 * Why a kept service's date changed, in words (the build's
 * explainDateChange, from the reason code and the service's rows).
 */
export function reasonDetail(
  code: DayReasonCode | '',
  date: GtfsDate,
  cal: CalendarSides,
  exc: DayException | null,
): string {
  const b = cal.base;
  const n = cal.new;
  switch (code) {
    case 'exception_added':
      return `exception_type ${exc?.new ?? ''} added`;
    case 'exception_removed':
      return `exception_type ${exc?.base ?? ''} removed`;
    case 'exception_type_changed':
      return `exception_type ${exc?.base ?? ''} → ${exc?.new ?? ''}`;
    case 'calendar_added':
      return 'calendar.txt row added';
    case 'calendar_removed':
      return 'calendar.txt row removed';
    case 'period_extended':
    case 'period_shortened':
      return `period ${b?.start_date ?? ''}–${b?.end_date ?? ''} → ${n?.start_date ?? ''}–${n?.end_date ?? ''}`;
    case 'weekday_added':
    case 'weekday_removed': {
      const wd = WEEKDAY_KEYS[weekdayIndex(date)];
      return `${wd} ${b?.[wd] ?? ''} → ${n?.[wd] ?? ''}`;
    }
    default:
      return '';
  }
}

// ── Services ───────────────────────────────────────────────────────

/** What a services.parquet row says of one feed (null: not in that feed). */
export interface ServiceSide {
  activeDays: number;
  first: GtfsDate | null;
  last: GtfsDate | null;
}

export function serviceSide(r: Row, side: 'base' | 'new'): ServiceSide | null {
  const status = text(r.status);
  if (side === 'base' && status === 'added') return null;
  if (side === 'new' && status === 'deleted') return null;
  return {
    activeDays: Number(r[`active_days_${side}`] ?? 0),
    first: textOrNull(r[`first_date_${side}`]),
    last: textOrNull(r[`last_date_${side}`]),
  };
}

/** A minimal snapshot for the pattern texts (lib/calendar-utils). */
export function patternSnapshot(
  cal: CalendarRow | null,
  side: ServiceSide | null,
): ServiceSnapshot | null {
  if (side == null) return null;
  return {
    calendar: cal,
    exceptions: [],
    active_day_count: side.activeDays,
    first_date: side.first,
    last_date: side.last,
  };
}

/** One service's rows, as the calendar queries read them. */
export interface ServiceRows {
  /** Its services.parquet row (route lists as to_json text or arrays). */
  service: Row;
  /** Its raw calendar.txt row (cal_action, b_/n_ fields), if any. */
  calendar: Row | null;
  /** Its raw calendar_dates.txt rows (date, exc_action, b_/n_exception_type). */
  exceptions: Row[];
  /** Its days.parquet rows (date, change). */
  days: Row[];
}

/** A service's full record (ServiceDiff) from its rows. */
export function serviceDiffFromRows(rows: ServiceRows): ServiceDiff {
  const s = rows.service;
  const status = text(s.status) as DiffType;
  const cal = calendarSides(rows.calendar);
  const exceptions = rows.exceptions
    .map(exceptionSides)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const snapshot = (side: 'base' | 'new'): ServiceSnapshot | null => {
    const info = serviceSide(s, side);
    if (info == null) return null;
    return {
      calendar: cal[side],
      exceptions: exceptions.flatMap((e) =>
        e[side] == null ? [] : [{ date: e.date, exception_type: e[side] }],
      ),
      active_day_count: info.activeDays,
      first_date: info.first,
      last_date: info.last,
    };
  };
  const base = snapshot('base');
  const next = snapshot('new');

  // Changes are only listed for a service in both feeds.
  let fieldChanges: FieldChange[] = [];
  const exceptionChanges: ServiceDiff['exception_changes'] = {
    added: [],
    removed: [],
    modified: [],
  };
  if (base && next) {
    const b = cal.base;
    const n = cal.new;
    if (b || n)
      fieldChanges = CALENDAR_FIELDS.flatMap((field) => {
        const bv = b?.[field] ?? '';
        const nv = n?.[field] ?? '';
        return b && n && bv === nv
          ? []
          : [{ field, base_value: bv, new_value: nv }];
      });
    for (const e of exceptions) {
      if (e.base == null && e.new != null)
        exceptionChanges.added.push({ date: e.date, exception_type: e.new });
      else if (e.new == null && e.base != null)
        exceptionChanges.removed.push({ date: e.date, exception_type: e.base });
      else if (e.base != null && e.new != null && e.base !== e.new)
        exceptionChanges.modified.push({
          date: e.date,
          base_exception_type: e.base,
          new_exception_type: e.new,
        });
    }
  }
  const datesOf = (change: string): GtfsDate[] =>
    rows.days
      .filter((d) => text(d.change) === change)
      .map((d) => text(d.date))
      .sort();

  return {
    service_id: text(s.service_id),
    status,
    base,
    new: next,
    route_ids: {
      base: jsonList(s.route_ids_base),
      new: jsonList(s.route_ids_new),
    },
    trip_counts: {
      base: Number(s.trips_base ?? 0),
      new: Number(s.trips_new ?? 0),
    },
    calendar_field_changes: fieldChanges,
    exception_changes: exceptionChanges,
    dates_gained: datesOf('gained'),
    dates_lost: datesOf('lost'),
  };
}
