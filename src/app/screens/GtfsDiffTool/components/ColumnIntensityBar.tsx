'use client';

import { Box, LinearProgress, Tooltip, Typography, useTheme } from '@mui/material';
import React from 'react';
import { type ColumnIntensity } from '../lib/gtfs-types';

interface ColumnIntensityBarProps {
  intensities: ColumnIntensity[];
}

export default function ColumnIntensityBar({
  intensities,
}: ColumnIntensityBarProps): React.ReactElement {
  const theme = useTheme();

  if (intensities.length === 0) return <></>;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant='caption' fontWeight={700} color='text.secondary' sx={{ mb: 1, display: 'block' }}>
        Column change intensity
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {intensities.map(({ column, changedCount, totalModified, percentage }) => (
          <Tooltip
            key={column}
            title={`${changedCount} of ${totalModified} modified rows (${percentage}%)`}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant='caption'
                sx={{
                  minWidth: 140,
                  fontFamily: 'var(--font-ibm-plex-mono)',
                  fontSize: '0.7rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {column}
              </Typography>
              <LinearProgress
                variant='determinate'
                value={percentage}
                sx={{
                  flex: 1,
                  height: 8,
                  borderRadius: 4,
                  bgcolor: theme.palette.grey[200],
                  '& .MuiLinearProgress-bar': {
                    bgcolor:
                      percentage > 80
                        ? '#d32f2f'
                        : percentage > 40
                          ? '#ed6c02'
                          : '#2e7d32',
                    borderRadius: 4,
                  },
                }}
              />
              <Typography
                variant='caption'
                sx={{ minWidth: 40, textAlign: 'right', fontSize: '0.7rem' }}
              >
                {percentage}%
              </Typography>
            </Box>
          </Tooltip>
        ))}
      </Box>
    </Box>
  );
}
