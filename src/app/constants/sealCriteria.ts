import { type SvgIconComponent } from '@mui/icons-material';
import { differenceInCalendarDays, isAfter, subMonths } from 'date-fns';
import { theme as appTheme } from '../Theme';
import { formatDateShort } from '../utils/date';
import VerifiedIcon from '@mui/icons-material/Verified';
import CodeIcon from '@mui/icons-material/Code';
import DownloadIcon from '@mui/icons-material/Download';
import RuleIcon from '@mui/icons-material/Rule';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CancelIcon from '@mui/icons-material/Cancel';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import { type components } from '../services/feeds/types';

export type SealCriterionKey =
  | 'official'
  | 'stable'
  | 'available'
  | 'compliant'
  | 'freshRolling'
  | 'freshContinuous';

export type ApiSealCriterionKey =
  components['schemas']['ReliabilityCriterion']['criterion'];

// The API's criterion enum uses snake_case names that don't line up 1:1
// with the frontend's camelCase keys (fresh_coverage -> freshRolling).
export const API_CRITERION_TO_KEY: Record<
  ApiSealCriterionKey,
  SealCriterionKey
> = {
  official: 'official',
  stable: 'stable',
  available: 'available',
  compliant: 'compliant',
  fresh_coverage: 'freshRolling',
  fresh_continuous: 'freshContinuous',
};

export const SEAL_CRITERION_ICONS: Record<SealCriterionKey, SvgIconComponent> =
  {
    official: VerifiedIcon,
    stable: CodeIcon,
    available: DownloadIcon,
    compliant: RuleIcon,
    freshRolling: EventAvailableIcon,
    freshContinuous: SyncAltIcon,
  };

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];
type FeedReliabilityReport = components['schemas']['FeedReliabilityReport'];

export type CriterionDisplayStatus =
  | 'pass'
  | 'atRisk'
  | 'fail'
  | 'notApplicable'
  | 'notEvaluated'
  | 'probation';

export type SealDisplayStatus =
  | 'earned'
  | 'gracePeriod'
  | 'probation'
  | 'notEarned';

/** Clean months a criterion must serve after a confirmed failure. */
export const PROBATION_MONTHS = 6;

// `on_probation` and `in_grace_period` are both independent of `status` - a
// criterion can read `pass` while on probation, or while still inside a
// grace period from a recent failure, and in either case it takes priority
// over the plain status-derived states below.
export function getCriterionDisplayStatus(
  criterion: ReliabilityCriterion,
): CriterionDisplayStatus {
  if (criterion.on_probation) {
    return 'probation';
  }
  if (criterion.in_grace_period) {
    return 'atRisk';
  }
  switch (criterion.status) {
    case 'pass':
      return 'pass';
    case 'fail':
      return 'fail';
    case 'not_applicable':
      return 'notApplicable';
    case 'unknown':
    case 'never_evaluated':
      return 'notEvaluated';
  }
}

/**
 * The criterion's color as a CSS variable, so a caller doesn't need the theme
 * in hand - which keeps presentational components off the client - and so the
 * color follows whichever scheme is active.
 */
export function getCriterionStatusColor(
  displayStatus: CriterionDisplayStatus,
): string {
  return {
    pass: appTheme.vars.palette.success.main,
    atRisk: appTheme.vars.palette.warning.main,
    fail: appTheme.vars.palette.error.main,
    notApplicable: appTheme.vars.palette.text.secondary,
    notEvaluated: appTheme.vars.palette.text.secondary,
    probation: appTheme.vars.palette.info.main,
  }[displayStatus];
}

// Keys in the `feeds` namespace.
export const CRITERION_STATUS_LABEL_KEYS: Record<
  CriterionDisplayStatus,
  string
> = {
  pass: 'sealCriterionPass',
  atRisk: 'sealCriterionInGracePeriod',
  fail: 'sealCriterionFail',
  notApplicable: 'sealCriterionNotApplicable',
  notEvaluated: 'sealCriterionNotEvaluated',
  probation: 'sealCriterionOnProbation',
};

export const CRITERION_STATUS_ICONS: Record<
  CriterionDisplayStatus,
  SvgIconComponent
> = {
  pass: CheckCircleIcon,
  atRisk: WarningAmberIcon,
  fail: CancelIcon,
  notApplicable: RemoveCircleOutlineIcon,
  notEvaluated: HelpOutlineIcon,
  probation: HourglassTopIcon,
};

/**
 * not_applicable criteria are withdrawn from the seal entirely, so they
 * shouldn't count towards "X out of Y criteria met".
 */
export function getConsideredCriteria(
  criteria: ReliabilityCriterion[],
): ReliabilityCriterion[] {
  return criteria.filter((c) => c.status !== 'not_applicable');
}

