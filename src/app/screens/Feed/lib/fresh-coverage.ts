/**
 * Reads the latest dataset's service coverage into the dates, day count and
 * wording the "Fresh: rolling 7 days of coverage" criterion renders.
 *
 * The measurement is taken against today's UTC calendar day rather than the
 * dataset's download timestamp: the criterion is re-checked every day the
 * feed is fetched, so what a reader wants to know is how much coverage is
 * left *now*, not how much there was when the dataset landed.
 */

import { type components } from '../../../services/feeds/types';
import {
  getCriterionDisplayStatus,
  getDaysUntil,
} from '../../../constants/sealCriteria';
import { type DateRange, daysBetween } from '../../../utils/timeline';
import { formatDateShort, utcCalendarDayDiff } from '../../../utils/date';

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];
type ContinuousCoverageResponse =
  components['schemas']['GtfsFeedContinuousCoverageResponse'];
type GtfsDataset = components['schemas']['GtfsDataset'];

/** Days of service a dataset must still cover on the day it is fetched. */
export const FRESH_COVERAGE_MINIMUM_DAYS = 7;

/** Days producers get to extend coverage before the seal is revoked. */
export const FRESH_COVERAGE_GRACE_DAYS = 14;

/**
 * Headline for the state, mirroring the bold subtitle the other criteria get
 * from the shared criterion copy. Keys in the `feeds` namespace.
 */
const SUBTITLE_KEYS = {
  covered: 'sealFreshRollingCoveredSubtitle',
  short: 'sealFreshRollingShortSubtitle',
  noWindow: 'sealFreshRollingNoWindowSubtitle',
  notEvaluated: 'sealFreshRollingNotEvaluatedSubtitle',
  notApplicable: 'sealFreshRollingNotApplicableSubtitle',
} as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The UTC calendar day of `date`, as yyyy-MM-dd. */
export function toUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `isoDate` shifted by `days`, staying on the UTC calendar. */
export function addUtcDays(isoDate: string, days: number): string {
  return toUtcDay(
    new Date(Date.parse(`${isoDate}T00:00:00.000Z`) + days * MS_PER_DAY),
  );
}

export interface FreshCoverageWindow {
  /** The day the measurement is taken - today, UTC. yyyy-MM-dd. */
  fetchDate: string;
  /**
   * First service date the latest dataset covers, where it reports one. The
   * diagram opens on it, so the coverage bar shows the whole window rather
   * than only the part still ahead.
   */
  serviceStartDate?: string;
  /** Last service date the latest dataset covers. yyyy-MM-dd. */
  serviceEndDate: string;
  /** Whole days from `fetchDate` to `serviceEndDate`; negative once elapsed. */
  daysAhead: number;
  /** Earliest service end date that satisfies the criterion. yyyy-MM-dd. */
  minimumDate: string;
  meetsMinimum: boolean;
  /**
   * The dataset's own declared window - its start to its end - which the
   * criterion is judged against. Falls back to a point at the service end
   * when no start is reported, since there is nothing else to open it on.
   */
  bar: DateRange;
  /**
   * The stretch between where coverage ends and the date it would have to
   * reach to meet the minimum, drawn as its own band since the coverage bar
   * stops short of it rather than running through it.
   *
   * Only set while coverage falls short: once the bar itself reaches the
   * minimum date there is nothing uncovered left to band.
   */
  missingCoverageBand?: DateRange;
  /** Axis the diagram is drawn on, wide enough to hold every date above. */
  axis: DateRange;
}

export interface FreshCoverageSummary {
  /** Bold headline for the state. Key in the `feeds` namespace. */
  subtitleKey: string;
  /** The sentence below the subtitle. Key in the `feeds` namespace. */
  key: string;
  values: Record<string, string | number>;
  /**
   * Days left in the grace period, when one is running. Drives the deadline
   * notice; absent for every other state.
   */
  graceDaysLeft?: number;
  /** Absent when no coverage window is known, which hides the diagram. */
  window?: FreshCoverageWindow;
}

