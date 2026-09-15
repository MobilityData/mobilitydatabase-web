/**
 * Reads the continuous-coverage endpoint into the bars, chips and wording the
 * "Fresh: continuous coverage" criterion renders.
 *
 * The criterion asks two things of successive datasets (see the "How it is
 * calculated" page): that their service windows meet or overlap, leaving no
 * uncovered day between versions, and that a single window never spans more
 * than two years. The API has already decided both - `gap_days` /
 * `overlap_days` for the first, `within_max_coverage_window` for the second -
 * so everything here is presentation of that verdict, never a re-derivation
 * of it.
 */

import { type components } from '../../../services/feeds/types';
import { getFeedFilesBaseUrl } from '../../../utils/config';
import {
  getCriterionDisplayStatus,
  getDaysUntil,
} from '../../../constants/sealCriteria';
import {
  type DateRange,
  type TrackPlacement,
  daysBetween,
  placeRangeOnAxis,
} from '../../../utils/timeline';
import { formatDateShort } from '../../../utils/date';
import { addUtcDays } from './fresh-coverage';

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];
type ContinuousCoverage = components['schemas']['GtfsFeedContinuousCoverage'];
type ContinuousCoverageBoundary =
  components['schemas']['GtfsFeedContinuousCoverageBoundary'];
type ContinuousCoverageResponse =
  components['schemas']['GtfsFeedContinuousCoverageResponse'];
type ServiceDateWindow = components['schemas']['ServiceDateWindow'];

/** Longest service window a single dataset may declare. */
export const CONTINUOUS_MAX_COVERAGE_YEARS = 2;

/** Days in a year, averaged over the leap cycle, for the window-length chip. */
const DAYS_PER_YEAR = 365.25;
const DAYS_PER_MONTH = DAYS_PER_YEAR / 12;

/**
 * Headline for the state, mirroring the bold subtitle the other criteria get
 * from the shared criterion copy. Keys in the `feeds` namespace.
 */
const SUBTITLE_KEYS = {
  continuous: 'sealContinuousContinuousSubtitle',
  gap: 'sealContinuousGapSubtitle',
  window: 'sealContinuousWindowSubtitle',
  noHistory: 'sealContinuousNoHistorySubtitle',
  notEvaluated: 'sealContinuousNotEvaluatedSubtitle',
  notApplicable: 'sealContinuousNotApplicableSubtitle',
} as const;

/** Which of the two rules an entry broke, when it broke one. */
export type CoverageViolation = 'gap' | 'window';

/** Which input a bar is drawn from. Ordered as the rows are stacked. */
export type CoverageTrackSource = 'feedInfo' | 'calendar';

export interface CoverageTrack {
  source: CoverageTrackSource;
  window: ServiceDateWindow;
  placement: TrackPlacement;
  /**
   * Whether this is the window the criterion was measured on, and so the one
   * a join band belongs over.
   *
   * False on a bar whose dates disagree with the coverage window - a
   * `feed_info.txt` that differs from the calendar files, or the other way
   * round. The join was measured on the other window, so banding its days
   * onto this bar would claim an overlap these dates do not have.
   */
  isMeasured: boolean;
}

/**
 * How a dataset joins the one published immediately before it: the two
 * windows share days, leave days uncovered between them, or meet exactly -
 * the last of which is healthy, and so is not a zero-day overlap in disguise.
 */
export type CoverageJoinKind = 'overlap' | 'gap' | 'meets';

export interface CoverageJoinSpan {
  /** The shared days of an overlap, or the uncovered days of a gap. */
  range: DateRange;
  /** That span on the comparison's shared axis, so it can be drawn. */
  placement: TrackPlacement;
}

export interface CoverageJoin {
  kind: CoverageJoinKind;
  /** Days of overlap or of uncovered service; zero when the windows meet. */
  days: number;
  /**
   * Absent when the boundary reports no older dataset, or it supplied no
   * window of its own: the join is then stated in words, with no span to draw
   * it over.
   */
  span?: CoverageJoinSpan;
}