export function getPassedCriteriaCount(
  criteria: ReliabilityCriterion[],
): number {
  return getConsideredCriteria(criteria).filter(
    (c) => c.status === 'pass' && !c.on_probation,
  ).length;
}

/**
 * The seal decides the headline: while it is held, an at-risk criterion is
 * the story ("before it is disqualified"); while it is not, a feed rebuilding
 * its record is ("before the Seal of Reliability is awarded").
 */
export function getSealDisplayStatus(
  reliability: FeedReliabilityReport | undefined,
): SealDisplayStatus {
  const criteria = reliability?.criteria ?? [];
  if (reliability?.has_seal === true) {
    return criteria.some((c) => c.in_grace_period) ? 'gracePeriod' : 'earned';
  }
  return reliability?.on_probation === true ? 'probation' : 'notEarned';
}

// Keys in the `feeds` namespace.
export const SEAL_STATUS_LABEL_KEYS: Record<SealDisplayStatus, string> = {
  earned: 'sealEarnedLabel',
  gracePeriod: 'sealInGracePeriodLabel',
  probation: 'sealOnProbationLabel',
  notEarned: 'sealNotYetEarnedLabel',
};

export function getGracePeriodCriteria(
  criteria: ReliabilityCriterion[],
): ReliabilityCriterion[] {
  return criteria.filter((c) => c.in_grace_period);
}

/**
 * Whole days left before `date`, floored at 0. `grace_period_ends_at` can
 * already be in the past when the nightly job hasn't acted on it yet.
 */
export function getDaysUntil(date: string, now = new Date()): number {
  return Math.max(0, differenceInCalendarDays(new Date(date), now));
}

/**
 * The nearest grace-period deadline across the at-risk criteria - the one
 * that actually decides when the seal goes. `undefined` when none of them
 * report a deadline.
 */
export function getSoonestGracePeriodEnd(
  criteria: ReliabilityCriterion[],
): string | undefined {
  const deadlines = getGracePeriodCriteria(criteria)
    .map((c) => c.grace_period_ends_at)
    .filter((d): d is string => d != null)
    .sort();
  return deadlines[0];
}

export interface ProbationWindow {
  start: Date;
  end: Date;
}

/**
 * The API reports only when probation ends, and probation is defined as
 * PROBATION_MONTHS clean months, so the start is derived from the end.
 *
 * `undefined` when there is no end date - the feed or criterion is not on
 * probation, or the window elapsed without the nightly job clearing it.
 */
export function getProbationWindowFromEnd(
  endsAt: string | null | undefined,
): ProbationWindow | undefined {
  if (endsAt == null) {
    return undefined;
  }
  const end = new Date(endsAt);
  if (isNaN(end.getTime())) {
    return undefined;
  }
  return { start: subMonths(end, PROBATION_MONTHS), end };
}

/**
 * The feed-level probation window, for the seal banner.
 *
 * `probation_ends_at` is already the latest end across every criterion on
 * probation, but each criterion serves its own fixed-length window, so the
 * one ending last isn't necessarily the one that started first. The start is
 * the earliest start among them instead of being derived from that end.
 */
export function getProbationWindow(
  reliability: FeedReliabilityReport | undefined,
): ProbationWindow | undefined {
  const endsAt = reliability?.probation_ends_at;
  if (endsAt == null) {
    return undefined;
  }
  const end = new Date(endsAt);
  if (isNaN(end.getTime())) {
    return undefined;
  }

  const starts = (reliability?.criteria ?? [])
    .filter((c) => c.on_probation)
    .map((c) => getProbationWindowFromEnd(c.probation_ends_at)?.start)
    .filter((d): d is Date => d != null);

  const start =
    starts.length > 0
      ? new Date(Math.min(...starts.map((d) => d.getTime())))
      : subMonths(end, PROBATION_MONTHS);

  return { start, end };
}

/** How far through the probation window `now` sits, as 0-100. */
export function getProbationProgressPercent(
  probationWindow: ProbationWindow,
  now = new Date(),
): number {
  const total = probationWindow.end.getTime() - probationWindow.start.getTime();
  if (total <= 0) {
    return 100;
  }
  const elapsed = now.getTime() - probationWindow.start.getTime();
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

/** "A", "A and B", "A, B and C" - `and` comes from the `common` namespace. */
export function joinWithAnd(items: string[], and: string): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}

/**
 * Everything beyond the criterion itself that its presentation depends on.
 * Only the two point-in-time criteria read these today.
 */
export interface SealCriterionContext {
  /** `feed.source_info.is_producer_url_unstable` */
  isProducerUrlUnstable?: boolean | null;
  /** `feed.created_at` - when the URL entered the Mobility Database */
  feedCreatedAt?: string | null;
  /**
   * The date to evaluate against. Pin this once on the server and thread it
   * through, so a date-derived branch resolves to the same instant during SSR
   * and hydration. Defaults to the current date.
   */
  now?: Date;
}