export interface LatestCoverageWindow {
  /** Absent when the source reports an end but no start. */
  start?: string;
  end: string;
}

/**
 * The service window of the feed's latest dataset, as yyyy-MM-dd bounds.
 *
 * `coverage_window` is what the criterion is actually measured on, so it is
 * preferred; `latest_state.newer` and the `is_latest` entry are the same
 * dataset, but only the former survives a request that paged past it. The dataset's
 * own service date range is the last resort, for when the coverage endpoint
 * failed and left the criterion with nothing else to draw. Both bounds are
 * taken from whichever source wins, never mixed between them.
 */
export function getLatestCoverageWindow(
  coverage: ContinuousCoverageResponse | undefined,
  latestDataset?: GtfsDataset,
): LatestCoverageWindow | undefined {
  const window =
    coverage?.latest_state?.newer.coverage_window ??
    coverage?.items?.find((item) => item.is_latest)?.coverage_window;
  if (window != undefined && window.end.length > 0) {
    return {
      end: window.end,
      ...(window.start.length > 0 && { start: window.start }),
    };
  }
  // Date-times whose zone offset is the agency's, not UTC - so the calendar
  // day is read off the string rather than converted, which would shift it.
  const datasetEnd = latestDataset?.service_date_range_end;
  if (datasetEnd == null || datasetEnd.length < 10) {
    return undefined;
  }
  const datasetStart = latestDataset?.service_date_range_start;
  return {
    end: datasetEnd.slice(0, 10),
    ...(datasetStart != null &&
      datasetStart.length >= 10 && { start: datasetStart.slice(0, 10) }),
  };
}

function earliest(dates: string[]): string {
  return dates.reduce((lowest, date) => (date < lowest ? date : lowest));
}

function latest(dates: string[]): string {
  return dates.reduce((highest, date) => (date > highest ? date : highest));
}

/**
 * The dates the diagram needs. The axis opens on the earliest of the service
 * start and today - service that began in the past still has to be drawn -
 * and closes past the later of the service end and the minimum marker, so
 * nothing the track carries sits flush against an edge.
 */
export function buildFreshCoverageWindow(
  serviceEndDate: string,
  now: Date,
  serviceStartDate?: string,
): FreshCoverageWindow {
  const fetchDate = toUtcDay(now);
  const minimumDate = addUtcDays(fetchDate, FRESH_COVERAGE_MINIMUM_DAYS);
  const daysAhead = utcCalendarDayDiff(
    new Date(`${serviceEndDate}T00:00:00.000Z`),
    now,
  );

  // A start after the end is not a window the diagram can open on, so it is
  // ignored rather than inverting the axis.
  const start =
    serviceStartDate != undefined && serviceStartDate <= serviceEndDate
      ? serviceStartDate
      : undefined;

  const axisStart = earliest(
    [fetchDate, serviceEndDate].concat(start != undefined ? [start] : []),
  );
  const axisEnd = latest([minimumDate, serviceEndDate]);
  const padding = Math.max(
    1,
    Math.ceil(daysBetween(axisStart, axisEnd) * 0.06),
  );
  // Service already delivered is left as bare track, so when the dataset's
  // own start is the leftmost date the axis opens exactly on it - the empty
  // stretch then begins where the label says it does. Without a start there
  // is nothing to anchor to, so the axis is padded off the edge as usual.
  const leftPadding = start != undefined && start === axisStart ? 0 : padding;

  const meetsMinimum = daysAhead >= FRESH_COVERAGE_MINIMUM_DAYS;

  // The dataset's own window, whatever it is - there is nothing to open on
  // without a reported start, so the bar collapses to a point at the end.
  const bar = { start: start ?? serviceEndDate, end: serviceEndDate };

  return {
    fetchDate,
    ...(start != undefined && { serviceStartDate: start }),
    serviceEndDate,
    daysAhead,
    minimumDate,
    meetsMinimum,
    bar,
    ...(!meetsMinimum && {
      missingCoverageBand: { start: serviceEndDate, end: minimumDate },
    }),
    axis: {
      start: addUtcDays(axisStart, -leftPadding),
      end: addUtcDays(axisEnd, padding),
    },
  };
}

