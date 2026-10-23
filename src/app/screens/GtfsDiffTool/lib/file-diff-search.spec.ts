import type { FileDiff } from './gtfs-diff-types';
import { countRows, searchFileDiff, searchFileDiffs } from './file-diff-search';

const stops: FileDiff = {
  file_name: 'stops.txt',
  file_action: 'modified',
  row_changes: {
    primary_key: ['stop_id'],
    columns: ['stop_id', 'stop_name'],
    added: [
      {
        identifier: { stop_id: '01-01' },
        raw_value: '01-01,Station Henri-Bourassa - Accès rue Berri',
        new_line_number: 2,
      },
    ],
    deleted: [
      {
        identifier: { stop_id: '52000' },
        raw_value: '52000,Sauvé / Saint-Laurent',
        base_line_number: 9,
      },
    ],
    modified: [
      {
        identifier: { stop_id: '51001' },
        raw_value: '51001,Old name',
        base_line_number: 3,
        new_line_number: 3,
        field_changes: [
          { field: 'stop_name', base_value: 'Old name', new_value: 'Montréal' },
        ],
      },
    ],
  },
};
const levels: FileDiff = { file_name: 'levels.txt', file_action: 'added' };

describe('searchFileDiffs', () => {
  it('returns everything for an empty query', () => {
    expect(searchFileDiffs([stops, levels], '  ')).toEqual([stops, levels]);
    expect(countRows([stops])).toBe(3);
  });

  it('matches identifiers, values and field changes, ignoring case and accents', () => {
    expect(countRows(searchFileDiffs([stops], 'berri'))).toBe(1);
    expect(countRows(searchFileDiffs([stops], 'SAUVE'))).toBe(1);
    expect(countRows(searchFileDiffs([stops], 'montreal'))).toBe(1);
    expect(countRows(searchFileDiffs([stops], '510'))).toBe(1);
  });

  it('drops files with no matching row, keeping file names searchable', () => {
    expect(searchFileDiffs([stops, levels], 'nothing here')).toEqual([]);
    expect(searchFileDiffs([stops, levels], 'levels')).toEqual([levels]);
  });

  it('keeps a single file even when no row matches', () => {
    const found = searchFileDiff(stops, 'nothing here');
    expect(found.file_name).toBe('stops.txt');
    expect(countRows([found])).toBe(0);
    expect(searchFileDiff(stops, '')).toBe(stops);
  });

  it('does not modify the input', () => {
    const before = JSON.stringify(stops);
    searchFileDiffs([stops], 'berri');
    expect(JSON.stringify(stops)).toBe(before);
  });
});
