/**
 * Turns the raw availability history into the day grid, counts and summary
 * wording the Available criterion renders.
 *
 * Everything here is pure and UTC-based: the API timestamps are UTC, and
 * bucketing by the UTC calendar day keeps the grid identical whatever the
 * server's zone is.
 */

import { type components } from '../../../services/feeds/types';
import {
  getCriterionDisplayStatus,
  getDaysUntil,
} from '../../../constants/sealCriteria';
import { formatDateShort } from '../../../utils/date';

type AvailabilityCheck = components['schemas']['GtfsFeedAvailabilityCheck'];
type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];

/** Days producers get to restore access before Available costs the seal. */
export const AVAILABILITY_GRACE_DAYS = 14;

/** How far back the heatmap looks. Mirrors the fetch window. */
export const AVAILABILITY_HISTORY_MONTHS = 6;

/**
 * A day never checked is neither a success nor a failure - the nightly job
 * simply produced nothing for it - so it gets its own state rather than being
 * folded into either count.
 */
export type AvailabilityDayStatus = 'success' | 'failure' | 'unchecked';

export interface AvailabilityDay {
  /** yyyy-MM-dd, UTC. */
  date: string;
  status: AvailabilityDayStatus;
  /** How many checks ran that day. */
  checkCount: number;
}

export interface AvailabilityMonthLabel {
  /** Index into `weeks` of the column the label sits above. */
  columnIndex: number;
  /** First day of the month inside the window, as yyyy-MM-dd. */
  date: string;
}

export interface AvailabilityCalendar {
  /** Oldest day first. */
  days: AvailabilityDay[];
  /**
   * Columns oldest first, each 7 cells Sunday..Saturday. `null` pads the
   * partial first and last weeks so every column is the same height.
   */
  weeks: Array<Array<AvailabilityDay | null>>;
  monthLabels: AvailabilityMonthLabel[];
  successCount: number;
  failureCount: number;
  uncheckedCount: number;
  /** Share of *checked* days that succeeded, 0-100. Undefined when none were. */
  uptimePercent?: number;
  /** Most recent failed day in the window, as yyyy-MM-dd. */
  lastFailureDate?: string;
}

function toUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * One entry per calendar day in the window, ending on `now`'s UTC day. A day
 * counts as a failure as soon as one of its checks failed - a feed that came
 * back up later the same day still had an outage.
 */
export function buildAvailabilityCalendar(
  checks: AvailabilityCheck[] = [],
  {
    now = new Date(),
    months = AVAILABILITY_HISTORY_MONTHS,
  }: { now?: Date; months?: number } = {},
): AvailabilityCalendar {
  const end = new Date(`${toUtcDayKey(now)}T00:00:00Z`);
  // All-UTC arithmetic - date-fns works in local time, so a DST boundary
  // inside the window could shift the first column by a day.
  // The +1 makes the window exactly `months` long, inclusive of both ends.
  const start = new Date(
    Date.UTC(
      end.getUTCFullYear(),
      end.getUTCMonth() - months,
      end.getUTCDate() + 1,
    ),
  );

  const byDay = new Map<string, { failed: boolean; checkCount: number }>();
  for (const check of checks) {
    const checkedAt = new Date(check.checked_at);
    if (isNaN(checkedAt.getTime()) || checkedAt < start) {
      continue;
    }
    const key = toUtcDayKey(checkedAt);
    const entry = byDay.get(key) ?? { failed: false, checkCount: 0 };
    entry.checkCount += 1;
    entry.failed = entry.failed || !check.success;
    byDay.set(key, entry);
  }

  const days: AvailabilityDay[] = [];
  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor = new Date(cursor.getTime() + 86400000)
  ) {
    const date = toUtcDayKey(cursor);
    const entry = byDay.get(date);
    days.push({
      date,
      checkCount: entry?.checkCount ?? 0,
      status:
        entry == undefined ? 'unchecked' : entry.failed ? 'failure' : 'success',
    });
  }

  const successCount = days.filter((d) => d.status === 'success').length;
  const failureCount = days.filter((d) => d.status === 'failure').length;
  const uncheckedCount = days.length - successCount - failureCount;
  const checkedCount = successCount + failureCount;

  return {
    days,
    weeks: buildWeeks(days),
    monthLabels: buildMonthLabels(days),
    successCount,
    failureCount,
    uncheckedCount,
    uptimePercent:
      checkedCount === 0 ? undefined : (successCount / checkedCount) * 100,
    lastFailureDate: days.findLast((d) => d.status === 'failure')?.date,
  };
}

