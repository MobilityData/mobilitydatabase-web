// Types for the breaking / suspicious change report.

export interface BreakingChangeComparison {
  old_feed_version: string;
  new_feed_version: string;
  has_breaking_change: boolean;
  has_suspicious_change: boolean;
}

export interface BreakingChangeEntry {
  type: string;
  where: string;
  detail: string;
  note?: string;
}

export interface BreakingChangeReport {
  comparison: BreakingChangeComparison;
  breaking_changes: BreakingChangeEntry[];
  suspicious_changes: BreakingChangeEntry[];
  checks_passed: Record<string, string | number>;
}
