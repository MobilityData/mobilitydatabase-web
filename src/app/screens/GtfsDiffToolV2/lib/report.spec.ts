import type { DiffCounts, FilesDoc, RawTable } from './entity-diff-types';
import { parseLocationHash, toFocusHash } from './diff-nav';
import {
  type ReportDoc,
  type ReportDocV2,
  type ReportDocV3,
  feedLabel,
  filesDocFromReport,
  highlightSectionLabel,
  isRequiredSection,
  pathwaysCounts,
  reportFiles,
  reportHighlights,
  reportSummary,
  sectionSlug,
} from './report';
import {
  PATHWAYS_SECTION,
  SECTIONS,
  categoriesFromFiles,
  sectionPageId,
} from './sections';
import { entityRowHref, sectionPageHref } from './highlight-links';

describe('entity page hashes', () => {
  it('round-trips a focus within the current entity', () => {
    const hash = toFocusHash({ tab: 'stops', kind: 'stop', id: 'a/b 1' });
    expect(hash).toBe('#stop/a%2Fb%201');
    expect(parseLocationHash(hash, 'stops')).toEqual({
      tab: 'stops',
      kind: 'stop',
      id: 'a/b 1',
    });
    expect(toFocusHash({ tab: 'stops' })).toBe('');
  });

  it('resolves links from the single-page version to their entity', () => {
    expect(parseLocationHash('#routes/route/M1', 'calendar')).toEqual({
      tab: 'routes',
      kind: 'route',
      id: 'M1',
    });
    expect(parseLocationHash('#trips', 'calendar')).toEqual({
      tab: 'trips',
      kind: undefined,
      id: undefined,
    });
    expect(parseLocationHash('#service-LMMJV', 'stops')).toEqual({
      tab: 'calendar',
      kind: 'service',
      id: 'LMMJV',
    });
    expect(parseLocationHash('', 'stops')).toBeNull();
  });
});