/** Which wording a criterion is presented with. */
export type CriterionCopyVariant =
  | 'default'
  | 'unstableUrl'
  | 'buildingRecord'
  | 'notAuthorized'
  | 'seasonal';

export interface CriterionCopy {
  variant: CriterionCopyVariant;
  /** Keys in the `sealOfReliability` namespace. */
  titleKey: string;
  subtitleKey: string;
  descriptionKey: string;
}

/** Whether the feed is younger than the six months Stable requires. */
export function isFeedWithinProbationWindow(
  feedCreatedAt?: string | null,
  now: Date = new Date(),
): boolean {
  if (feedCreatedAt == null) {
    return false;
  }
  const createdAt = new Date(feedCreatedAt);
  if (isNaN(createdAt.getTime())) {
    return false;
  }
  return isAfter(createdAt, subMonths(now, PROBATION_MONTHS));
}

/**
 * Picks the wording for a criterion. `stable` and `official` carry extra
 * states that the generic per-criterion copy can't express:
 *
 * - a producer URL flagged as unstable fails on the URL's shape, not on its
 *   track record, and says so whatever the criterion's status;
 * - a feed younger than PROBATION_MONTHS hasn't failed Stable so much as not
 *   finished earning it yet;
 * - a failing `official` means nobody authorized the feed, which reads very
 *   differently from a check that merely hasn't passed.
 *
 * Anything else - including a grace period, which the docs say neither of
 * these two criteria has - falls back to the criterion's own copy.
 */
export function getCriterionCopy(
  criterion: ReliabilityCriterion,
  context: SealCriterionContext = {},
): CriterionCopy {
  const key = API_CRITERION_TO_KEY[criterion.criterion];
  const displayStatus = getCriterionDisplayStatus(criterion);
  const base = {
    titleKey: `criteria.${key}.title`,
    subtitleKey: `criteria.${key}.subtitle`,
    descriptionKey: `criteria.${key}.description`,
  };

  if (key === 'stable') {
    if (context.isProducerUrlUnstable === true) {
      return {
        ...base,
        variant: 'unstableUrl',
        subtitleKey: 'criteria.stable.unstableUrlSubtitle',
        descriptionKey: 'criteria.stable.unstableUrlDescription',
      };
    }
    if (
      displayStatus !== 'pass' &&
      isFeedWithinProbationWindow(context.feedCreatedAt, context.now)
    ) {
      return {
        ...base,
        variant: 'buildingRecord',
        subtitleKey: 'criteria.stable.buildingRecordSubtitle',
        descriptionKey: 'criteria.stable.buildingRecordDescription',
      };
    }
  }

  if (key === 'official' && displayStatus === 'fail') {
    return {
      ...base,
      variant: 'notAuthorized',
      subtitleKey: 'criteria.official.notAuthorizedSubtitle',
      descriptionKey: 'criteria.official.notAuthorizedDescription',
    };
  }

  // `not_applicable` on this criterion only ever means the feed is seasonal.
  if (key === 'freshRolling' && displayStatus === 'notApplicable') {
    return {
      ...base,
      variant: 'seasonal',
      subtitleKey: 'criteria.freshRolling.seasonalSubtitle',
      descriptionKey: 'criteria.freshRolling.seasonalDescription',
    };
  }

  return { ...base, variant: 'default' };
}

/**
 * Minimal shape of a next-intl translator, so this module stays free of
 * next-intl's server/client split.
 */
type Translator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/**
 * "<title> — <status>: <description>" plus any grace-period note. The
 * description itself already covers the seasonal case (see the `seasonal`
 * variant in getCriterionCopy). Shared by every criterion tooltip / aria-label
 * so they read identically.
 *
 * @param t translator for the `feeds` namespace
 * @param tSeal translator for the `sealOfReliability` namespace
 * @param context feed-level facts that can change the wording
 */
export function getCriterionDescription(
  criterion: ReliabilityCriterion,
  t: Translator,
  tSeal: Translator,
  context: SealCriterionContext = {},
): string {
  const displayStatus = getCriterionDisplayStatus(criterion);
  const copy = getCriterionCopy(criterion, context);
  const statusLabel = t(CRITERION_STATUS_LABEL_KEYS[displayStatus]);

  const graceNote =
    displayStatus === 'atRisk' && criterion.grace_period_ends_at != null
      ? ` ${t('sealCriterionGracePeriodNote', {
          date: formatDateShort(criterion.grace_period_ends_at),
        })}`
      : '';

  return `${tSeal(copy.titleKey)} — ${statusLabel}: ${tSeal(
    copy.descriptionKey,
  )}${graceNote}`;
}
