'use client';

import { Box, Button, Chip, Typography } from '@mui/material';
import Link from 'next/link';
import React from 'react';
import type { GtfsDiff } from './lib/gtfs-diff-types';
import type { ValidationReport } from './lib/validation-report-diff';
import type { BreakingChangeReport } from './lib/breaking-changes-types';
import GtfsDiffSummaryPanel from './components/GtfsDiffSummaryPanel';
import GtfsDiffFileDiffPanel from './components/GtfsDiffFileDiffPanel';
import ValidationReportDiffPanel from './components/ValidationReportDiffPanel';
import BreakingChangesPanel from './components/BreakingChangesPanel';
import FeedComparisonBanner from './components/FeedComparisonBanner';
import exampleDiff from './diff-example.json';
import validationReportLatest from './validation-report-latest.json';
import validationReportOlder from './validation-report-older.json';
import breakingChangesExample from './breaking-changes-example.json';

export default function GtfsDiffExampleView(): React.ReactElement {
  const diff = exampleDiff as unknown as GtfsDiff;
  const latestReport = validationReportLatest as ValidationReport;
  const olderReport = validationReportOlder as ValidationReport;
  const breakingChanges = breakingChangesExample as BreakingChangeReport;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 4, px: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant='h4' fontWeight={700}>
          GTFS Change Tracker
        </Typography>
        <Chip label='Example Report' size='small' color='primary' variant='outlined' />
      </Box>
      <Typography color='text.secondary' sx={{ mb: 1 }}>
        This is a pre-rendered example diff report. Upload your own feeds on the{' '}
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

      {/* Validation report diff */}
      <ValidationReportDiffPanel baseReport={olderReport} newReport={latestReport} />

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