export interface CoverageRow {
  datasetId: string;
  downloadedAt?: string;
  /**
   * The declared and derived windows as bars on the comparison's shared axis.
   * Empty when the dataset supplied neither file.
   */
  tracks: CoverageTrack[];
  /** The window the calculation used, which the row's caption states. */
  coverageWindow?: ServiceDateWindow;
  feedInfoMatches?: boolean | null;
  withinMaxCoverageWindow?: boolean | null;
  /** Absent when the comparison was not built with a feed ID to link from. */
  downloadUrl?: string;
  /** Whether this is the feed's latest dataset, which the row is badged with. */
  isLatest: boolean;
  /**
   * How this dataset joins the one published before it, which is the row
   * drawn below it. Undefined on the oldest row of the comparison, which has
   * nothing beneath it to join to.
   */
  join?: CoverageJoin;
}

export interface CoverageComparison {
  /** Newest first, so the dataset being judged reads at the top. */
  rows: CoverageRow[];
  /** Shared axis every bar in `rows` is placed on. */
  axis: DateRange;
  /** The files the calculation reads, from the newer of the two datasets. */
  files: components['schemas']['GtfsFeedContinuousCoverageFile'][];
}

export interface CoverageWindowLength {
  /** Key in the `feeds` namespace. */
  key: string;
  values: Record<string, number>;
}

export interface ContinuousCoverageSummary {
  /** Bold headline for the state. Key in the `feeds` namespace. */
  subtitleKey: string;
  /** The sentence below the subtitle. Key in the `feeds` namespace. */
  key: string;
  values: Record<string, string | number>;
  /**
   * Days left in the grace period. The criterion is documented as having
   * none, so this is only ever set if the API reports one anyway.
   */
  graceDaysLeft?: number;
}

function isWindow(
  window: ServiceDateWindow | undefined,
): window is ServiceDateWindow {
  return (
    window != undefined &&
    window.start.length > 0 &&
    window.end.length > 0 &&
    daysBetween(window.start, window.end) >= 0
  );
}

/** Whether two windows cover exactly the same days. */
function isSameWindow(
  a: ServiceDateWindow | undefined,
  b: ServiceDateWindow | undefined,
): boolean {
  return (
    a != undefined && b != undefined && a.start === b.start && a.end === b.end
  );
}

/**
 * Length of a window as the largest unit that still reads precisely: years
 * for anything past one, then months, then days. `days` is what the API
 * reports; it is derived from the bounds only when absent.
 */
export function getCoverageWindowLength(
  window: ServiceDateWindow | undefined,
): CoverageWindowLength | undefined {
  if (!isWindow(window)) {
    return undefined;
  }
  // Both bounds are inclusive, so a single-day window is 1 day, not 0.
  const days = window.days ?? daysBetween(window.start, window.end) + 1;
  if (days >= DAYS_PER_YEAR) {
    return {
      key: 'sealContinuousWindowChipYears',
      values: { years: Math.round((days / DAYS_PER_YEAR) * 10) / 10 },
    };
  }
  if (days >= DAYS_PER_MONTH) {
    return {
      key: 'sealContinuousWindowChipMonths',
      values: { months: Math.round((days / DAYS_PER_MONTH) * 10) / 10 },
    };
  }
  return { key: 'sealContinuousWindowChipDays', values: { days } };
}

/**
 * What the window-length figure means, for the tooltip behind it: the figure
 * is a length with no rule attached, and the rule - two years in a single
 * dataset - is what makes it worth reading.
 *
 * `withinMax` is the API's own verdict on that rule, and is null when there
 * was no window to measure, which gets the wording without a verdict rather
 * than one guessed from the criterion's overall status: that status can be
 * failing for a gap while the window itself is fine.
 */
export function getCoverageWindowTooltip(
  withinMax: boolean | null | undefined,
): CoverageWindowLength {
  return {
    key:
      withinMax === true
        ? 'sealContinuousWindowTooltipWithin'
        : withinMax === false
          ? 'sealContinuousWindowTooltipOver'
          : 'sealContinuousWindowTooltip',
    values: { years: CONTINUOUS_MAX_COVERAGE_YEARS },
  };
}

