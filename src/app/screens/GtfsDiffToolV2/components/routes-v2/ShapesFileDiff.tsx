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
import { MONO_FONT } from '../calendar/shared';
import RawDiffTable from '../raw/RawDiffTable';

/** The raw file diff's colours (GtfsDiffFileDiffPanel). */
const COLORS = { added: '#2e7d32', deleted: '#d32f2f', modified: '#ed6c02' };

/**
 * shapes.txt in the raw file diff: a collapsed card like the other files',
 * over its Parquet row table (too large for the JSON file diffs).
 */
export default function ShapesFileDiff({
  datasetId,
  table,
}: {
  datasetId: string;
  table: RawTable;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const { added, deleted, modified } = table.counts;
  const changed = added + deleted + modified > 0;
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
        {changed ? (
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
            datasetId={datasetId}
            file={table.file}
            keyLabel='shape_id'
          />
        </Box>
      </Collapse>
    </Box>
  );
}
