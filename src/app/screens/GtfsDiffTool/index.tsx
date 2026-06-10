'use client';

import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Typography,
} from '@mui/material';
import React, { useCallback, useState } from 'react';
import UploadZone from './components/UploadZone';
import GtfsDiffSummaryPanel from './components/GtfsDiffSummaryPanel';
import GtfsDiffFileDiffPanel from './components/GtfsDiffFileDiffPanel';
import { useGtfsDiffWorker } from './hooks/useGtfsDiffWorker';

export default function GtfsDiffTool(): React.ReactElement {
  const [rawFilesA, setRawFilesA] = useState<File[]>([]);
  const [rawFilesB, setRawFilesB] = useState<File[]>([]);
  const [fileNamesA, setFileNamesA] = useState<string[]>([]);
  const [fileNamesB, setFileNamesB] = useState<string[]>([]);

  const worker = useGtfsDiffWorker();

  // ── Upload handlers ────────────────────────────────────────────

  const handleFilesA = useCallback((files: File[]) => {
    setRawFilesA((prev) => {
      const byName = new Map<string, File>();
      for (const f of prev) byName.set(f.name.toLowerCase(), f);
      for (const f of files) byName.set(f.name.toLowerCase(), f);
      return Array.from(byName.values());
    });
    setFileNamesA((prev) => {
      const all = new Set(prev.concat(files.map((f) => f.name.toLowerCase())));
      return Array.from(all).sort();
    });
  }, []);

  const handleFilesB = useCallback((files: File[]) => {
    setRawFilesB((prev) => {
      const byName = new Map<string, File>();
      for (const f of prev) byName.set(f.name.toLowerCase(), f);
      for (const f of files) byName.set(f.name.toLowerCase(), f);
      return Array.from(byName.values());
    });
    setFileNamesB((prev) => {
      const all = new Set(prev.concat(files.map((f) => f.name.toLowerCase())));
      return Array.from(all).sort();
    });
  }, []);

  // ── Actions ────────────────────────────────────────────────────

  const runDiff = useCallback(() => {
    if (rawFilesA.length === 0 || rawFilesB.length === 0) return;
    worker.run(rawFilesA, rawFilesB);
  }, [rawFilesA, rawFilesB, worker]);

  const handleReset = useCallback(() => {
    setRawFilesA([]);
    setRawFilesB([]);
    setFileNamesA([]);
    setFileNamesB([]);
    worker.reset();
  }, [worker]);

  const isRunning = worker.phase === 'running';
  const isDone = worker.phase === 'done' && worker.gtfsDiff != null;

  const handleDownload = useCallback(() => {
    if (!worker.gtfsDiff) return;
    const json = JSON.stringify(worker.gtfsDiff, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gtfs-diff-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [worker.gtfsDiff]);

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 4, px: 2 }}>
      {/* Header */}
      <Typography variant='h4' fontWeight={700} sx={{ mb: 1 }}>
        GTFS Change Tracker
      </Typography>
      <Typography color='text.secondary' sx={{ mb: 3 }}>
        Compare two GTFS feeds and view the schema-compliant diff report —
        covering added, deleted, and modified files, columns, and rows.
      </Typography>

      {/* Upload zones */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
        <UploadZone
          label='Base feed (old)'
          fileNames={fileNamesA}
          onFilesSelected={handleFilesA}
          disabled={isRunning}
        />
        <UploadZone
          label='New feed'
          fileNames={fileNamesB}
          onFilesSelected={handleFilesB}
          disabled={isRunning}
        />
      </Box>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
        <Button
          variant='contained'
          onClick={runDiff}
          disabled={rawFilesA.length === 0 || rawFilesB.length === 0 || isRunning}
        >
          {isRunning ? 'Computing…' : 'Run Diff'}
        </Button>
        {isDone && (
          <>
            <Button variant='outlined' size='small' onClick={handleDownload}>
              Download JSON
            </Button>
            <Button variant='outlined' size='small' onClick={handleReset}>
              Reset
            </Button>
          </>
        )}
      </Box>

      {/* Progress bar */}
      {isRunning && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant='body2' color='text.secondary'>
              {worker.progress.label}
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              {Math.round(worker.progress.percent)}%
            </Typography>
          </Box>
          <LinearProgress
            variant='determinate'
            value={worker.progress.percent}
            sx={{ height: 8, borderRadius: 4 }}
          />
        </Box>
      )}

      {/* Error */}
      {worker.error && (
        <Alert severity='error' sx={{ mb: 2 }}>
          {worker.error}
        </Alert>
      )}

      {/* Results */}
      {isDone && worker.gtfsDiff != null && (
        <Box>
          <GtfsDiffSummaryPanel diff={worker.gtfsDiff} />
          <Typography variant='h6' fontWeight={700} sx={{ mb: 2 }}>
            File Diffs
          </Typography>
          <GtfsDiffFileDiffPanel fileDiffs={worker.gtfsDiff.file_diffs} />
        </Box>
      )}
    </Box>
  );
}