/** Every window an entry can contribute a bar or a bound from. */
function entryWindows(entry: ContinuousCoverage): ServiceDateWindow[] {
  return [
    entry.coverage_window,
    entry.service_window,
    entry.feed_info_window,
  ].filter(isWindow);
}

/**
 * The axis every bar of a comparison shares, padded a day at each end so the
 * outermost bars don't sit flush against the edges of the track.
 */
export function buildCoverageAxis(
  entries: ContinuousCoverage[],
): DateRange | undefined {
  const windows = entries.flatMap(entryWindows);
  if (windows.length === 0) {
    return undefined;
  }
  // ISO dates compare lexicographically, so one pass finds both bounds
  // without sorting two intermediate arrays.
  let start = windows[0].start;
  let end = windows[0].end;
  for (const window of windows) {
    if (window.start < start) start = window.start;
    if (window.end > end) end = window.end;
  }
  // A zero-width axis would place every bar at 0%; one padded day each side
  // gives a single-day window something to be drawn on.
  const padding = Math.max(1, Math.ceil(daysBetween(start, end) * 0.02));
  return { start: addUtcDays(start, -padding), end: addUtcDays(end, padding) };
}

/**
 * The verdict the API reached on the join/**
 * The verdict the API reached on the join, read off the entry rather than
 * re-derived from the windows: `gap_days` and `overlap_days` are what the
 * criterion was decided on, and a zero of either means the windows meet.
 */
function getJoinKind(
  entry: ContinuousCoverage,
): { kind: CoverageJoinKind; days: number } | undefined {
  if (entry.gap_days != null && entry.gap_days > 0) {
    return { kind: 'gap', days: entry.gap_days };
  }
  if (entry.overlap_days != null) {
    return entry.overlap_days > 0
      ? { kind: 'overlap', days: entry.overlap_days }
      : { kind: 'meets', days: 0 };
  }
  return entry.gap_days === 0 ? { kind: 'meets', days: 0 } : undefined;
}

/**
 * The span the join covers on the shared axis: the days both datasets cover,
 * or the days neither does. A gap is measured over its interior - the first
 * uncovered day to the last - so the band sits in the empty space between the
 * two bars rather than swallowing their end points.
 */
function getJoinSpan(
  kind: CoverageJoinKind,
  newer: ServiceDateWindow | undefined,
  older: ServiceDateWindow | undefined,
  axis: DateRange,
): CoverageJoinSpan | undefined {
  if (!isWindow(newer) || !isWindow(older)) {
    return undefined;
  }
  // ISO dates compare lexicographically, so min/max need no parsing.
  const range =
    kind === 'overlap'
      ? {
          start: newer.start > older.start ? newer.start : older.start,
          end: newer.end < older.end ? newer.end : older.end,
        }
      : kind === 'gap'
        ? { start: addUtcDays(older.end, 1), end: addUtcDays(newer.start, -1) }
        : // Windows that meet exactly have no width; the boundary is the
          // newer window's first day, which a marker is drawn on.
          { start: newer.start, end: newer.start };
  if (daysBetween(range.start, range.end) < 0) {
    return undefined;
  }
  return { range, placement: placeRangeOnAxis(range, axis) };
}

function buildJoin(
  entry: ContinuousCoverage,
  previousWindow: ServiceDateWindow | undefined,
  axis: DateRange,
): CoverageJoin | undefined {
  const join = getJoinKind(entry);
  if (join == undefined) {
    return undefined;
  }
  const span = getJoinSpan(
    join.kind,
    entry.coverage_window,
    previousWindow,
    axis,
  );
  return { ...join, ...(span != undefined && { span }) };
}

/** URL of a dataset's zipped GTFS files, mirroring `buildRoutesUrl` in the feeds service. */
function buildDatasetDownloadUrl(feedId: string, datasetId: string): string {
  return `${getFeedFilesBaseUrl()}/${feedId}/${datasetId}/${datasetId}.zip`;
}

