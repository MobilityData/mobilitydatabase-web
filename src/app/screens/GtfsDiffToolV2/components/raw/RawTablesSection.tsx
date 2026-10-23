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
import React, { useState } from 'react';
import type { RawTable } from '../../lib/entity-diff-types';
import RawDiffTable, { type RawDiffTableProps } from './RawDiffTable';
import { RAW_COLORS } from './raw-colors';

const MONO = 'var(--font-ibm-plex-mono)';

interface RawTablesSectionProps {
  datasetId: string;
  tables: RawTable[];
  /** Shown above the files, e.g. how trips were matched. */
  note?: React.ReactNode;
  initialFilters?: RawDiffTableProps['initialFilters'];
}

/** Rows changed relative to the larger of the two versions, as in the file diff panel. */
function changedPercent(t: RawTable): number {
  const changed = t.counts.added + t.counts.deleted + t.counts.modified;
  const base = t.rows - t.counts.added;
  const next = t.rows - t.counts.deleted;
  return Math.round((changed / Math.max(base, next, 1)) * 10000) / 100;
}

/** One file, as a card like the file diff panel's (header, then the table). */
function RawFileCard({
  datasetId,
  table,
  defaultOpen,
  initialFilters,
}: {
  datasetId: string;
  table: RawTable;
  defaultOpen: boolean;
  initialFilters?: RawDiffTableProps['initialFilters'];
}): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  const c = table.counts;
  const changed = c.added + c.deleted + c.modified;
  const pct = changedPercent(table);
  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        borderRadius: '6px',
        mb: 2,
        overflow: 'hidden',
      }}
    >
      <Box
        onClick={() => setOpen((o) => !o)}
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
      >
        <Typography variant='body1' fontWeight={700} sx={{ fontFamily: MONO }}>
          {table.file}
        </Typography>
        <Chip
          label={changed > 0 ? 'MODIFIED' : 'UNCHANGED'}
          size='small'
          sx={{
            bgcolor: changed > 0 ? RAW_COLORS.modified : RAW_COLORS.idOnly,
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.65rem',
          }}
        />
        {c.added > 0 ? (
          <Typography variant='caption' sx={{ color: RAW_COLORS.added }}>
            +{c.added.toLocaleString()} rows
          </Typography>
        ) : null}
        {c.deleted > 0 ? (
          <Typography variant='caption' sx={{ color: RAW_COLORS.deleted }}>
            −{c.deleted.toLocaleString()} rows
          </Typography>
        ) : null}
        {c.modified > 0 ? (
          <Typography variant='caption' sx={{ color: RAW_COLORS.modified }}>
            ~{c.modified.toLocaleString()} rows
          </Typography>
        ) : null}
        {c.id_only > 0 ? (
          <Tooltip title='Same rows with renumbered identifiers; not counted as changes'>
            <Typography variant='caption' color='text.secondary'>
              {c.id_only.toLocaleString()} ID only
            </Typography>
          </Tooltip>
        ) : null}
        {pct > 0 ? (
          <Chip
            label={`${pct}% rows changed`}
            size='small'
            variant='outlined'
            sx={{ fontSize: '0.65rem' }}
          />
        ) : null}
        <Tooltip title={open ? 'Collapse' : 'Expand'}>
          <IconButton
            size='small'
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
      {/* Mounted on first open, so DuckDB only reads files being looked at. */}
      <Collapse in={open} unmountOnExit>
        <Box sx={{ p: 2 }}>
          <RawDiffTable
            datasetId={datasetId}
            file={table.file}
            initialFilters={initialFilters}
          />
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * The raw file diff of files with a full row table (Parquet + DuckDB-WASM),
 * laid out like the file diff panel: one card per file, the first open.
 */
export default function RawTablesSection({
  datasetId,
  tables,
  note,
  initialFilters,
}: RawTablesSectionProps): React.ReactElement {
  return (
    <Box>
      {note ? (
        <Typography
          variant='body2'
          color='text.secondary'
          component='div'
          sx={{ mb: 1.5 }}
        >
          {note}
        </Typography>
      ) : null}
      {tables.map((t, i) => (
        <RawFileCard
          key={t.file}
          datasetId={datasetId}
          table={t}
          defaultOpen={i === 0}
          initialFilters={initialFilters}
        />
      ))}
    </Box>
  );
}
