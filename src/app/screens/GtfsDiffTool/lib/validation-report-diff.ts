// Types and diff helpers for comparing two GTFS validator JSON reports.
// Focused on GTFS features and the specification-compliance (notices) report.

export type NoticeSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationNotice {
  code: string;
  severity: NoticeSeverity;
  totalNotices: number;
}

export interface ValidationReportSummary {
  validatorVersion: string;
  validatedAt: string;
  counts: Record<string, number>;
  gtfsFeatures: string[];
}

export interface ValidationReport {
  summary: ValidationReportSummary;
  notices: ValidationNotice[];
}

// ── Diff result shapes ─────────────────────────────────────────────

export interface FeatureDiff {
  added: string[];
  removed: string[];
  unchanged: string[];
}

export interface NoticeChange {
  code: string;
  severity: NoticeSeverity;
  baseCount: number;
  newCount: number;
}

export interface NoticeDiff {
  added: NoticeChange[];
  removed: NoticeChange[];
  changed: NoticeChange[];
  unchanged: NoticeChange[];
}

export interface CountChange {
  key: string;
  baseValue: number;
  newValue: number;
}

export interface ValidatorVersionDiff {
  baseVersion: string;
  newVersion: string;
  changed: boolean;
}

export interface ValidationReportDiff {
  validatorVersion: ValidatorVersionDiff;
  baseValidatedAt: string;
  newValidatedAt: string;
  features: FeatureDiff;
  notices: NoticeDiff;
  counts: CountChange[];
}

// ── Diff computation ───────────────────────────────────────────────

function diffFeatures(baseFeatures: string[], newFeatures: string[]): FeatureDiff {
  const baseSet = new Set(baseFeatures);
  const newSet = new Set(newFeatures);
  return {
    added: newFeatures.filter((f) => !baseSet.has(f)),
    removed: baseFeatures.filter((f) => !newSet.has(f)),
    unchanged: newFeatures.filter((f) => baseSet.has(f)),
  };
}

function diffNotices(
  baseNotices: ValidationNotice[],
  newNotices: ValidationNotice[],
): NoticeDiff {
  const baseByCode = new Map(baseNotices.map((n) => [n.code, n]));
  const newByCode = new Map(newNotices.map((n) => [n.code, n]));

  const added: NoticeChange[] = [];
  const removed: NoticeChange[] = [];
  const changed: NoticeChange[] = [];
  const unchanged: NoticeChange[] = [];

  for (const n of newNotices) {
    const prev = baseByCode.get(n.code);
    if (prev === undefined) {
      added.push({ code: n.code, severity: n.severity, baseCount: 0, newCount: n.totalNotices });
    } else if (prev.totalNotices !== n.totalNotices) {
      changed.push({
        code: n.code,
        severity: n.severity,
        baseCount: prev.totalNotices,
        newCount: n.totalNotices,
      });
    } else {
      unchanged.push({
        code: n.code,
        severity: n.severity,
        baseCount: prev.totalNotices,
        newCount: n.totalNotices,
      });
    }
  }

  for (const n of baseNotices) {
    if (!newByCode.has(n.code)) {
      removed.push({
        code: n.code,
        severity: n.severity,
        baseCount: n.totalNotices,
        newCount: 0,
      });
    }
  }

  return { added, removed, changed, unchanged };
}

function diffCounts(
  baseCounts: Record<string, number>,
  newCounts: Record<string, number>,
): CountChange[] {
  const keys = new Set([...Object.keys(baseCounts), ...Object.keys(newCounts)]);
  const changes: CountChange[] = [];
  keys.forEach((key) => {
    const baseValue = baseCounts[key] ?? 0;
    const newValue = newCounts[key] ?? 0;
    if (baseValue !== newValue) {
      changes.push({ key, baseValue, newValue });
    }
  });
  return changes;
}

/**
 * Compute the diff between an older (base) and a newer validation report.
 */
export function computeValidationReportDiff(
  baseReport: ValidationReport,
  newReport: ValidationReport,
): ValidationReportDiff {
  return {
    validatorVersion: {
      baseVersion: baseReport.summary.validatorVersion,
      newVersion: newReport.summary.validatorVersion,
      changed: baseReport.summary.validatorVersion !== newReport.summary.validatorVersion,
    },
    baseValidatedAt: baseReport.summary.validatedAt,
    newValidatedAt: newReport.summary.validatedAt,
    features: diffFeatures(baseReport.summary.gtfsFeatures, newReport.summary.gtfsFeatures),
    notices: diffNotices(baseReport.notices, newReport.notices),
    counts: diffCounts(baseReport.summary.counts, newReport.summary.counts),
  };
}