function buildRow(
  entry: ContinuousCoverage,
  axis: DateRange,
  /** The dataset drawn below this one, when the comparison includes it. */
  previous: ContinuousCoverage | undefined,
  feedId: string | undefined,
): CoverageRow {
  const join = buildJoin(entry, previous?.coverage_window, axis);
  const tracks: CoverageTrack[] = [];
  // feed_info first so the rows stack declared-above-derived, matching the
  // order the "How it is calculated" page presents the two inputs in.
  if (isWindow(entry.feed_info_window)) {
    tracks.push({
      source: 'feedInfo',
      window: entry.feed_info_window,
      placement: placeRangeOnAxis(entry.feed_info_window, axis),
      isMeasured: isSameWindow(entry.feed_info_window, entry.coverage_window),
    });
  }
  if (isWindow(entry.service_window)) {
    tracks.push({
      source: 'calendar',
      window: entry.service_window,
      placement: placeRangeOnAxis(entry.service_window, axis),
      isMeasured: isSameWindow(entry.service_window, entry.coverage_window),
    });
  }
  return {
    datasetId: entry.dataset_id,
    ...(entry.downloaded_at != null && { downloadedAt: entry.downloaded_at }),
    tracks,
    ...(isWindow(entry.coverage_window) && {
      coverageWindow: entry.coverage_window,
    }),
    feedInfoMatches: entry.feed_info_matches,
    withinMaxCoverageWindow: entry.within_max_coverage_window,
    isLatest: entry.is_latest,
    ...(join != undefined && { join }),
    ...(feedId != undefined && {
      downloadUrl: buildDatasetDownloadUrl(feedId, entry.dataset_id),
    }),
  };
}

/**
 * The two datasets of a boundary - the one being judged and the one published
 * immediately before it - laid out newest first on `axis`, so the join
 * between them - the days they share, or the days neither covers - is
 * visible.
 *
 * Every diagram on the page is handed the same axis, so a bar on one is read
 * against a bar on another rather than against its own private scale.
 *
 * `older` is absent on a feed's first dataset, in which case the comparison
 * is the single row and the join is carried by `overlap_days` / `gap_days`
 * alone.
 */
export function buildCoverageComparison(
  boundary: ContinuousCoverageBoundary | undefined,
  /** Absent leaves rows with no download link, rather than a broken one. */
  feedId?: string,
): CoverageComparison | undefined {
  if (boundary == undefined) {
    return undefined;
  }
  // Newest first: the dataset the criterion is judging leads, and each row
  // joins the one drawn beneath it.
  const entries =
    boundary.older != undefined
      ? [boundary.newer, boundary.older]
      : [boundary.newer];
  const axis = buildCoverageAxis(entries);
  if (axis == undefined) {
    return undefined;
  }

  return {
    rows: entries.map((item, index) =>
      buildRow(item, axis, entries[index + 1], feedId),
    ),
    axis,
    files: boundary.newer.files,
  };
}

/** Which rule an entry broke, or `undefined` when it broke neither. */
export function getCoverageViolation(
  entry: ContinuousCoverage | undefined,
): CoverageViolation | undefined {
  if (entry == undefined) {
    return undefined;
  }
  if (entry.gap_days != null && entry.gap_days > 0) {
    return 'gap';
  }
  if (entry.within_max_coverage_window === false) {
    return 'window';
  }
  return undefined;
}

/**
 * The failure worth showing alongside the latest state: the boundary the API
 * points at as the criterion's last observed failure, unless its newer
 * dataset is the latest one, which is already on the page.
 *
 * Shown regardless of how long ago it happened - the endpoint only reports a
 * `latest_failure` when it is relevant to the criterion's current verdict, so
 * the page defers to it rather than second-guessing it with an age check of
 * its own.
 *
 * Its older dataset is allowed to predate the window: it is only there to
 * draw the join against, and a comparison needs both sides.
 */
export function getDistinctFailureBoundary(
  coverage: ContinuousCoverageResponse | undefined,
): ContinuousCoverageBoundary | undefined {
  const failure = coverage?.latest_failure;
  if (failure == undefined) {
    return undefined;
  }
  return failure.newer.dataset_id === coverage?.latest_state?.newer.dataset_id
    ? undefined
    : failure;
}

