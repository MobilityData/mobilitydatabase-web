/**
 * A diff report: one dataset's entity pages (/gtfs-diff-tool-v2/<dataset>/<slug>)
 * and the summary every page's header needs (feeds, sections with counts).
 *
 * The summary is written as report.json by scripts/build-gtfs-diff-dataset.mjs
 * so a page can render its header without loading the full entity diff; the
 * server rebuilds it from the diff files when report.json is missing.
 *
 * Type-only imports: the Node build script imports this file directly.
 */

import type { EntityCategoryDiff, GtfsEntityDiff } from './entity-diff-types';

export const REPORT_FILE = 'report.json';

/** Section id of the pathways page (not an entity-diff category). */
export const PATHWAYS_SECTION = 'pathways';

export interface ReportFeed {
  /** Zip file name. */
  file: string;
  publisher?: string;
  version?: string;
  /** feed_info.feed_start_date / feed_end_date, YYYYMMDD. */
  start?: string;
  end?: string;
}

export interface ReportCounts {
  added: number;
  deleted: number;
  modified: number;
  unchanged: number;
}

export interface ReportSection {
  /** Entity-diff category id (calendar, fares_v2, …) or "pathways". */
  id: string;
  /** URL segment: the id with dashes ("fares-v2"). */
  slug: string;
  label: string;
  /** Changed entities; null when unknown (summary rebuilt without counts). */
  count: number | null;
  /** Per-status entity counts behind `count`. */
  counts: ReportCounts | null;
  /** GTFS files the section covers. */
  files: string[];
  /** False when neither feed has the section's files (no page). */
  present: boolean;
}

/** A rule-based highlight worth surfacing on the summary page. */
export interface ReportHighlight {
  section: string;
  severity: 'error' | 'warning' | 'success' | 'info';
  title: string;
  detail?: string;
  /** Global highlights (lib/global-highlights): "<section>:<rule id>". */
  key?: string;
  /** Global highlights: 1 = most concerning. */
  rank?: number;
}

export interface ReportSummary {
  schema: 1;
  dataset: string;
  generated_at: string;
  feeds: { base: ReportFeed | null; new: ReportFeed | null };
  sections: ReportSection[];
  /** Highlight counts per severity, and the most severe few. */
  highlights?: {
    counts: Record<ReportHighlight['severity'], number>;
    /** Every highlight of highlights.json (global highlights only). */
    total?: number;
    top: ReportHighlight[];
  };
}

export function sectionSlug(id: string): string {
  return id.replace(/_/g, '-');
}

function categoryCounts(c: EntityCategoryDiff): ReportCounts {
  // Routes count route impact (stops, path, trips…), not just routes.txt rows.
  const counts = c.routes_map?.counts ?? c.counts;
  return {
    added: counts.added,
    deleted: counts.deleted,
    modified: counts.modified,
    unchanged: counts.unchanged,
  };
}

export function changeCount(c: EntityCategoryDiff): number {
  const counts = categoryCounts(c);
  return counts.added + counts.deleted + counts.modified;
}

export function isPresent(c: EntityCategoryDiff): boolean {
  if (c.calendar)
    return c.calendar.present.base.length + c.calendar.present.new.length > 0;
  return (c.entity_types ?? []).length > 0;
}

/** The part of pathways-diff.json the summary needs. */
export interface PathwaysOverview {
  stations: Array<{ status: 'added' | 'deleted' | 'modified' }>;
  unchanged_station_ids: string[];
}

/** Sections of a report, in page order: entity categories, then pathways. */
export function reportSections(
  entity: Pick<GtfsEntityDiff, 'categories'> | null,
  pathways: PathwaysOverview | null,
): ReportSection[] {
  const sections: ReportSection[] = (entity?.categories ?? []).map((c) => ({
    id: c.id,
    slug: sectionSlug(c.id),
    label: c.label,
    count: changeCount(c),
    counts: categoryCounts(c),
    files: c.files,
    present: isPresent(c),
  }));
  if (pathways != null) {
    const counts: ReportCounts = {
      added: 0,
      deleted: 0,
      modified: 0,
      unchanged: pathways.unchanged_station_ids.length,
    };
    for (const st of pathways.stations) counts[st.status]++;
    sections.push({
      id: PATHWAYS_SECTION,
      slug: PATHWAYS_SECTION,
      label: 'Pathways and levels',
      count: pathways.stations.length,
      counts,
      files: ['levels.txt', 'pathways.txt'],
      present: true,
    });
  }
  return sections;
}

const SEVERITY_RANK: Record<ReportHighlight['severity'], number> = {
  error: 0,
  warning: 1,
  success: 2,
  info: 3,
};

/** Calendar highlights (rule-based, see the entity generator), most severe first. */
export function reportHighlights(
  entity: Pick<GtfsEntityDiff, 'categories'> | null,
  max = 6,
): ReportSummary['highlights'] {
  const all: ReportHighlight[] = [];
  for (const c of entity?.categories ?? []) {
    for (const h of c.calendar?.highlights ?? []) {
      all.push({
        section: c.id,
        severity: h.severity,
        title: h.title,
        ...(h.detail ? { detail: h.detail } : {}),
      });
    }
  }
  const counts = { error: 0, warning: 0, success: 0, info: 0 };
  for (const h of all) counts[h.severity]++;
  const top = all
    .filter((h) => h.severity === 'error' || h.severity === 'warning')
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, max);
  return { counts, top };
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function fmtDate(d: string): string {
  return `${Number(d.slice(6, 8))} ${MONTHS[Number(d.slice(4, 6)) - 1]} ${d.slice(0, 4)}`;
}

/** "Société de transport de Montréal · 24 Aug 2026 – 3 Jan 2027" */
export function feedLabel(feed: ReportFeed | null): string {
  if (feed == null) return 'unknown feed';
  const valid = (d?: string): d is string => /^\d{8}$/.test(d ?? '');
  const range =
    valid(feed.start) && valid(feed.end)
      ? `${fmtDate(feed.start)} – ${fmtDate(feed.end)}`
      : valid(feed.start)
        ? `from ${fmtDate(feed.start)}`
        : null;
  if (feed.publisher && range) return `${feed.publisher} · ${range}`;
  return range ?? feed.publisher ?? feed.file;
}
