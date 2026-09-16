/**
 * Reads the feed's validation history into the error codes the Compliant
 * criterion lists, and marks which of them are new.
 *
 * The API gives a code, a severity and a count, so readable wording comes
 * from the validator's own rule index (see lib/validator-rules.ts).
 */

import { type components } from '../../../services/feeds/types';

type ValidationReportsResponse =
  components['schemas']['GtfsFeedValidationReportsResponse'];
type FeedValidationReport = components['schemas']['GtfsFeedValidationReport'];

/**
 * Error codes listed, most raised first. The rest are left to the full
 * validation report.
 */
export const MAX_ERROR_ROWS = 5;

/** What the validator's rule index says about one notice code. */
export interface ValidatorRuleInfo {
  summary?: string;
  /** GTFS files the rule reads, e.g. `trips.txt`. */
  files: string[];
}

export interface ErrorRow {
  code: string;
  /** Times the code was raised in this dataset. */
  total: number;
  summary?: string;
  files: string[];
  /** Absent from every earlier dataset in the fetched history. */
  isNew: boolean;
}

export interface ValidationErrorsModel {
  datasetId?: string;
  validatedAt?: string;
  /** HTML validation report of that dataset. */
  reportUrl?: string;
  /** Error codes, most raised first, capped at `MAX_ERROR_ROWS`. */
  rows: ErrorRow[];
  /** Error codes in the report, including those `rows` leaves out. */
  totalCount: number;
  /** Counted over every error code, not just the listed ones. */
  newCount: number;
  carriedCount: number;
}

const EMPTY: ValidationErrorsModel = {
  rows: [],
  totalCount: 0,
  newCount: 0,
  carriedCount: 0,
};

/** Newest first, undated last. */
function byValidatedAtDesc(
  a: FeedValidationReport,
  b: FeedValidationReport,
): number {
  if (a.validated_at == null && b.validated_at == null) return 0;
  if (a.validated_at == null) return 1;
  if (b.validated_at == null) return -1;
  return b.validated_at.localeCompare(a.validated_at);
}

/**
 * `latest` first, then the flagged item. Both are absent for some feeds, so
 * the newest validated report is the last resort.
 */
function selectReport(
  response: ValidationReportsResponse,
): FeedValidationReport | undefined {
  return (
    response.latest ??
    response.items.find((item) => item.is_latest) ??
    [...response.items].sort(byValidatedAtDesc)[0]
  );
}

export function buildValidationErrorsModel(
  response: ValidationReportsResponse | undefined,
  rules: Record<string, ValidatorRuleInfo> = {},
): ValidationErrorsModel {
  if (response == undefined) return EMPTY;

  const report = selectReport(response);
  if (report == undefined) return EMPTY;

  // Matched on id rather than `is_latest`, which the API leaves false on
  // every entry for some feeds.
  const earlierCodes = new Set<string>();
  for (const item of response.items) {
    if (item.dataset_id === report.dataset_id) continue;
    for (const notice of item.notices) {
      earlierCodes.add(notice.code);
    }
  }

  const errors: ErrorRow[] = report.notices
    .filter((notice) => notice.severity === 'ERROR')
    .map((notice) => ({
      code: notice.code,
      total: notice.total,
      summary: rules[notice.code]?.summary,
      files: rules[notice.code]?.files ?? [],
      isNew: !earlierCodes.has(notice.code),
    }))
    .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code));

  const newCount = errors.filter((row) => row.isNew).length;

  return {
    datasetId: report.dataset_id,
    validatedAt: report.validated_at ?? undefined,
    reportUrl: report.url_html ?? undefined,
    rows: errors.slice(0, MAX_ERROR_ROWS),
    totalCount: errors.length,
    newCount,
    carriedCount: errors.length - newCount,
  };
}

/** `missing_required_field` reads as "Missing required field". */
export function humanizeNoticeCode(code: string): string {
  const words = code.split('_').filter((word) => word.length > 0);
  if (words.length === 0) return code;
  return words
    .map((word, index) =>
      index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word,
    )
    .join(' ');
}
