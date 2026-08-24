// Derives a BreakingChangeReport directly from a pair of GTFS validator
// reports (no separately curated breaking-changes JSON required).

import { computeValidationReportDiff, type ValidationReport } from './validation-report-diff';
import type { BreakingChangeEntry, BreakingChangeReport } from './breaking-changes-types';

const LARGE_COUNT_DELTA_THRESHOLD = 0.2; // 20%

function formatNoticeCode(code: string): string {
  return code
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function pctChange(base: number, next: number): string {
  if (base === 0) return next === 0 ? '0%' : '+∞%';
  const pct = ((next - base) / base) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

export function computeBreakingChangesFromValidationReports(
  baseReport: ValidationReport,
  newReport: ValidationReport,
  baseLabel: string,
  newLabel: string,
): BreakingChangeReport {
  const diff = computeValidationReportDiff(baseReport, newReport);
  const breaking: BreakingChangeEntry[] = [];
  const suspicious: BreakingChangeEntry[] = [];

  for (const n of diff.notices.added) {
    if (n.severity === 'ERROR') {
      breaking.push({
        type: 'new_error_notice',
        where: `notices → ${n.code}`,
        detail: `A new ERROR-severity notice "${formatNoticeCode(n.code)}" (${n.code}) appeared in the new feed with ${n.newCount} occurrence(s); it was absent from the base feed.`,
      });
    } else if (n.severity === 'WARNING') {
      suspicious.push({
        type: 'new_warning_notice',
        where: `notices → ${n.code}`,
        detail: `A new WARNING-severity notice "${formatNoticeCode(n.code)}" (${n.code}) appeared in the new feed with ${n.newCount} occurrence(s); it was absent from the base feed.`,
      });
    }
  }

  // Count changes on notice codes present in both feeds are informational by
  // default — recorded only in checks_passed below (see
  // metrobus-mexico-breaking-changes.json, where e.g. an INFO count rising
  // 161→204 stays a checks_passed line, not a suspicious/breaking entry).
  // A count increase is only promoted here when it exceeds the same 20%
  // threshold used for entity churn, so an outlier like +61% doesn't stay
  // buried in the audit trail.
  const largeNoticeCountIncreases = new Set<string>();
  for (const n of diff.notices.changed) {
    if (n.severity === 'INFO' || n.baseCount === 0 || n.newCount <= n.baseCount) continue;
    const delta = (n.newCount - n.baseCount) / n.baseCount;
    if (delta < LARGE_COUNT_DELTA_THRESHOLD) continue;
    largeNoticeCountIncreases.add(n.code);
    const entry: BreakingChangeEntry = {
      type: n.severity === 'ERROR' ? 'large_error_notice_increase' : 'large_warning_notice_increase',
      where: `notices → ${n.code}`,
      detail: `${n.severity}-severity notice "${formatNoticeCode(n.code)}" (${n.code}) occurrences increased from ${n.baseCount} to ${n.newCount} (${pctChange(n.baseCount, n.newCount)}), beyond the ${LARGE_COUNT_DELTA_THRESHOLD * 100}% threshold.`,
    };
    if (n.severity === 'ERROR') breaking.push(entry);
    else suspicious.push(entry);
  }

  if (diff.features.removed.length > 0) {
    suspicious.push({
      type: 'removed_gtfs_feature',
      where: 'summary → gtfsFeatures',
      detail: `The new feed no longer exposes: ${diff.features.removed.join(', ')}.`,
    });
  }

  if (diff.validatorVersion.changed) {
    suspicious.push({
      type: 'validator_version_changed',
      where: 'summary → validatorVersion',
      detail: `The base feed was validated with validator ${diff.validatorVersion.baseVersion}, the new feed with ${diff.validatorVersion.newVersion}.`,
      note: 'Notice differences may partly reflect validator changes rather than changes in the feed itself.',
    });
  }

  for (const c of diff.counts) {
    if (c.baseValue === 0) continue;
    const delta = Math.abs(c.newValue - c.baseValue) / c.baseValue;
    if (delta >= LARGE_COUNT_DELTA_THRESHOLD) {
      suspicious.push({
        type: 'large_entity_count_delta',
        where: `summary → counts.${c.key}`,
        detail: `${c.key} count changed from ${c.baseValue} to ${c.newValue} (${pctChange(c.baseValue, c.newValue)}), beyond the ${LARGE_COUNT_DELTA_THRESHOLD * 100}% threshold.`,
      });
    }
  }

  // ── checks_passed: an audit trail of every rule considered, following the
  // same "new_validator_<severity>" / "entity_churn" / "notice_count_<code>"
  // pattern used in the curated breaking-changes reports (see
  // metrobus-mexico-breaking-changes.json → checks_passed). ──

  const checks_passed: Record<string, string | number> = {};

  for (const severity of ['ERROR', 'WARNING'] as const) {
    const baseCodes = baseReport.notices.filter((n) => n.severity === severity).map((n) => n.code);
    const newCodes = new Set(newReport.notices.filter((n) => n.severity === severity).map((n) => n.code));
    const addedCodes = Array.from(newCodes).filter((c) => !baseCodes.includes(c));
    const key = severity === 'ERROR' ? 'new_validator_errors' : 'new_validator_warnings';
    if (baseCodes.length === 0 && newCodes.size === 0) continue;
    checks_passed[key] =
      addedCodes.length === 0
        ? `None — same ${baseCodes.length} ${severity} code(s) in both feeds: ${baseCodes.join(', ')}. No new ${severity.toLowerCase()} code appeared.`
        : `${addedCodes.length} new ${severity} code(s) appeared: ${addedCodes.join(', ')}.`;
  }

  checks_passed.entity_churn =
    diff.counts.length === 0
      ? 'no entity counts reported'
      : `${diff.counts
          .map((c) => `${c.key} ${pctChange(c.baseValue, c.newValue)} (${c.baseValue}→${c.newValue})`)
          .join(', ')}. Threshold: ${LARGE_COUNT_DELTA_THRESHOLD * 100}%.`;

  const allCodes = new Map<string, { severity: string }>();
  for (const n of baseReport.notices) allCodes.set(n.code, { severity: n.severity });
  for (const n of newReport.notices) allCodes.set(n.code, { severity: n.severity });

  allCodes.forEach(({ severity }, code) => {
    const baseCount = baseReport.notices.find((n) => n.code === code)?.totalNotices;
    const newCount = newReport.notices.find((n) => n.code === code)?.totalNotices;
    let annotation: string;
    let valueStr: string;
    if (baseCount === undefined) {
      valueStr = `— → ${newCount}`;
      annotation = 'new in new feed';
    } else if (newCount === undefined) {
      valueStr = `${baseCount} → —`;
      annotation = 'resolved in new feed';
    } else if (newCount === baseCount) {
      valueStr = `${baseCount} → ${newCount}`;
      annotation = 'unchanged';
    } else if (newCount < baseCount) {
      valueStr = `${baseCount} → ${newCount}`;
      annotation = severity === 'INFO' ? 'decreased' : 'improvement';
    } else if (largeNoticeCountIncreases.has(code)) {
      valueStr = `${baseCount} → ${newCount}`;
      annotation = `increased ${pctChange(baseCount, newCount)} — see above`;
    } else {
      valueStr = `${baseCount} → ${newCount}`;
      annotation = `increased ${pctChange(baseCount, newCount)}`;
    }
    checks_passed[`notice_count_${code}`] = `${valueStr} (${annotation})`;
  });

  return {
    comparison: {
      old_feed_version: baseLabel,
      new_feed_version: newLabel,
      has_breaking_change: breaking.length > 0,
      has_suspicious_change: suspicious.length > 0,
    },
    breaking_changes: breaking,
    suspicious_changes: suspicious,
    checks_passed,
  };
}
