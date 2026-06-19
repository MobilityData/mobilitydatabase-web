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
import cdpgReport1Diff from './cdpg-report-1-diff.json';
import cdpgReport1ValidationReportNew from './cdpg-report-1-validation-report-new.json';
import cdpgReport1ValidationReportOld from './cdpg-report-1-validation-report-old.json';
import cdpgReport1BreakingChanges from './cdpg-report-1-breaking-changes.json';

export default function GtfsDiffCdpgReport1View(): React.ReactElement {
  const diff = cdpgReport1Diff as unknown as GtfsDiff;
  const newReport = cdpgReport1ValidationReportNew as ValidationReport;
  const oldReport = cdpgReport1ValidationReportOld as ValidationReport;
  const breakingChanges = cdpgReport1BreakingChanges as unknown as BreakingChangeReport;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 4, px: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant='h4' fontWeight={700}>
          GTFS Change Tracker
        </Typography>
        <Chip label='BMTC – Bengaluru' size='small' color='primary' variant='outlined' />
      </Box>
      <Typography color='text.secondary' sx={{ mb: 1 }}>
        Diff report for BMTC (Bengaluru Metropolitan Transport Corporation), comparing the
        2026-03-03 and 2026-03-10 feed snapshots. Upload your own feeds on the{' '}
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
