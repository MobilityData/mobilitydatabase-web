'use client';

import {
  Box,
  Chip,
  Collapse,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import React, { useEffect, useRef, useState } from 'react';
import type { RowAction } from '../../../GtfsDiffTool/components/GtfsDiffFileDiffPanel';
import type { RawTable } from '../../lib/entity-diff-types';
import { MONO_FONT } from '../calendar/shared';
import RawDiffTable from './RawDiffTable';

/** The raw file diff's colours (GtfsDiffFileDiffPanel). */
const COLORS = { added: '#2e7d32', deleted: '#d32f2f', modified: '#ed6c02' };

/**
 * The column a raw table's trip_key holds: the first key column of a keyed
 * file (null when the file has no key), else trip_id (shape_id for
 * shapes.txt).
 */
export function rawKeyLabel(table: RawTable): string | null {
  if (table.key_columns != null) return table.key_columns[0] ?? null;
  return (
    table.key_column ?? (table.file === 'shapes.txt' ? 'shape_id' : 'trip_id')
  );
}

/**
 * One file of the raw file diff (raw/<file>.parquet): a collapsed card over
 * the paged row table.
 */
export default function RawFileDiffCard({
  datasetId,
  table,
  defaultOpen = false,
  rowAction,
  focus = null,
}: {
  datasetId: string;
  table: RawTable;
  defaultOpen?: boolean;
  /** An action on each row (e.g. "See on map"), for the files it lists. */
  rowAction?: RowAction;
  /**
   * A row to show: opens the card scrolled into view, its rows filtered to
   * the key. A new nonce shows it again.
   */
  focus?: { id: string; nonce: number } | null;
}): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus == null) return;
    setOpen(true);
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus?.nonce]);
  const { added, deleted, modified } = table.counts;
  const changed = added + deleted + modified > 0;
  const columnChanges = [
    ...(table.columns_added ?? []).map((c) => `+${c}`),
    ...(table.columns_deleted ?? []).map((c) => `−${c}`),
  ];
  return (
    <Box
      ref={cardRef}
      sx={{
        scrollMarginTop: 96,
        bgcolor: 'background.paper',
        borderRadius: '6px',
        mb: 2,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 1.5,
          flexWrap: 'wrap',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <Typography
          variant='body1'
          fontWeight={700}
          sx={{ fontFamily: MONO_FONT }}
        >
          {table.file}
        </Typography>
        {changed || columnChanges.length > 0 ? (
          <Chip
            label='MODIFIED'
            size='small'
            sx={{
              bgcolor: COLORS.modified,
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.65rem',
            }}
          />
        ) : null}
        {added > 0 ? (
          <Typography variant='caption' sx={{ color: COLORS.added }}>
            +{added.toLocaleString()} rows
          </Typography>
        ) : null}
        {deleted > 0 ? (
          <Typography variant='caption' sx={{ color: COLORS.deleted }}>
            −{deleted.toLocaleString()} rows
          </Typography>
        ) : null}
        {modified > 0 ? (
          <Typography variant='caption' sx={{ color: COLORS.modified }}>
            ~{modified.toLocaleString()} rows
          </Typography>
        ) : null}
        {columnChanges.length > 0 ? (
          <Typography
            variant='caption'
            color='text.secondary'
            sx={{ fontFamily: MONO_FONT }}
          >
            columns {columnChanges.join(', ')}
          </Typography>
        ) : null}
        <Tooltip title={open ? 'Collapse' : 'Expand'}>
          <IconButton
            size='small'
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${table.file}`}
            sx={{ p: 0.25, ml: 'auto' }}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
          >
            {open ? (
              <ExpandLess sx={{ fontSize: '1rem' }} />
            ) : (
              <ExpandMore sx={{ fontSize: '1rem' }} />
            )}
          </IconButton>
        </Tooltip>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ p: 2 }}>
          <RawDiffTable
            // Filters only apply on first render: remount for a new focus.
            key={focus?.nonce ?? 0}
            datasetId={datasetId}
            initialFilters={focus ? { tripId: focus.id } : undefined}
            file={table.file}
            keyLabel={rawKeyLabel(table)}
            routeColumn={table.key_columns == null && table.key_column == null}
            rowAction={rowAction}
          />
        </Box>
      </Collapse>
    </Box>
  );
}