export function getContinuousCoverageSummary(
  criterion: ReliabilityCriterion,
  coverage: ContinuousCoverageResponse | undefined,
  now: Date = new Date(),
): ContinuousCoverageSummary {
  const displayStatus = getCriterionDisplayStatus(criterion);
  const years = CONTINUOUS_MAX_COVERAGE_YEARS;
  // Each boundary's verdict is carried by its newer dataset; the older one is
  // only there to draw the join against.
  const latest = coverage?.latest_state?.newer;
  const failure = coverage?.latest_failure?.newer;

  if (displayStatus === 'notApplicable') {
    return {
      subtitleKey: SUBTITLE_KEYS.notApplicable,
      key: 'sealContinuousNotApplicable',
      values: {},
    };
  }
  if (displayStatus === 'notEvaluated') {
    return {
      subtitleKey: SUBTITLE_KEYS.notEvaluated,
      key: 'sealContinuousNoData',
      values: {},
    };
  }

  // Documented as having no grace period, so this is defensive: if the API
  // ever reports one, the countdown is shown rather than silently dropped.
  const graceDaysLeft =
    displayStatus === 'atRisk'
      ? criterion.grace_period_ends_at != null
        ? getDaysUntil(criterion.grace_period_ends_at, now)
        : 0
      : undefined;

  if (displayStatus === 'fail' || displayStatus === 'atRisk') {
    // A failing criterion is explained by the failing dataset, which is
    // usually but not always the latest one.
    const entry = failure ?? latest;
    const violation = getCoverageViolation(entry);
    const date =
      entry?.downloaded_at != null
        ? formatDateShort(entry.downloaded_at)
        : undefined;

    if (violation === 'gap' && date != undefined) {
      return {
        subtitleKey: SUBTITLE_KEYS.gap,
        key: 'sealContinuousGapFailing',
        values: { days: entry?.gap_days ?? 0, date },
        ...(graceDaysLeft != undefined && { graceDaysLeft }),
      };
    }
    if (violation === 'window' && date != undefined) {
      return {
        subtitleKey: SUBTITLE_KEYS.window,
        key: 'sealContinuousWindowFailing',
        values: { years, date },
        ...(graceDaysLeft != undefined && { graceDaysLeft }),
      };
    }
    return {
      subtitleKey:
        violation === 'window' ? SUBTITLE_KEYS.window : SUBTITLE_KEYS.gap,
      ...(date != undefined
        ? { key: 'sealContinuousFailing', values: { years, date } }
        : { key: 'sealContinuousFailingUndated', values: { years } }),
      ...(graceDaysLeft != undefined && { graceDaysLeft }),
    };
  }

  if (displayStatus === 'probation') {
    return {
      subtitleKey: SUBTITLE_KEYS.continuous,
      ...(criterion.last_failure_at != null
        ? {
            key: 'sealContinuousProbation',
            values: { date: formatDateShort(criterion.last_failure_at) },
          }
        : { key: 'sealContinuousProbationUndated', values: {} }),
    };
  }

  if (latest == undefined) {
    return {
      subtitleKey: SUBTITLE_KEYS.noHistory,
      key: 'sealContinuousNoHistory',
      values: {},
    };
  }

  // Passing. `overlap_days` is null on a feed's first dataset, which has no
  // predecessor to overlap - that is not the same as a zero-day overlap,
  // where two windows meet exactly.
  if (latest.previous_dataset_id == null) {
    return {
      subtitleKey: SUBTITLE_KEYS.continuous,
      key: 'sealContinuousPassingSingle',
      values: { years },
    };
  }
  const overlapDays = latest.overlap_days ?? 0;
  return {
    subtitleKey: SUBTITLE_KEYS.continuous,
    ...(overlapDays > 0
      ? {
          key: 'sealContinuousPassing',
          values: { days: overlapDays, years },
        }
      : { key: 'sealContinuousPassingNoOverlap', values: { years } }),
  };
}
