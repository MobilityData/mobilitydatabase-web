'use client';

import type { RawDiffFilters, RawDiffRow, RawDiffSort } from './raw-diff-query';
import { fetchRawDiffRows } from './useRawDiffRows';
import { type SegmentCache, useSegmentedRows } from './useSegmentedRows';

export type { SegmentCache };

interface SegmentCacheArgs {
  datasetId: string;
  file: string;
  filters: RawDiffFilters;
  sort: RawDiffSort | null;
  segmentRows: number;
}

/**
 * Row segments of one raw table query, fetched on demand for the
 * infinite-scroll table (see useSegmentedRows).
 */
export function useSegmentedRawRows({
  datasetId,
  file,
  filters,
  sort,
  segmentRows,
}: SegmentCacheArgs): SegmentCache<RawDiffRow> {
  const queryKey = JSON.stringify([
    datasetId,
    file,
    filters,
    sort,
    segmentRows,
  ]);
  // Read through a ref by useSegmentedRows: no need to memoize.
  const fetchRows = (offset: number, limit: number): Promise<RawDiffRow[]> =>
    fetchRawDiffRows({ datasetId, file, filters, sort, offset, limit });
  return useSegmentedRows({ queryKey, segmentRows, fetchRows });
}