/** One dated stop of the summary row above the diagram. */
export interface FreshCoverageStep {
  id: 'today' | 'required' | 'coverageEnd';
  /** Caption above the date. Key in the `feeds` namespace. */
  labelKey: string;
  /** yyyy-MM-dd. */
  date: string;
  /** Set on the stop that carries the criterion's verdict. */
  tone?: 'success' | 'warning' | 'error';
  /**
   * Shown on hover, for a stop whose date is not self-explanatory once
   * `today` is no longer on the row to explain it. Key in the `feeds`
   * namespace.
   */
  tooltipKey?: string;
}

/** The gap between two stops, and what it means. */
export interface FreshCoverageConnector {
  /** Key in the `feeds` namespace. */
  key: string;
  values: Record<string, number>;
  tone?: 'success' | 'warning' | 'error';
}

export interface FreshCoverageSteps {
  steps: FreshCoverageStep[];
  /** One fewer than `steps`: connector *i* sits between stop *i* and *i+1*. */
  connectors: FreshCoverageConnector[];
}

/**
 * The summary row above the diagram: today, the date coverage is required to
 * reach, and where it actually ends.
 *
 * The three stops keep a fixed order even when coverage ends before the
 * required date - the row is a fixed reading of the rule, not a timeline, and
 * the connector says which way the last step went.
 *
 * The verdict is carried by the spans rather than by a date: the required
 * week and the margin beyond it are what the criterion measures, while
 * "coverage ends" is only where the feed happens to stop.
 *
 * `compactTone`, when set, drops `today` from the row entirely: both a
 * confirmed failure and a feed serving its grace period already drop it from
 * the diagram too (see `buildFreshCoverageWindow`), and today having last
 * mattered days, months or years ago makes a poor first stop for a row that
 * otherwise reads left to right. The two remaining stops read "coverage
 * ends, short by this much, required by" instead, tinted `compactTone` -
 * `error` once the failure is confirmed, `warning` while still inside the
 * grace period - with a tooltip standing in for the "today" that named where
 * the required date came from.
 */
export function getFreshCoverageSteps(
  window: FreshCoverageWindow,
  compactTone?: 'warning' | 'error',
): FreshCoverageSteps {
  const minimumDays = FRESH_COVERAGE_MINIMUM_DAYS;
  const margin = window.daysAhead - minimumDays;
  const tone = window.meetsMinimum ? 'success' : 'error';

  if (compactTone != undefined) {
    return {
      steps: [
        {
          id: 'coverageEnd',
          labelKey: 'sealFreshRollingStepCoverageEnd',
          date: window.serviceEndDate,
        },
        {
          id: 'required',
          labelKey: 'sealFreshRollingStepRequired',
          date: window.minimumDate,
          tooltipKey: 'sealFreshRollingStepRequiredTooltip',
        },
      ],
      connectors: [
        {
          key: 'sealFreshRollingStepShort',
          values: { days: -margin },
          tone: compactTone,
        },
      ],
    };
  }

  return {
    steps: [
      {
        id: 'today',
        labelKey: 'sealFreshRollingStepToday',
        date: window.fetchDate,
      },
      {
        id: 'required',
        labelKey: 'sealFreshRollingStepRequired',
        date: window.minimumDate,
      },
      {
        id: 'coverageEnd',
        labelKey: 'sealFreshRollingStepCoverageEnd',
        date: window.serviceEndDate,
      },
    ],
    connectors: [
      {
        key: 'sealFreshRollingStepMinimum',
        values: { days: minimumDays },
        tone,
      },
      margin > 0
        ? {
            key: 'sealFreshRollingStepMargin',
            values: { days: margin },
            tone: 'success',
          }
        : margin === 0
          ? { key: 'sealFreshRollingStepNoMargin', values: {} }
          : {
              key: 'sealFreshRollingStepShort',
              values: { days: -margin },
              tone: 'error',
            },
    ],
  };
}

