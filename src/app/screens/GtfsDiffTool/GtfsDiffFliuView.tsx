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
import fliuDiff from './fliu-diff.json';
import fliuValidationReportNew from './fliu-validation-report-new.json';
import fliuValidationReportOld from './fliu-validation-report-old.json';
import fliuBreakingChanges from './fliu-breaking-changes.json';

export default function GtfsDiffFliuView(): React.ReactElement {
  const diff = fliuDiff as unknown as GtfsDiff;
  const newReport = fliuValidationReportNew as ValidationReport;
  const oldReport = fliuValidationReportOld as ValidationReport;
  const breakingChanges = fliuBreakingChanges as unknown as BreakingChangeReport;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 4, px: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant='h4' fontWeight={700}>
          GTFS Change Tracker
        </Typography>
        <Chip label='FlixBus' size='small' color='primary' variant='outlined' />
      </Box>
      <Typography color='text.secondary' sx={{ mb: 1 }}>
        Diff report for FlixBus / Distribusion (agency FLIU). Upload your own feeds on the{' '}
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

      {/* Breaking / suspicious changes */}
      <BreakingChangesPanel report={breakingChanges} />

      {/* Validation report diff */}
      <ValidationReportDiffPanel baseReport={oldReport} newReport={newReport} />

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