describe('report.json', () => {
  const counts = (
    added: number,
    deleted: number,
    modified: number,
    unchanged: number,
  ): DiffCounts => ({ added, deleted, modified, unchanged });
  const both = { base: true, new: true };
  const files: FilesDoc = {
    schema: 1,
    metadata: {} as FilesDoc['metadata'],
    analyses: {},
    files: [
      { file: 'stops.txt', present: both, counts: counts(2, 1, 2, 9) },
      {
        file: 'pathways.txt',
        present: { base: false, new: true },
        counts: counts(1, 0, 0, 1),
      },
      { file: 'routes.txt', present: both, counts: counts(0, 1, 1, 8) },
      { file: 'trips.txt', present: both, counts: counts(5, 0, 1, 2) },
      {
        file: 'stop_times.txt',
        present: both,
        part_of: 'trips.txt',
        raw_table: {
          counts: { ...counts(50, 0, 3, 20), id_only: 4 },
        } as RawTable,
      },
      {
        file: 'calendar.txt',
        present: both,
        raw_table: {
          counts: { ...counts(1, 0, 2, 3), id_only: 0 },
        } as RawTable,
      },
    ],
  };
  const doc: ReportDocV3 = {
    schema: 3,
    dataset: 'd',
    generated_at: 't',
    feeds: { base: null, new: null },
    files: reportFiles(files),
    // Route impact and services, not the files' rows.
    analyses: { routes: counts(0, 1, 4, 5), services: counts(1, 2, 3, 0) },
  };

  it('counts each file by its key, else by its raw rows', () => {
    expect(
      doc.files.map((f) => [f.file, f.present, f.part_of ?? null]),
    ).toEqual([
      ['stops.txt', true, null],
      ['pathways.txt', true, null],
      ['routes.txt', true, null],
      ['trips.txt', true, null],
      ['stop_times.txt', true, 'trips.txt'],
      ['calendar.txt', true, null],
    ]);
    expect(doc.files.find((f) => f.file === 'stop_times.txt')?.counts).toEqual({
      ...counts(50, 0, 3, 20),
      id_only: 4,
    });
  });

  it('groups files into the pages, with analysis counts where pages use them', () => {
    const sections = reportSummary(doc).sections;
    const byId = new Map(sections.map((x) => [x.id, x]));
    expect(sections.map((x) => x.id)).toEqual(
      SECTIONS.filter((x) => x.id !== PATHWAYS_SECTION).map((x) => x.id),
    );
    // Stops: its files' sum.
    expect(byId.get('stops')?.counts).toEqual(counts(3, 1, 2, 10));
    expect(byId.get('stops')?.present_files).toEqual([
      'stops.txt',
      'pathways.txt',
    ]);
    // Routes and Service Dates: their analyses' (routes, services).
    expect(byId.get('routes')?.counts).toEqual(counts(0, 1, 4, 5));
    expect(byId.get('calendar')?.count).toBe(6);
    // Trips: stop_times.txt counts inside trips.txt.
    expect(byId.get('trips')?.counts).toEqual(counts(5, 0, 1, 2));
    expect(byId.get('fares_v2')?.present).toBe(false);
  });

  it('adds the pathways page when pathways were diffed', () => {
    const withPathways: ReportDocV3 = {
      ...doc,
      analyses: {
        ...doc.analyses,
        pathways: pathwaysCounts({
          stations: [{ status: 'modified' }, { status: 'added' }],
          unchanged_station_ids: ['a', 'b', 'c'],
        }),
      },
    };
    const last = reportSummary(withPathways).sections.at(-1);
    expect(last).toMatchObject({
      id: 'pathways',
      slug: 'pathways',
      count: 2,
      counts: counts(1, 0, 1, 3),
      files: ['levels.txt', 'pathways.txt'],
    });
    expect(sectionSlug('fares_v1')).toBe('fares-v1');
  });

  it('shows the services analysis and highlights on the Service Dates page', () => {
    expect(sectionPageId('services')).toBe('calendar');
    expect(sectionPageId('stops')).toBe('stops');
    expect(sectionPageId('trips')).toBe('trips');
    const summary = reportSummary(doc);
    expect(highlightSectionLabel(summary, 'services')).toBe('Service Dates');
    expect(highlightSectionLabel(summary, 'unknown')).toBe('unknown');
    expect(sectionPageHref('d', 'services')).toBe(
      '/gtfs-diff-tool-v2/d/calendar',
    );
    expect(
      entityRowHref('d', 'services', 'service', {
        id: 'S1',
        label: 'S1',
        note: '',
      }),
    ).toBe('/gtfs-diff-tool-v2/d/calendar/S1');
  });

  it('reads schema 4: the full file entries and each analysis with its file', () => {
    const v4: ReportDoc = {
      schema: 4,
      dataset: 'd',
      generated_at: 't',
      feeds: { base: null, new: null },
      metadata: files.metadata,
      files: files.files,
      analyses: {
        stops: { file: 'analysis/stops.json', counts: counts(3, 1, 2, 10) },
        routes: { file: 'analysis/routes.json', counts: counts(0, 1, 4, 5) },
        services: {
          file: 'analysis/services.json',
          counts: counts(1, 2, 3, 0),
        },
      },
    };
    // The same pages as the schema 3 report of the same diff.
    expect(reportSummary(v4).sections).toEqual(reportSummary(doc).sections);
    // The pages' entity diff reads the entries and the analyses' files.
    expect(filesDocFromReport(v4)).toEqual({
      schema: 1,
      metadata: files.metadata,
      files: files.files,
      analyses: {
        stops: 'analysis/stops.json',
        routes: 'analysis/routes.json',
        services: 'analysis/services.json',
      },
    });
    // Feeds come with the report step; until then the header has none.
    const { feeds: _f, ...noFeeds } = v4;
    expect(reportSummary(noFeeds).feeds).toEqual({ base: null, new: null });
  });

  it('still reads schema 2 reports and passes summaries through', () => {
    const v2: ReportDocV2 = {
      schema: 2,
      dataset: 'd',
      generated_at: 't',
      feeds: { base: null, new: null },
      files: [
        {
          file: 'stops.txt',
          group: 'stops',
          present: true,
          counts: counts(1, 0, 0, 1),
        },
      ],
      groups: [{ id: 'stops', label: 'Stops', present: true }],
    };
    expect(reportSummary(v2).sections).toEqual([
      {
        id: 'stops',
        slug: 'stops',
        label: 'Stops',
        count: 1,
        counts: counts(1, 0, 0, 1),
        files: ['stops.txt'],
        present_files: ['stops.txt'],
        present: true,
      },
    ]);
    const summary = reportSummary(doc);
    expect(reportSummary(summary)).toBe(summary);
  });

  it("surfaces the calendar's most severe highlights as a fallback", () => {
    expect(
      reportHighlights({
        highlights: [
          { severity: 'info', title: 'i' },
          { severity: 'warning', title: 'w', detail: 'd' },
          { severity: 'error', title: 'e' },
          { severity: 'success', title: 's' },
        ],
      }),
    ).toEqual({
      counts: { error: 1, warning: 1, success: 1, info: 1 },
      top: [
        { section: 'services', severity: 'error', title: 'e' },
        { section: 'services', severity: 'warning', title: 'w', detail: 'd' },
      ],
    });
  });

  it('labels feeds by publisher and service period', () => {
    expect(
      feedLabel({
        file: 'a.zip',
        publisher: 'STM',
        start: '20251103',
        end: '20260104',
      }),
    ).toBe('STM · 3 Nov 2025 – 4 Jan 2026');
    expect(feedLabel({ file: 'a.zip' })).toBe('a.zip');
    expect(feedLabel(null)).toBe('unknown feed');
  });

  it('keeps sections GTFS requires, drops optional ones', () => {
    expect(
      isRequiredSection({ files: ['calendar.txt', 'calendar_dates.txt'] }),
    ).toBe(true);
    expect(
      isRequiredSection({ files: ['fare_products.txt', 'fare_media.txt'] }),
    ).toBe(false);
  });
});