export function getFreshCoverageSummary(
  criterion: ReliabilityCriterion,
  serviceWindow: LatestCoverageWindow | undefined,
  now: Date = new Date(),
): FreshCoverageSummary {
  const displayStatus = getCriterionDisplayStatus(criterion);
  const minimumDays = FRESH_COVERAGE_MINIMUM_DAYS;
  const window =
    serviceWindow != undefined
      ? buildFreshCoverageWindow(serviceWindow.end, now, serviceWindow.start)
      : undefined;

  // Not applicable on this criterion only ever means the feed is seasonal,
  // which is withdrawn from the rolling check entirely.
  if (displayStatus === 'notApplicable') {
    return {
      subtitleKey: SUBTITLE_KEYS.notApplicable,
      key: 'sealFreshRollingNotApplicable',
      values: {},
    };
  }
  if (displayStatus === 'notEvaluated') {
    return {
      subtitleKey: SUBTITLE_KEYS.notEvaluated,
      key: 'sealFreshRollingNoData',
      values: {},
    };
  }

  // The criterion's verdict still stands without a coverage window - the
  // continuous-coverage call is what supplies it, and it can fail on its own.
  const graceDaysLeft =
    displayStatus === 'atRisk'
      ? criterion.grace_period_ends_at != null
        ? getDaysUntil(criterion.grace_period_ends_at, now)
        : 0
      : undefined;

  if (window == undefined) {
    return {
      subtitleKey: SUBTITLE_KEYS.noWindow,
      key: 'sealFreshRollingNoWindow',
      values: {},
      ...(graceDaysLeft != undefined && { graceDaysLeft }),
    };
  }

  const date = formatDateShort(window.serviceEndDate);

  // At risk and failing both mean coverage is short; what separates them is
  // how much of the 14-day window is left, which the countdown carries.
  if (displayStatus === 'atRisk') {
    return {
      subtitleKey: SUBTITLE_KEYS.short,
      key: 'sealFreshRollingAtRisk',
      values: { date, minimumDays },
      graceDaysLeft,
      window,
    };
  }
  if (displayStatus === 'fail') {
    return {
      subtitleKey: SUBTITLE_KEYS.short,
      key: 'sealFreshRollingFailing',
      values: { date, minimumDays },
      window,
    };
  }
  if (displayStatus === 'probation') {
    return {
      subtitleKey: SUBTITLE_KEYS.covered,
      ...(criterion.last_failure_at != null
        ? {
            key: 'sealFreshRollingProbation',
            values: {
              date,
              failureDate: formatDateShort(criterion.last_failure_at),
            },
          }
        : { key: 'sealFreshRollingProbationUndated', values: { date } }),
      window,
    };
  }

  // Passing, but the window can still read short: the API's verdict is
  // debounced and re-evaluated nightly, so a dataset that fell behind today
  // has not been marked at risk yet.
  if (!window.meetsMinimum) {
    return {
      subtitleKey: SUBTITLE_KEYS.short,
      key: 'sealFreshRollingPassingShort',
      values: { date, days: Math.max(0, window.daysAhead), minimumDays },
      window,
    };
  }
  // Coverage landing exactly on the minimum gets its own wording: "0 days
  // beyond the minimum" reads as a mistake.
  const beyond = window.daysAhead - minimumDays;
  return {
    subtitleKey: SUBTITLE_KEYS.covered,
    ...(beyond > 0
      ? {
          key: 'sealFreshRollingPassing',
          values: { date, days: window.daysAhead, beyond, minimumDays },
        }
      : {
          key: 'sealFreshRollingPassingExact',
          values: { date, days: window.daysAhead, minimumDays },
        }),
    window,
  };
}
