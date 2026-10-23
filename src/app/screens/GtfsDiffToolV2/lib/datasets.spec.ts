import {
  type DiffManifest,
  datasetFromManifest,
  diffBaseUrl,
  diffFileUrl,
} from './datasets';
import { entityChangesQueries, toEntityChange } from './useEntityChanges';

describe('diff file URLs', () => {
  const env = process.env.NEXT_PUBLIC_GTFS_DIFF_BASE_URL;
  afterEach(() => {
    if (env == null) delete process.env.NEXT_PUBLIC_GTFS_DIFF_BASE_URL;
    else process.env.NEXT_PUBLIC_GTFS_DIFF_BASE_URL = env;
  });

  it("defaults to this app's API", () => {
    delete process.env.NEXT_PUBLIC_GTFS_DIFF_BASE_URL;
    expect(diffBaseUrl()).toBe('/api/gtfs-diff-v2');
    expect(diffFileUrl('mbta', 'raw/stop_times.parquet')).toBe(
      '/api/gtfs-diff-v2/mbta/raw/stop_times.parquet',
    );
  });

  it('points at a bucket or CDN when configured', () => {
    process.env.NEXT_PUBLIC_GTFS_DIFF_BASE_URL =
      'https://diffs.example.org/v1/';
    expect(diffFileUrl('job 42', 'trips/base.parquet')).toBe(
      'https://diffs.example.org/v1/job%2042/trips/base.parquet',
    );
  });
});

describe('manifest', () => {
  it('describes a dataset from its file list', () => {
    const m: DiffManifest = {
      schema: 1,
      id: 'mbta',
      label: 'mbta · mdb-437',
      generated_at: '',
      feeds: { base: { file: 'base.zip' }, new: { file: 'new.zip' } },
      files: {
        'entity-diff.json': { bytes: 1 },
        'trips-diff.json': { bytes: 1 },
        'trips/base.parquet': { bytes: 1 },
      },
    };
    expect(datasetFromManifest(m)).toEqual({
      id: 'mbta',
      label: 'mbta · mdb-437',
      files: { entity: true, trips: true, pathways: false },
      feeds: ['base.zip', 'new.zip'],
    });
  });
});

describe('entity change tables', () => {
  it('pages one status at a time, bound as a parameter', () => {
    expect(entityChangesQueries('raw_2', 'modified', 50, 25)).toEqual({
      page: 'SELECT * FROM "raw_2" WHERE status = ? ORDER BY ord LIMIT 25 OFFSET 50',
      count: 'SELECT count(*)::INTEGER AS n FROM "raw_2" WHERE status = ?',
      params: ['modified'],
    });
    expect(entityChangesQueries('raw_2', null, 0, 25).params).toEqual([]);
    expect(() => entityChangesQueries('x;y', null, 0, 1)).toThrow();
  });

  it('reads the JSON columns back', () => {
    expect(
      toEntityChange({
        key: 't1',
        status: 'modified',
        label: null,
        context: '{"route_id":"1"}',
        field_changes: null,
        children: '{"stop_times.txt":{"added":1,"deleted":0,"modified":2}}',
      }),
    ).toEqual({
      key: 't1',
      status: 'modified',
      label: undefined,
      context: { route_id: '1' },
      field_changes: undefined,
      children: { 'stop_times.txt': { added: 1, deleted: 0, modified: 2 } },
    });
  });
});
