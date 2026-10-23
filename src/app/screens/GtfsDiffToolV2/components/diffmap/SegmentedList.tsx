'use client';

import { Box, LinearProgress, List, Typography } from '@mui/material';
import React from 'react';
import { useSegmentedRows } from '../../lib/useSegmentedRows';
import { useSegmentWindow } from '../../lib/useSegmentWindow';

/** Rows fetched per request while scrolling. */
const SEGMENT_ROWS = 100;

interface SegmentedListProps<T> {
  /** Identifies the query (table + filters); a new key starts at the top. */
  queryKey: string;
  /** Rows matching the query. */
  total: number;
  /** Rows [offset, offset + limit) of the query. */
  fetchRows: (offset: number, limit: number) => Promise<T[]>;
  rowKey: (row: T) => string;
  renderRow: (row: T) => React.ReactNode;
  emptyText: string;
  loading?: boolean;
}

/**
 * A long list read from Parquet a segment at a time, with the raw diff
 * table's infinite scroll and windowing (useSegmentedRows +
 * useSegmentWindow): only the rows near the view are in the DOM. Fills its
 * parent's height (the parent must be a flex column with a bounded height).
 */
export default function SegmentedList<T>({
  queryKey,
  total,
  fetchRows,
  rowKey,
  renderRow,
  emptyText,
  loading = false,
}: SegmentedListProps<T>): React.ReactElement {
  const cache = useSegmentedRows({
    queryKey,
    segmentRows: SEGMENT_ROWS,
    fetchRows,
  });
  const view = useSegmentWindow({ cache, total, segmentRows: SEGMENT_ROWS });

  return (
    <Box
      sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <Box sx={{ height: 2 }}>
        {loading ? <LinearProgress sx={{ height: 2 }} /> : null}
      </Box>
      <Box
        ref={view.scrollRef}
        onScroll={view.onScroll}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          // Restoring a segment in place of its spacer must not move the view.
          overflowAnchor: 'none',
        }}
      >
        {cache.error != null ? (
          <Typography color='error' variant='body2' sx={{ py: 1 }}>
            Could not load the list: {cache.error.message}
          </Typography>
        ) : total === 0 && !loading ? (
          <Typography color='text.secondary' variant='body2' sx={{ py: 1 }}>
            {emptyText}
          </Typography>
        ) : (
          <List dense disablePadding>
            {view.topSpacer > 0 ? (
              <Box aria-hidden sx={{ height: view.topSpacer }} />
            ) : null}
            {view.rendered.map((seg) => {
              const rows = cache.segments.get(seg);
              if (rows == null)
                return (
                  <Box
                    key={seg}
                    sx={{ height: view.heightOf(seg), py: 1, px: 0.5 }}
                  >
                    <Typography variant='caption' color='text.secondary'>
                      Loading {(seg * SEGMENT_ROWS + 1).toLocaleString()}–
                      {Math.min(
                        total,
                        (seg + 1) * SEGMENT_ROWS,
                      ).toLocaleString()}
                      …
                    </Typography>
                  </Box>
                );
              return (
                <Box key={seg} ref={view.segmentRef(seg)}>
                  {rows.map((r) => (
                    <React.Fragment key={rowKey(r)}>
                      {renderRow(r)}
                    </React.Fragment>
                  ))}
                </Box>
              );
            })}
            {view.bottomSpacer > 0 ? (
              <Box aria-hidden sx={{ height: view.bottomSpacer }} />
            ) : null}
          </List>
        )}
      </Box>
    </Box>
  );
}
