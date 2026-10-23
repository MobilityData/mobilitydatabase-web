/**
 * @jest-environment node
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  DIFF_DATA_DIR,
  getDiffDataset,
  listDiffDatasets,
} from './gtfs-diff-datasets';
import { datasetLabel } from '../app/screens/GtfsDiffToolV2/lib/datasets';

jest.mock('server-only', () => ({}));

describe('listDiffDatasets', () => {
  it('lists every finished folder in data/v2 (one with a manifest)', () => {
    const folders = readdirSync(DIFF_DATA_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      // A folder still being built has no manifest.json yet.
      .filter((f) => existsSync(join(DIFF_DATA_DIR, f, 'manifest.json')))
      .sort();
    expect(listDiffDatasets().map((d) => d.id)).toEqual(folders);
  });

  it('reports which diff files each dataset has', () => {
    expect(getDiffDataset('direxis')?.files.entity).toBe(true);
    expect(getDiffDataset('mbta-pathways-demo')?.files).toEqual({
      entity: false,
      trips: false,
      pathways: true,
    });
  });

  it('rejects ids that could escape the data folder', () => {
    expect(getDiffDataset('../v1')).toBeNull();
    expect(getDiffDataset('does-not-exist')).toBeNull();
  });
});

describe('datasetLabel', () => {
  it('adds the Mobility Database id found in the feed zip names', () => {
    expect(
      datasetLabel('direxis', [
        'base-mdb-2775-202608070145.zip',
        'new-mdb-2775-202609020046.zip',
      ]),
    ).toBe('direxis · mdb-2775');
    expect(datasetLabel('mbta-pathways-demo', ['base.zip'])).toBe(
      'mbta-pathways-demo',
    );
  });
});
