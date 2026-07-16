'use client';

import { Box, Typography } from '@mui/material';
import React from 'react';

const MONO_FONT = 'var(--font-ibm-plex-mono)';

/** Strip leading directory path and trailing extension from a file source string. */
function toLabel(source: string): string {
  const name = source.split('/').pop() ?? source;
  return name.replace(/\.[^.]+$/, '');
}

interface FeedComparisonBannerProps {
  baseFeed: string;
  newFeed: string;
}

export default function FeedComparisonBanner({
  baseFeed,
  newFeed,
}: FeedComparisonBannerProps): React.ReactElement {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        mb: 3,
        flexWrap: 'wrap',
      }}
    >
      <Typography variant='caption' color='text.secondary'>
        Comparing
      </Typography>
      <Typography
        variant='caption'
        sx={{ fontFamily: MONO_FONT, color: 'text.primary', fontWeight: 500 }}
      >
        {toLabel(baseFeed)}
      </Typography>
      <Typography variant='caption' color='text.secondary'>
        →
      </Typography>
      <Typography
        variant='caption'
        sx={{ fontFamily: MONO_FONT, color: 'text.primary', fontWeight: 500 }}
      >
        {toLabel(newFeed)}
      </Typography>
    </Box>
  );
}