describe('pages from files.json', () => {
  const both = { base: true, new: true };
  const doc: FilesDoc = {
    schema: 1,
    metadata: {} as FilesDoc['metadata'],
    analyses: {
      stops: 'analysis/stops.json',
      services: 'analysis/services.json',
    },
    files: [
      {
        file: 'stops.txt',
        present: both,
        primary_key: ['stop_id'],
        total: { base: 3, new: 4 },
        counts: { added: 1, deleted: 0, modified: 1, unchanged: 2 },
        raw_table: { file: 'stops.txt' } as RawTable,
      },
      {
        file: 'trips.txt',
        present: both,
        primary_key: ['trip_id'],
        total: { base: 2, new: 2 },
        counts: { added: 0, deleted: 0, modified: 1, unchanged: 1 },
        raw_table: { file: 'trips.txt' } as RawTable,
        trip_matching: { mapped: 2, renamed: 1, base_trips: 2, new_trips: 2 },
      },
      {
        file: 'stop_times.txt',
        present: both,
        part_of: 'trips.txt',
        raw_table: { file: 'stop_times.txt' } as RawTable,
      },
      {
        file: 'calendar.txt',
        present: both,
        raw_table: { file: 'calendar.txt' } as RawTable,
      },
    ],
  };
  const pages = new Map(categoriesFromFiles(doc).map((c) => [c.id, c]));

  it('groups the files into every page but pathways', () => {
    expect([...pages.keys()]).toEqual(
      SECTIONS.filter((x) => x.id !== PATHWAYS_SECTION).map((x) => x.id),
    );
    expect(pages.get('fares_v1')?.entity_types).toEqual([]);
  });

  it("gives each page its files' counts, raw tables and analysis", () => {
    const stops = pages.get('stops');
    expect(stops?.entity_types?.map((t) => t.file)).toEqual(['stops.txt']);
    expect(stops?.raw_tables?.map((t) => t.file)).toEqual(['stops.txt']);
    expect(stops).toMatchObject({
      detail: 'analysis/stops.json',
      detail_key: 'stops_map',
    });
    const trips = pages.get('trips');
    expect(trips?.entity_types?.[0].child_files).toEqual(['stop_times.txt']);
    expect(trips?.raw_tables?.map((t) => t.file)).toEqual([
      'trips.txt',
      'stop_times.txt',
    ]);
    expect(trips?.trip_matching?.renamed).toBe(1);
    // Calendar files have raw rows only; the services analysis counts services
    // and fills the Service Dates page's `calendar` field.
    expect(pages.get('calendar')).toMatchObject({
      entity_types: [],
      detail: 'analysis/services.json',
      detail_key: 'calendar',
    });
    expect(pages.get('routes')?.detail).toBeUndefined();
  });
});
