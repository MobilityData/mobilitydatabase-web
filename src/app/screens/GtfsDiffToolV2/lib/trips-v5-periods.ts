/**
 * Titles of the Trips v5 service periods
 * (/gtfs-diff-tool-v2/<dataset>/trips-v5): the periods of lib/trips-periods
 * as "<kind> <day>" ("Typical weekday", "Exception Saturday",
 * "Special Friday"), and the share of trips changed as a percent.
 *
 * Pure; type-only imports besides the helpers.
 */

import { WEEKDAY_KEYS, weekdayIndex } from './calendar-utils';
import type { ServicePeriod } from './trips-periods';

const DAY_TYPE: Record<ServicePeriod['group'], string> = {
  weekday: 'weekday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

function kindOf(p: ServicePeriod): string {
  if (p.typical) return 'Typical';
  return p.exception ? 'Exception' : 'Special';
}

/** "Friday" when every date of a weekday period is one; else its day type. */
function dayOf(p: ServicePeriod, narrow: boolean): string {
  if (p.group !== 'weekday' || !narrow) return DAY_TYPE[p.group];
  const w = weekdayIndex(p.dates[0]);
  if (p.dates.some((d) => weekdayIndex(d) !== w)) return DAY_TYPE.weekday;
  const key = WEEKDAY_KEYS[w];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Each period's title: typical periods by day type, the rest by weekday when
 * they run on one. Typical periods sharing a title are narrowed to their
 * weekday too (feeds sharing no dates). Other periods may share a title,
 * told apart by their service window.
 */
export function periodTitles(periods: ServicePeriod[]): Map<string, string> {
  const titleOf = (p: ServicePeriod, narrow: boolean): string =>
    `${kindOf(p)} ${dayOf(p, narrow || !p.typical)}`;
  const titles = new Map(periods.map((p) => [p.id, titleOf(p, false)]));
  const n = new Map<string, number>();
  for (const p of periods)
    if (p.typical) {
      const t = titles.get(p.id) ?? '';
      n.set(t, (n.get(t) ?? 0) + 1);
    }
  for (const p of periods)
    if (p.typical && (n.get(titles.get(p.id) ?? '') ?? 0) > 1)
      titles.set(p.id, titleOf(p, true));
  return titles;
}

/** A share of trips (0–1) as a whole percent; never rounded to 0 or 100. */
export function formatChangeShare(share: number): string {
  if (share <= 0) return '0%';
  if (share >= 1) return '100%';
  const pct = Math.round(share * 100);
  if (pct === 0) return '<1%';
  if (pct === 100) return '>99%';
  return `${pct}%`;
}
