/**
 * A diff report: one dataset's entity pages (/gtfs-diff-tool-v2/<dataset>/<slug>)
 * and the summary every page's header needs (feeds, sections with counts).
 *
 * report.json (ReportDoc, schema 4) is the diff's entry point: the feeds,
 * one entry per GTFS file (presence, totals, change counts, raw table), each
 * analysis's file and counts, and the top highlights. The entity step writes
 * the files and analyses; the report step adds the feeds, the pathways
 * counts and the highlights. The pages' sections are this viewer's grouping
 * of it (reportSummary, lib/sections). Older builds: schema 3 (per-file
 * counts only, the entries in files.json) and schema 2.
 *
 * Runtime imports: lib/sections and lib/diff-layout only (the Node build
 * loads this file through scripts/lib/ts-resolve.mjs).
 */

import type { AnalysisName as LayoutAnalysisName } from './diff-layout';
import type {
  DiffFileEntry,
  FilesDoc,
  GtfsEntityDiff,
} from './entity-diff-types';
import { PATHWAYS_SECTION, SECTIONS, sectionPageId } from './sections';

export { PATHWAYS_SECTION };
/** lib/diff-layout's, re-exported for the build scripts that import it here. */
export { REPORT_FILE } from './diff-layout';

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

/** A file's counts; `id_only` for files counted from their raw row diff. */
export interface ReportFileCounts extends ReportCounts {
  id_only?: number;
}

/** One GTFS file of report.json. */
export interface ReportFile {
  file: string;
  /** Schema 2 only: the summary section whose counts include the file. */
  group?: string;
  /** In at least one of the two feeds. */
  present: boolean;
  /** The file's changes; null when it was not diffed. */
  counts: ReportFileCounts | null;
  /**
   * Rows counted inside another file's entities (stop_times.txt in
   * trips.txt's trips): left out of any sum of files.
   */
  part_of?: string;
}

/** Counts of the analyses that are not one file's: routes, services, stations. */
export interface ReportAnalyses {
  /** Route impact: a route changes when its stops, path, trips… do. */
  routes?: ReportCounts;
  /** Services (calendar.txt and calendar_dates.txt together). */
  services?: ReportCounts;
  /** Stations with pathways (analysis/pathways.json). */
  pathways?: ReportCounts;
}

/** An analysis of report.json: its JSON and its own counts. */
export interface ReportAnalysis {
  /** lib/diff-layout ANALYSIS_FILES: analysis/stops.json, analysis/services.json… */
  file?: string;
  /** Stops, routes (route impact), services or stations per status. */
  counts?: ReportCounts;
}

/** report.json: the diff's feeds, files, analyses and top highlights. */
export interface ReportDoc {
  schema: 4;
  dataset: string;
  generated_at: string;
  /** Set by the report step. */
  feeds?: { base: ReportFeed | null; new: ReportFeed | null };
  /** The entity step's run: generator version, each zip's source and file list. */
  metadata: GtfsEntityDiff['metadata'];
  /** Every GTFS file either feed has: presence, totals, counts, raw table. */
  files: DiffFileEntry[];
  analyses: Partial<Record<LayoutAnalysisName, ReportAnalysis>>;
  highlights?: ReportSummary['highlights'];
}

/** report.json schema 3 (older builds): per-file counts; entries in files.json. */
export interface ReportDocV3 {
  schema: 3;
  dataset: string;
  generated_at: string;
  feeds: { base: ReportFeed | null; new: ReportFeed | null };
  /** Every file either feed has, in files.json order. */
  files: ReportFile[];
  analyses: ReportAnalyses;
  highlights?: ReportSummary['highlights'];
}

/** report.json schema 2 (older builds): files tagged with page groups. */
export interface ReportDocV2 {
  schema: 2;
  dataset: string;
  generated_at: string;
  feeds: { base: ReportFeed | null; new: ReportFeed | null };
  files: ReportFile[];
  groups: Array<{
    id: string;
    label: string;
    present: boolean;
    counts?: ReportCounts;
    files?: string[];
  }>;
  highlights?: ReportSummary['highlights'];
}

