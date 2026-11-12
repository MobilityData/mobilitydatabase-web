'use client';

import { Box, Button, Typography } from '@mui/material';
import React, { useState } from 'react';
import type { EntityCategoryDiff, RawTable } from '../../lib/entity-diff-types';
import { RAW_DIFF_ID } from '../diffmap/DiffMapControls';
import RawTablesSection from '../raw/RawTablesSection';
import { ALL_DATES, V2Card } from './shared';

interface RawDiffSectionProps {
  datasetId: string;
  /** Full row diffs as Parquet, queried with DuckDB-WASM. */
  rawTables: RawTable[];
  tripMatching?: EntityCategoryDiff['trip_matching'];
  /** Route the page is focused on, to scope the rows. */
  routeId: string | null;
  /** "24", for the scope toggle. */
  routeLabel: string | null;
}

/**
 * Row-level diff of the trip files at the bottom of the page: DuckDB over
 * the Parquet row tables (millions of stop_times rows).
 */
export default function RawDiffSection({
  datasetId,
  rawTables,
  tripMatching,
  routeId,
  routeLabel,
}: RawDiffSectionProps): React.ReactElement {
  const [wholeFeed, setWholeFeed] = useState(false);
  const scoped = routeId != null && !wholeFeed;

  return (
    <V2Card
      id={RAW_DIFF_ID}
      title='Raw file diff'
      scope={ALL_DATES}
      caption={
        rawTables.length > 0
          ? `Row by row changes to the trip files${scoped ? ` for route ${routeLabel ?? routeId}` : ' across the whole feed'}, on every day the feeds cover, not only this one.`
          : 'Row by row changes to trips.txt, stop_times.txt and frequencies.txt across the whole feed, not only this day.'
      }
      actions={
        rawTables.length > 0 && routeId != null ? (
          <Button
            size='small'
            variant='outlined'
            color='inherit'
            onClick={() => setWholeFeed((v) => !v)}
            sx={{ textTransform: 'none', borderColor: 'divider' }}
          >
            {scoped
              ? 'Show the whole feed'
              : `Only route ${routeLabel ?? routeId}`}
          </Button>
        ) : null
      }
    >
      {rawTables.length > 0 ? (
        <Box>
          <RawTablesSection
            // Filters only apply on first render: remount when the scope changes.
            key={scoped ? `route:${routeId}` : 'all'}
            datasetId={datasetId}
            tables={rawTables}
            initialFilters={scoped ? { routeId } : undefined}
            note={
              tripMatching ? (
                <>
                  Trips are joined by what they are, not by trip_id:{' '}
                  {tripMatching.mapped.toLocaleString()} of{' '}
                  {tripMatching.base_trips.toLocaleString()} base trips were
                  matched to a new trip ({tripMatching.renamed.toLocaleString()}{' '}
                  renumbered). Rows whose only differences are identifiers are
                  “ID only”, not changes.
                </>
              ) : undefined
            }
          />
        </Box>
      ) : (
        <Typography variant='body2' color='text.secondary'>
          No row-level changes in the trip files.
        </Typography>
      )}
    </V2Card>
  );
}
