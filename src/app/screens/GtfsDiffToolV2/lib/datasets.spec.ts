import {
  type DiffManifest,
  datasetFromManifest,
  diffBaseUrl,
  diffFileUrl,
  isWholeDownloadFile,
} from './datasets';

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
    expect(diffFileUrl('job 42', 'views/trips/base.parquet')).toBe(
      'https://diffs.example.org/v1/job%2042/views/trips/base.parquet',
    );
  });
});

describe('isWholeDownloadFile', () => {
  it('downloads the analysis tables whole, not the raw or trips ones', () => {
    const url = (path: string): string => diffFileUrl('idfm', path);
    expect(isWholeDownloadFile(url('analysis/shapes.parquet'))).toBe(true);
    expect(isWholeDownloadFile(url('analysis/routes.parquet') + '?v=2')).toBe(
      true,
    );
    expect(isWholeDownloadFile(url('analysis/service_dates.parquet'))).toBe(
      true,
    );
    expect(isWholeDownloadFile(url('raw/shapes.parquet'))).toBe(false);
    expect(isWholeDownloadFile(url('views/trips/base.parquet'))).toBe(false);
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
        'report.json': { bytes: 1 },
        'views/trips/index.json': { bytes: 1 },
        'views/trips/base.parquet': { bytes: 1 },
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