export interface ReportSection {
  /** Page id (calendar, fares_v2, …) or "pathways". */
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
  /**
   * The section's files at least one feed has (absent from reports built
   * before it was recorded: fall back to `files`).
   */
  present_files?: string[];
  /** False when neither feed has the section's files (no page). */
  present: boolean;
}

/**
 * GTFS files a feed needs (some conditionally: calendar.txt or
 * calendar_dates.txt, stops.txt unless Flex locations stand in). A section
 * holding one stays in the summary even when neither feed has it; one of
 * only optional files is left out.
 */
export const REQUIRED_FILES: ReadonlySet<string> = new Set([
  'agency.txt',
  'stops.txt',
  'routes.txt',
  'trips.txt',
  'stop_times.txt',
  'calendar.txt',
  'calendar_dates.txt',
]);

export function isRequiredSection(s: Pick<ReportSection, 'files'>): boolean {
  return s.files.some((f) => REQUIRED_FILES.has(f));
}

/** A rule-based highlight worth surfacing on the summary page. */
export interface ReportHighlight {
  /**
   * Highlight section (lib/diff-layout HIGHLIGHT_SECTIONS: stops, routes,
   * services, trips); lib/sections sectionPageId gives its page.
   */
  section: string;
  severity: 'error' | 'warning' | 'success' | 'info';
  title: string;
  detail?: string;
  /** Global highlights (lib/global-highlights): "<section>:<rule id>". */
  key?: string;
  /** Global highlights: 1 = most concerning. */
  rank?: number;
}

/** The summary the pages use: report.json as sections (reportSummary). */
export interface ReportSummary {
  schema: 1;
  dataset: string;
  generated_at: string;
  feeds: { base: ReportFeed | null; new: ReportFeed | null };
  sections: ReportSection[];
  /** Highlight counts per severity, and the most severe few. */
  highlights?: {
    counts: Record<ReportHighlight['severity'], number>;
    /** Every highlight of highlights/index.json (global highlights only). */
    total?: number;
    top: ReportHighlight[];
  };
}

export function sectionSlug(id: string): string {
  return id.replace(/_/g, '-');
}

/**
 * Label of the page a highlight section shows on ("Service Dates" for
 * services); the section id when the report has no such page.
 */
export function highlightSectionLabel(
  report: Pick<ReportSummary, 'sections'>,
  section: string,
): string {
  const page = sectionPageId(section);
  return report.sections.find((s) => s.id === page)?.label ?? section;
}

/** The part of analysis/pathways.json the summary needs. */
export interface PathwaysOverview {
  stations: Array<{ status: 'added' | 'deleted' | 'modified' }>;
  unchanged_station_ids: string[];
}

/** Stations per status. */
export function pathwaysCounts(pathways: PathwaysOverview): ReportCounts {
  const counts: ReportCounts = {
    added: 0,
    deleted: 0,
    modified: 0,
    unchanged: pathways.unchanged_station_ids.length,
  };
  for (const st of pathways.stations) counts[st.status]++;
  return counts;
}

const NO_COUNTS: ReportCounts = {
  added: 0,
  deleted: 0,
  modified: 0,
  unchanged: 0,
};

/** report.json's file entries and analysis paths, as the pages read them (FilesDoc). */
export function filesDocFromReport(doc: ReportDoc): FilesDoc {
  const analyses: FilesDoc['analyses'] = {};
  for (const name of ['stops', 'routes', 'services'] as const) {
    const file = doc.analyses[name]?.file;
    if (file != null) analyses[name] = file;
  }
  return { schema: 1, metadata: doc.metadata, files: doc.files, analyses };
}

/** Sum of the files' counts, without files counted inside another one. */
export function groupFileCounts(files: ReportFile[]): ReportCounts {
  const out = { ...NO_COUNTS };
  for (const f of files) {
    if (f.counts == null || f.part_of != null) continue;
    out.added += f.counts.added;
    out.deleted += f.counts.deleted;
    out.modified += f.counts.modified;
    out.unchanged += f.counts.unchanged;
  }
  return out;
}

/**
 * The summary's per-file counts: by the file's key where it has one, else
 * its raw row diff's (calendar files, child files).
 */
