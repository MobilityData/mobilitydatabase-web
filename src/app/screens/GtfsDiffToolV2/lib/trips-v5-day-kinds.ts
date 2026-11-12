/**
 * Kinds of day of the Trips v5 calendar (/gtfs-diff-tool-v2/<dataset>/trips-v5):
 * how a service period differs from normal service, rather than its day type
 * (the calendar's column already says that).
 *
 * Pure; type-only imports.
 */

import type { ServicePeriod } from './trips-periods';

export type DayKind = 'typical' | 'substitute' | 'block' | 'oneoff' | 'none';

export interface DayKindInfo {
  kind: DayKind;
  /** Legend and tooltip label. */
  title: string;
}

/** In legend order. */
export const DAY_KINDS: DayKindInfo[] = [
  { kind: 'typical', title: 'Typical' },
  { kind: 'substitute', title: 'Runs another day’s schedule' },
  { kind: 'block', title: 'Unique schedule' },
  { kind: 'oneoff', title: 'Unique single date schedule' },
  { kind: 'none', title: 'No service' },
];

const TITLES = new Map(DAY_KINDS.map((k) => [k.kind, k.title] as const));

/**
 * A period's kind: no service in the new feed first (the publisher's first
 * check), then its day type's typical schedule, another day type's schedule
 * (a holiday on the Sunday schedule), or a schedule of its own over several
 * days or a single one.
 */
export function dayKindOf(p: ServicePeriod): DayKind {
  if (p.counts.new === 0) return 'none';
  if (p.typical) return 'typical';
  if (p.exception) return 'substitute';
  return p.dates.length > 1 ? 'block' : 'oneoff';
}

export function dayKindTitle(kind: DayKind): string {
  return TITLES.get(kind) ?? kind;
}

const DAY_TYPE: Record<ServicePeriod['group'], string> = {
  weekday: 'weekday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

/** A period's kind, typical ones by day type: "Typical Sunday". */
export function dayKindLabel(p: ServicePeriod): string {
  const kind = dayKindOf(p);
  return kind === 'typical'
    ? `Typical ${DAY_TYPE[p.group]}`
    : dayKindTitle(kind);
}
