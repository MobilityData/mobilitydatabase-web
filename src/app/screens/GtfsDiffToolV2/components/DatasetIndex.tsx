'use client';

import { Box, Button, Chip, Typography } from '@mui/material';
import React from 'react';
import { Link } from '../../../../i18n/navigation';
import type { DiffDataset } from '../lib/datasets';

interface DatasetIndexProps {
  datasets: DiffDataset[];
}

/** /gtfs-diff-tool-v2: one card per folder in GtfsDiffTool/data/v2. */
export default function DatasetIndex({
  datasets,
}: DatasetIndexProps): React.ReactElement {
  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 4, px: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <Typography variant='h4' fontWeight={700}>
          GTFS Change Tracker
        </Typography>
        <Chip label='v2 · entities' size='small' color='primary' />
      </Box>
      <Typography color='text.secondary' sx={{ mb: 3 }}>
        Pick a feed pair. Each dataset is a folder in
        src/app/screens/GtfsDiffTool/data/v2.
      </Typography>
      {datasets.length === 0 ? (
        <Typography color='text.secondary'>No datasets found.</Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 2,
          }}
        >
          {datasets.map((d) => (
            <Box
              key={d.id}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '6px',
                bgcolor: 'background.paper',
                p: 2,
              }}
            >
              <Typography variant='h6' fontWeight={700}>
                {d.label}
              </Typography>
              <Typography
                variant='caption'
                color='text.secondary'
                component='div'
                sx={{ mb: 1.5, wordBreak: 'break-all' }}
              >
                {d.feeds.length > 0 ? d.feeds.join(' · ') : 'No feed zips'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {/* A pathways-only dataset's route redirects to pathways. */}
                {d.files.entity || !d.files.pathways ? (
                  <Button
                    component={Link}
                    href={`/gtfs-diff-tool-v2/${d.id}`}
                    variant={d.files.entity ? 'contained' : 'outlined'}
                    size='small'
                  >
                    {d.files.entity
                      ? 'Entity diff'
                      : 'Entity diff (not generated)'}
                  </Button>
                ) : null}
                {d.files.pathways ? (
                  <Button
                    component={Link}
                    href={`/gtfs-diff-tool-v2/${d.id}/pathways`}
                    variant='outlined'
                    size='small'
                  >
                    Pathways and levels
                  </Button>
                ) : null}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
