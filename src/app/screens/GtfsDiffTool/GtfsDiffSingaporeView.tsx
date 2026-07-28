'use client';

import { Box, Button, Chip, Typography } from '@mui/material';
import Link from 'next/link';
import React from 'react';
import type { GtfsDiff } from './lib/gtfs-diff-types';
import type { BreakingChangeEntry, BreakingChangeReport } from './lib/breaking-changes-types';
import GtfsDiffSummaryPanel from './components/GtfsDiffSummaryPanel';
import GtfsDiffFileDiffPanel from './components/GtfsDiffFileDiffPanel';
import BreakingChangesPanel from './components/BreakingChangesPanel';
import FeedComparisonBanner from './components/FeedComparisonBanner';
import singaporeDiff from './singapore-diff.json';
import singaporeBreakingChangesRaw from './singapore-breaking.json';

// singapore-breaking.json stores breaking/suspicious changes as plain sentences rather than
// structured { type, where, detail } entries — normalize them into the shape BreakingChangesPanel expects.
function toEntry(raw: string, index: number, type: string): BreakingChangeEntry {
  const colonIdx = raw.indexOf(':');
  const where = colonIdx > -1 ? raw.slice(0, colonIdx) : `Change ${index + 1}`;
  const detail = colonIdx > -1 ? raw.slice(colonIdx + 1).trim() : raw;
  return { type, where, detail };
}

function normalizeEntries(raw: unknown[], type: string): BreakingChangeEntry[] {
  return raw.map((entry, index) =>
    typeof entry === 'string' ? toEntry(entry, index, type) : (entry as BreakingChangeEntry)
  );
}

export default function GtfsDiffSingaporeView(): React.ReactElement {
  const diff = singaporeDiff as unknown as GtfsDiff;
  const rawBreakingChanges = singaporeBreakingChangesRaw as unknown as BreakingChangeReport;
  const breakingChanges: BreakingChangeReport = {
    ...rawBreakingChanges,
    breaking_changes: normalizeEntries(rawBreakingChanges.breaking_changes, 'breaking_change'),
    suspicious_changes: normalizeEntries(rawBreakingChanges.suspicious_changes, 'suspicious_change'),
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 4, px: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant='h4' fontWeight={700}>
          GTFS Change Tracker
        </Typography>
        <Chip label='Singapore' size='small' color='primary' variant='outlined' />
      </Box>
      <Typography color='text.secondary' sx={{ mb: 1 }}>
        Diff report for Singapore (MapKing), comparing the June 30 and July 24 2026 static feeds.
        Upload your own feeds on the{' '}
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
