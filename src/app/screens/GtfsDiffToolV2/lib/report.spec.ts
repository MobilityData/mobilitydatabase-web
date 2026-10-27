import type { EntityCategoryDiff, GtfsEntityDiff } from './entity-diff-types';
import { parseLocationHash, toFocusHash } from './diff-nav';
import {
  feedLabel,
  isRequiredSection,
  presentFiles,
  reportHighlights,
  reportSections,
  sectionSlug,
} from './report';

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

describe('report sections', () => {
  const entity = {
    categories: [
      {
        id: 'agency',
        label: 'Agency',
        files: [],
        counts: { added: 0, deleted: 0, modified: 0, unchanged: 1 },
        entity_types: [{}],
      },
      {
        id: 'calendar',
        label: 'Service calendar',
        files: [],
        counts: { added: 1, deleted: 2, modified: 3, unchanged: 0 },
        calendar: { present: { base: ['calendar.txt'], new: [] } },
      },
      {
        id: 'fares_v2',
        label: 'Fares v2',
        files: [],
        counts: { added: 0, deleted: 0, modified: 0, unchanged: 0 },
        entity_types: [],
      },
    ],
  } as unknown as GtfsEntityDiff;

  it('lists categories with slugs and counts, then pathways', () => {
    const sections = reportSections(entity, {
      stations: [{ status: 'modified' }, { status: 'added' }],
      unchanged_station_ids: ['a', 'b', 'c'],
    });
    expect(sections.map((s) => [s.slug, s.count, s.present])).toEqual([
      ['agency', 0, true],
      ['calendar', 6, true],
      ['fares-v2', 0, false],
      ['pathways', 2, true],
    ]);
    expect(sections[1].counts).toEqual({
      added: 1,
      deleted: 2,
      modified: 3,
      unchanged: 0,
    });
    expect(sections[3].counts).toEqual({
      added: 1,
      deleted: 0,
      modified: 1,
      unchanged: 3,
    });
    expect(sectionSlug('fares_v1')).toBe('fares-v1');
  });

  it('surfaces the most severe calendar highlights', () => {
    const withHighlights = {
      categories: [
        {
          id: 'calendar',
          calendar: {
            highlights: [
              { severity: 'info', title: 'i' },
              { severity: 'warning', title: 'w', detail: 'd' },
              { severity: 'error', title: 'e' },
              { severity: 'success', title: 's' },
            ],
          },
        },
      ],
    } as unknown as GtfsEntityDiff;
    expect(reportHighlights(withHighlights)).toEqual({
      counts: { error: 1, warning: 1, success: 1, info: 1 },
      top: [
        { section: 'calendar', severity: 'error', title: 'e' },
        { section: 'calendar', severity: 'warning', title: 'w', detail: 'd' },
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
});

describe('files in the summary', () => {
  it('lists only the files a feed has, in the category order', () => {
    const c = {
      id: 'stops',
      files: ['stops.txt', 'levels.txt', 'pathways.txt'],
      entity_types: [
        {
          file: 'stops.txt',
          present: { base: true, new: true },
          child_files: [],
        },
        {
          file: 'pathways.txt',
          present: { base: false, new: true },
          child_files: [],
        },
      ],
    } as unknown as EntityCategoryDiff;
    expect(presentFiles(c)).toEqual(['stops.txt', 'pathways.txt']);
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