export function reportFiles(doc: FilesDoc): ReportFile[] {
  return doc.files.map((f) => {
    const c = f.counts;
    const raw = f.raw_table?.counts;
    const counts: ReportFileCounts | null = c
      ? {
          added: c.added,
          deleted: c.deleted,
          modified: c.modified,
          unchanged: c.unchanged,
        }
      : raw
        ? {
            added: raw.added,
            deleted: raw.deleted,
            modified: raw.modified,
            unchanged: raw.unchanged,
            id_only: raw.id_only,
          }
        : null;
    return {
      file: f.file,
      present: f.present.base || f.present.new,
      counts,
      ...(f.part_of != null ? { part_of: f.part_of } : {}),
    };
  });
}

function summarySections(
  files: ReportFile[],
  analyses: ReportAnalyses,
): ReportSection[] {
  const byName = new Map(files.map((f) => [f.file, f]));
  const sections: ReportSection[] = [];
  for (const s of SECTIONS) {
    const own = s.files
      .map((f) => byName.get(f))
      .filter((f): f is ReportFile => f != null);
    const fromAnalysis = s.counts ? analyses[s.counts] : undefined;
    // Pathways has a page only when analysis/pathways.json was built.
    if (s.id === PATHWAYS_SECTION && fromAnalysis == null) continue;
    const counts = fromAnalysis ?? groupFileCounts(own);
    const presentFiles = s.files.filter((f) => byName.get(f)?.present);
    sections.push({
      id: s.id,
      slug: sectionSlug(s.id),
      label: s.label,
      count: counts.added + counts.deleted + counts.modified,
      counts,
      files: s.files,
      present_files: presentFiles,
      present: presentFiles.length > 0,
    });
  }
  return sections;
}

function legacySections(doc: ReportDocV2): ReportSection[] {
  const byName = new Map(doc.files.map((f) => [f.file, f]));
  return doc.groups.map((g): ReportSection => {
    const own = doc.files.filter((f) => f.group === g.id);
    const files = [...own.map((f) => f.file), ...(g.files ?? [])];
    const counts = g.counts ?? groupFileCounts(own);
    return {
      id: g.id,
      slug: sectionSlug(g.id),
      label: g.label,
      count: counts.added + counts.deleted + counts.modified,
      counts,
      files,
      present_files: files.filter((f) => byName.get(f)?.present === true),
      present: g.present,
    };
  });
}

/** The analyses' counts of a schema 4 report. */
function analysisCounts(doc: ReportDoc): ReportAnalyses {
  const out: ReportAnalyses = {};
  for (const name of ['routes', 'services', 'pathways'] as const) {
    const c = doc.analyses[name]?.counts;
    if (c != null) out[name] = c;
  }
  return out;
}

/** The pages' sections from report.json (schema 1 summaries pass through). */
export function reportSummary(
  doc: ReportDoc | ReportDocV3 | ReportDocV2 | ReportSummary,
): ReportSummary {
  if (doc.schema === 1) return doc;
  const sections =
    doc.schema === 4
      ? summarySections(
          reportFiles(filesDocFromReport(doc)),
          analysisCounts(doc),
        )
      : doc.schema === 3
        ? summarySections(doc.files, doc.analyses)
        : legacySections(doc);
  return {
    schema: 1,
    dataset: doc.dataset,
    generated_at: doc.generated_at,
    feeds: doc.feeds ?? { base: null, new: null },
    sections,
    ...(doc.highlights ? { highlights: doc.highlights } : {}),
  };
}

const SEVERITY_RANK: Record<ReportHighlight['severity'], number> = {
  error: 0,
  warning: 1,
  success: 2,
  info: 3,
};

/**
 * The services' own highlights, most severe first: report.json's fallback
 * when highlights/index.json was not built.
 */
export function reportHighlights(
  services: {
    highlights: Array<Pick<ReportHighlight, 'severity' | 'title' | 'detail'>>;
  } | null,
  max = 6,
): ReportSummary['highlights'] {
  const all: ReportHighlight[] = (services?.highlights ?? []).map((h) => ({
    section: 'services',
    severity: h.severity,
    title: h.title,
    ...(h.detail ? { detail: h.detail } : {}),
  }));
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
