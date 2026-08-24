'use client';

import { Box, Button, Chip, Typography } from '@mui/material';
import Link from 'next/link';
import React from 'react';
import type { GtfsDiff } from './lib/gtfs-diff-types';
import type { ValidationReport } from './lib/validation-report-diff';
import { computeBreakingChangesFromValidationReports } from './lib/breaking-changes-from-validation';
import GtfsDiffSummaryPanel from './components/GtfsDiffSummaryPanel';
import GtfsDiffFileDiffPanel from './components/GtfsDiffFileDiffPanel';
import ValidationReportDiffPanel from './components/ValidationReportDiffPanel';
import BreakingChangesPanel from './components/BreakingChangesPanel';
import FeedComparisonBanner from './components/FeedComparisonBanner';
import queenslandDiff from './queensland-diff.json';
import queenslandValidationReportNew from './queensland-new-validation.json';
import queenslandValidationReportOld from './queensland-base-validation.json';

export default function GtfsDiffQueenslandView(): React.ReactElement {
  const diff = queenslandDiff as unknown as GtfsDiff;
  const newReport = queenslandValidationReportNew as unknown as ValidationReport;
  const oldReport = queenslandValidationReportOld as unknown as ValidationReport;
  const breakingChanges = computeBreakingChangesFromValidationReports(
    oldReport,
    newReport,
    diff.metadata.base_feed.source,
    diff.metadata.new_feed.source,
  );

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 4, px: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant='h4' fontWeight={700}>
          GTFS Change Tracker
        </Typography>
        <Chip label='Translink Queensland' size='small' color='primary' variant='outlined' />
      </Box>
      <Typography color='text.secondary' sx={{ mb: 1 }}>
        Diff report for Translink Queensland, comparing the August 18 and August 20 2026 static
        feeds. Upload your own feeds on the{' '}
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

      {/* Breaking / suspicious changes (derived from the validation reports) */}
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
