'use client';

import { Box, Chip, Typography, useTheme } from '@mui/material';
import React from 'react';
import { type DiffType } from '../lib/gtfs-types';

interface SummaryStatBarProps {
  counts: Record<DiffType, number>;
  activeFilter: DiffType | null;
  onFilterClick: (filter: DiffType | null) => void;
}

const STAT_CONFIG: Array<{
  type: DiffType;
  label: string;
  color: string;
}> = [
  { type: 'modified', label: 'Modified', color: '#ed6c02' },
  { type: 'added', label: 'Added', color: '#2e7d32' },
  { type: 'deleted', label: 'Deleted', color: '#d32f2f' },
  { type: 'unchanged', label: 'Unchanged', color: '#757575' },
];

export default function SummaryStatBar({
  counts,
  activeFilter,
  onFilterClick,
}: SummaryStatBarProps): React.ReactElement {
  const theme = useTheme();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Typography variant='body2' color='text.secondary' sx={{ mr: 1 }}>
        {total.toLocaleString()} entities
      </Typography>
      {STAT_CONFIG.map(({ type, label, color }) => (
        <Chip
          key={type}
          label={`${counts[type].toLocaleString()} ${label}`}
          size='small'
          onClick={() =>
            onFilterClick(activeFilter === type ? null : type)
          }
          sx={{
            bgcolor: activeFilter === type ? color : 'transparent',
            color: activeFilter === type ? '#fff' : color,
            border: `1px solid ${color}`,
            fontWeight: activeFilter === type ? 700 : 400,
            cursor: 'pointer',
            '&:hover': { bgcolor: color, color: '#fff' },
          }}
        />
      ))}
      {activeFilter !== null && (
        <Chip
          label='Clear filter'
          size='small'
          variant='outlined'
          onDelete={() => onFilterClick(null)}
          onClick={() => onFilterClick(null)}
        />
      )}
    </Box>
  );
}
