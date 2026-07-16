'use client';

import { Box, Button, Chip, Typography } from '@mui/material';
import Link from 'next/link';
import React from 'react';
import type { GtfsDiff } from './lib/gtfs-diff-types';
import type { BreakingChangeReport } from './lib/breaking-changes-types';
import GtfsDiffSummaryPanel from './components/GtfsDiffSummaryPanel';
import GtfsDiffFileDiffPanel from './components/GtfsDiffFileDiffPanel';
import BreakingChangesPanel from './components/BreakingChangesPanel';
import FeedComparisonBanner from './components/FeedComparisonBanner';
import metrobusMexicoDiff from './metrobus-mexico-diff.json';
import metrobusMexicoBreakingChanges from './metrobus-mexico-breaking-changes.json';

export default function GtfsDiffMetrobusMexicoView(): React.ReactElement {
  const diff = metrobusMexicoDiff as unknown as GtfsDiff;
  const breakingChanges = metrobusMexicoBreakingChanges as unknown as BreakingChangeReport;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 4, px: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant='h4' fontWeight={700}>
          GTFS Change Tracker
        </Typography>
        <Chip label='CDMX Metrobús' size='small' color='primary' variant='outlined' />
      </Box>
      <Typography color='text.secondary' sx={{ mb: 1 }}>
        Diff report for CDMX Metrobús, comparing the June 11 and June 18 2026 static feeds. Upload
        your own feeds on the{' '}
        <Link href='../gtfs-diff-tool' style={{ color: 'inherit' }}>
          GTFS Change Tracker
        </Link>{' '}
        page to generate a live report.
      </Typography>
      <Box sx={{ mb: 3 }}>
        <Button component={Link} href='../gtfs-diff-tool' variant='outlined' size='small'>
          ← Back to tool
        </Button>
      </Box>

      {/* Feed comparison */}
      <FeedComparisonBanner baseFeed={diff.metadata.base_feed.source} newFeed={diff.metadata.new_feed.source} />

      {/* Breaking / suspicious changes */}
      <BreakingChangesPanel report={breakingChanges} />

      {/* Summary */}
      <GtfsDiffSummaryPanel diff={diff} />

      {/* File diffs */}
      <Typography variant='h6' fontWeight={700} sx={{ mb: 2 }}>
        File Diffs
      </Typography>
      <GtfsDiffFileDiffPanel fileDiffs={diff.file_diffs} />
    </Box>
  );
}
