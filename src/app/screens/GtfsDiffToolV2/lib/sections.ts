/**
 * The viewer's pages: which GTFS files each one shows, in what order, under
 * what label. The diff outputs know nothing of pages (report.json has one
 * entry per file); this module groups them.
 *
 * Runtime-import free: the Node build scripts import report.ts, which uses
 * this file.
 */

import type {
  AnalysisName,
  DiffCounts,
  DiffFileEntry,
  EntityCategoryDiff,
  EntityTypeDiff,
  FilesDoc,
  GtfsEntityDiff,
} from './entity-diff-types';

/** Where a page's counts come from, when not the sum of its files'. */
export type SectionCounts = 'routes' | 'services' | 'pathways';

export interface SectionSpec {
  /** Page id; its URL segment is the id with dashes (sectionSlug). */
  id: string;
  label: string;
  /** GTFS files the page shows, in order. */
  files: string[];
  /** The analysis whose JSON the page loads. */
  analysis?: AnalysisName;
  /**
   * Counts from an analysis instead of the sum of the files': route impact
   * (stops, path, trips…), services, stations.
   */
  counts?: SectionCounts;
}

/** Section id of the pathways page. */
export const PATHWAYS_SECTION = 'pathways';

/**
 * Page id of the Service Dates page (URL segment "calendar"): it shows the
 * `services` analysis and the `services` highlight section.
 */
export const SERVICES_PAGE = 'calendar';

/** Every page, in summary order. */
export const SECTIONS: SectionSpec[] = [
  { id: 'agency', label: 'Agency', files: ['agency.txt', 'attributions.txt'] },
  {
    id: 'stops',
    label: 'Stops',
    files: ['stops.txt', 'levels.txt', 'pathways.txt'],
    analysis: 'stops',
  },
  {
    id: 'routes',
    label: 'Routes',
    files: [
      'shapes.txt',
      'routes.txt',
      'networks.txt',
      'route_networks.txt',
      'areas.txt',
      'stop_areas.txt',
    ],
    analysis: 'routes',
    counts: 'routes',
  },
  {
    id: 'trips',
    label: 'Trips',
    files: ['trips.txt', 'stop_times.txt', 'frequencies.txt'],
  },
  {
    id: SERVICES_PAGE,
    label: 'Service Dates',
    files: ['calendar.txt', 'calendar_dates.txt'],
    analysis: 'services',
    counts: 'services',
  },
  {
    id: 'fares_v1',
    label: 'Fares v1',
    files: ['fare_attributes.txt', 'fare_rules.txt'],
  },
  {
    id: 'fares_v2',
    label: 'Fares v2',
    files: [
      'fare_products.txt',
      'fare_media.txt',
      'fare_leg_rules.txt',
      'fare_leg_join_rules.txt',
      'fare_transfer_rules.txt',
      'rider_categories.txt',
      'timeframes.txt',
    ],
  },
  {
    id: 'flex',
    label: 'Flex',
    files: [
      'booking_rules.txt',
      'location_groups.txt',
      'location_group_stops.txt',
      'locations.geojson',
    ],
  },
  {
    id: 'meta',
    label: 'Meta',
    files: ['feed_info.txt', 'translations.txt', 'transfers.txt'],
  },
  {
    id: PATHWAYS_SECTION,
    label: 'Pathways and levels',
    files: ['levels.txt', 'pathways.txt'],
    counts: 'pathways',
  },
];

/** Field of EntityCategoryDiff an analysis's JSON fills. */
export const ANALYSIS_KEYS: Record<
  AnalysisName,
  NonNullable<EntityCategoryDiff['detail_key']>
> = { stops: 'stops_map', routes: 'routes_map', services: 'calendar' };

/**
 * The page a highlight section (lib/diff-layout HIGHLIGHT_SECTIONS) or an
 * analysis shows on: the page loading that analysis (services -> the
 * Service Dates page, "calendar"), else the page of the same id (trips).
 */
export function sectionPageId(section: string): string {
  return SECTIONS.find((s) => s.analysis === section)?.id ?? section;
}

function emptyCounts(): DiffCounts {
  return { added: 0, deleted: 0, modified: 0, unchanged: 0 };
}

/** A file's entity diff, as the page panels take it. */
function entityType(
  f: DiffFileEntry,
  children: DiffFileEntry[],
): EntityTypeDiff | null {
  if (f.counts == null) return null;
  return {
    file: f.file,
    primary_key: f.primary_key ?? [],
    child_files: children.map((c) => c.file),
    present: f.present,
    total: f.total ?? { base: 0, new: 0 },
    counts: f.counts,
    ...(f.id_only != null ? { id_only: f.id_only } : {}),
  };
}

/** The pages (but pathways, which reads analysis/pathways.json) from the file entries. */
export function categoriesFromFiles(doc: FilesDoc): EntityCategoryDiff[] {
  const byFile = new Map(doc.files.map((f) => [f.file, f]));
  return SECTIONS.filter((s) => s.id !== PATHWAYS_SECTION).map((s) => {
    const entries = s.files
      .map((f) => byFile.get(f))
      .filter((f): f is DiffFileEntry => f != null);
    const entityTypes = entries
      .map((f) =>
        entityType(
          f,
          doc.files.filter((c) => c.part_of === f.file),
        ),
      )
      .filter((t): t is EntityTypeDiff => t != null);
    const counts = emptyCounts();
    for (const t of entityTypes)
      for (const k of Object.keys(counts) as Array<keyof DiffCounts>)
        counts[k] += t.counts[k];
    const rawTables = entries.flatMap((f) =>
      f.raw_table ? [f.raw_table] : [],
    );
    const detail = s.analysis ? doc.analyses[s.analysis] : undefined;
    const matching = entries.find((f) => f.trip_matching)?.trip_matching;
    return {
      id: s.id,
      label: s.label,
      files: s.files,
      counts,
      entity_types: entityTypes,
      ...(rawTables.length > 0 ? { raw_tables: rawTables } : {}),
      ...(detail && s.analysis
        ? { detail, detail_key: ANALYSIS_KEYS[s.analysis] }
        : {}),
      ...(matching ? { trip_matching: matching } : {}),
    };
  });
}

/** The file entries as the pages' entity diff. */
export function entityDiffFromFiles(doc: FilesDoc): GtfsEntityDiff {
  return { metadata: doc.metadata, categories: categoriesFromFiles(doc) };
}