/** GitHub-contribution layout: one column per week, Sunday at the top. */
function buildWeeks(
  days: AvailabilityDay[],
): Array<Array<AvailabilityDay | null>> {
  if (days.length === 0) {
    return [];
  }
  const weeks: Array<Array<AvailabilityDay | null>> = [];
  const leadingBlanks = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  let week: Array<AvailabilityDay | null> = Array(leadingBlanks).fill(null);

  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    weeks.push([...week, ...Array(7 - week.length).fill(null)]);
  }
  return weeks;
}

/**
 * A label needs roughly this many columns to itself before the next one, or
 * the two month names run together.
 */
const MIN_LABEL_COLUMN_GAP = 3;

/** One label per month, over the column holding that month's first day. */
function buildMonthLabels(days: AvailabilityDay[]): AvailabilityMonthLabel[] {
  const labels: AvailabilityMonthLabel[] = [];
  let seenMonth: string | undefined;
  let columnIndex = 0;
  let slot =
    days.length > 0 ? new Date(`${days[0].date}T00:00:00Z`).getUTCDay() : 0;

  for (const day of days) {
    const month = day.date.slice(0, 7);
    if (month !== seenMonth) {
      seenMonth = month;
      labels.push({ columnIndex, date: day.date });
    }
    slot += 1;
    if (slot === 7) {
      slot = 0;
      columnIndex += 1;
    }
  }
  // The window rarely starts on the 1st, so its first month is usually a
  // sliver whose label would collide with the next one. Where two labels are
  // too close, the later - fuller - month is the one worth naming.
  const spaced: AvailabilityMonthLabel[] = [];
  for (const label of labels) {
    const previous = spaced[spaced.length - 1];
    if (
      previous != undefined &&
      label.columnIndex - previous.columnIndex < MIN_LABEL_COLUMN_GAP
    ) {
      spaced[spaced.length - 1] = label;
      continue;
    }
    spaced.push(label);
  }
  return spaced;
}

/**
 * Which sentence the Available body leads with, as a key in the `feeds`
 * namespace plus its interpolation values. Mirrors the criterion's display
 * status so grace period and probation read as themselves rather than as a
 * bare failure.
 */
export interface AvailabilitySummary {
  key: string;
  values: Record<string, string | number>;
  /**
   * Days left in the grace period, when one is running. Drives the deadline
   * notice; absent for every other state.
   */
  graceDaysLeft?: number;
}

export function getAvailabilitySummary(
  criterion: ReliabilityCriterion,
  calendar: AvailabilityCalendar,
  now: Date = new Date(),
  availabilityError = false,
): AvailabilitySummary {
  const displayStatus = getCriterionDisplayStatus(criterion);
  const graceDays = AVAILABILITY_GRACE_DAYS;

  if (displayStatus === 'notApplicable') {
    return { key: 'sealAvailabilityNotApplicable', values: {} };
  }
  // `last_failure_at` is what probation is being served for, and the API
  // keeps it even once the criterion passes again - but not always, so the
  // wording falls back to one that names no date.
  if (displayStatus === 'probation') {
    return criterion.last_failure_at != null
      ? {
          key: 'sealAvailabilityProbation',
          values: { date: formatDateShort(criterion.last_failure_at) },
        }
      : { key: 'sealAvailabilityProbationUndated', values: {} };
  }
  // The countdown itself lives in the deadline notice, so the sentence only
  // has to say since when.
  if (displayStatus === 'atRisk') {
    return {
      key: 'sealAvailabilityAtRisk',
      values: { date: formatFailureDate(criterion.first_failure_at) },
      graceDaysLeft:
        criterion.grace_period_ends_at != null
          ? getDaysUntil(criterion.grace_period_ends_at, now)
          : 0,
    };
  }
  if (displayStatus === 'fail') {
    return {
      key: 'sealAvailabilityFailing',
      values: {
        months: AVAILABILITY_HISTORY_MONTHS,
        date: formatFailureDate(criterion.first_failure_at),
      },
    };
  }
  if (
    displayStatus === 'notEvaluated' ||
    calendar.successCount + calendar.failureCount === 0
  ) {
    // An empty calendar means either "nothing recorded yet" or "the history
    // fetch just failed" - `availabilityError` tells them apart so the copy
    // doesn't claim a feed has no record when it simply couldn't be loaded.
    return availabilityError
      ? { key: 'sealAvailabilityError', values: {} }
      : { key: 'sealAvailabilityNoData', values: {} };
  }
  if (calendar.failureCount === 0) {
    return { key: 'sealAvailabilityNoFailures', values: {} };
  }
  return {
    key: 'sealAvailabilityRecovered',
    values: {
      count: calendar.failureCount,
      graceDays,
      date:
        calendar.lastFailureDate != undefined
          ? formatDateShort(calendar.lastFailureDate)
          : '',
    },
  };
}

/** `first_failure_at` is cleared once a feed recovers, so it can be absent. */
function formatFailureDate(date?: string | null): string {
  return date == null ? '' : formatDateShort(date);
}
