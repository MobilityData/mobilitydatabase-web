'use client';

import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import React, { useCallback, useMemo, useState } from 'react';
import UploadZone from './components/UploadZone';
import { RoutesTab, ServicePeriodsTab, StopsTab } from './components/EntityTabs';
import FileDiffView from './components/FileDiffView';
import DiffOverview from './components/DiffOverview';
import { useGtfsDiffWorker } from './hooks/useGtfsDiffWorker';
import {
  type DiffTab,
  type EntitySubTab,
} from './lib/gtfs-types';

export default function GtfsDiffTool(): React.ReactElement {
  // Raw File objects collected from the upload zones
  const [rawFilesA, setRawFilesA] = useState<File[]>([]);
  const [rawFilesB, setRawFilesB] = useState<File[]>([]);

  // Display names for the upload checklist
  const [fileNamesA, setFileNamesA] = useState<string[]>([]);
  const [fileNamesB, setFileNamesB] = useState<string[]>([]);

  // Worker hook — all heavy lifting happens off the main thread
  const worker = useGtfsDiffWorker();

  // Tab state
  const [activeTab, setActiveTab] = useState<DiffTab>('entity');
  const [entitySubTab, setEntitySubTab] = useState<EntitySubTab>('routes');

  // File diff context filter (when navigating from entity cards)
  const [fileDiffContext, setFileDiffContext] = useState<{
    fileName: string;
    filterRouteId?: string;
  } | null>(null);

  // ── Upload handlers ──────────────────────────────────────────────

  const handleFilesA = useCallback((files: File[]) => {
    setRawFilesA((prev) => {
      // Deduplicate by name, newer file wins
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

  // ── Diff trigger ─────────────────────────────────────────────────

  const runDiff = useCallback(() => {
    if (rawFilesA.length === 0 || rawFilesB.length === 0) return;
    worker.run(rawFilesA, rawFilesB);
  }, [rawFilesA, rawFilesB, worker]);

  const handleReset = useCallback(() => {
    setRawFilesA([]);
    setRawFilesB([]);
    setFileNamesA([]);
    setFileNamesB([]);
    setFileDiffContext(null);
    worker.reset();
  }, [worker]);

  const handleViewFileDiff = useCallback(
    (routeId: string) => {
      setActiveTab('file');
      setFileDiffContext({
        fileName: 'trips.txt',
        filterRouteId: routeId,
      });
    },
    [],
  );

  // ── Derived state ────────────────────────────────────────────────

  const isRunning = worker.phase === 'running';
  const isDone = worker.phase === 'done' && worker.result != null;
  const semantic = worker.result?.semantic ?? null;

  // Merged file names from metadata
  const allFileNames = useMemo(() => {
    if (!worker.result) return [];
    const names = new Set<string>();
    for (const n of worker.result.fileNamesA) names.add(n);
    for (const n of worker.result.fileNamesB) names.add(n);
    return Array.from(names).sort();
  }, [worker.result]);

  const noSemanticChanges =
    isDone &&
    semantic != null &&
    semantic.routes.every((d) => d.type === 'unchanged') &&
    semantic.servicePeriods.every((d) => d.type === 'unchanged') &&
    semantic.stops.every((d) => d.type === 'unchanged');

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 4, px: 2 }}>
      {/* Header */}
      <Typography variant='h4' fontWeight={700} sx={{ mb: 1 }}>
        GTFS Diff Tool
      </Typography>
      <Typography color='text.secondary' sx={{ mb: 3 }}>
        Compare two GTFS feeds to identify semantic changes across routes,
        service periods, and stops — or view raw per-file diffs.
      </Typography>

      {/* Upload zones */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
        <UploadZone
          label='Feed A (old)'
          fileNames={fileNamesA}
          onFilesSelected={handleFilesA}
          disabled={isRunning}
        />
        <UploadZone
          label='Feed B (new)'
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
          disabled={
            rawFilesA.length === 0 ||
            rawFilesB.length === 0 ||
            isRunning
          }
        >
          {isRunning ? 'Computing…' : 'Run Diff'}
        </Button>
        {isDone && (
          <Button variant='outlined' size='small' onClick={handleReset}>
            Reset
          </Button>
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

      {/* No semantic changes */}
      {noSemanticChanges && activeTab === 'entity' && (
        <Alert severity='success' sx={{ mb: 2 }}>
          No semantic changes detected — the two feeds are functionally
          identical.
        </Alert>
      )}

      {/* Results */}
      {isDone && semantic != null && (
        <Box>
          {/* Overview section */}
          <DiffOverview
            semantic={semantic}
            filesAMeta={worker.result?.filesAMeta ?? []}
            filesBMeta={worker.result?.filesBMeta ?? []}
          />

          {/* Main tabs: Entity view / File diff */}
          <Tabs
            value={activeTab}
            onChange={(_, v) => {
              setActiveTab(v);
              if (v === 'entity') setFileDiffContext(null);
            }}
            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab label='Entity View' value='entity' />
            <Tab label='File Diff' value='file' />
          </Tabs>

          {activeTab === 'entity' && (
            <Box>
              {/* Entity sub-tabs */}
              <Tabs
                value={entitySubTab}
                onChange={(_, v) => setEntitySubTab(v)}
                sx={{ mb: 2 }}
              >
                <Tab label='Routes' value='routes' />
                <Tab label='Service Periods' value='servicePeriods' />
                <Tab label='Stops' value='stops' />
              </Tabs>

              {entitySubTab === 'routes' && (
                <RoutesTab
                  diffs={semantic.routes}
                  onViewFileDiff={handleViewFileDiff}
                />
              )}
              {entitySubTab === 'servicePeriods' && (
                <ServicePeriodsTab diffs={semantic.servicePeriods} />
              )}
              {entitySubTab === 'stops' && (
                <StopsTab diffs={semantic.stops} />
              )}
            </Box>
          )}

          {activeTab === 'file' && (
            <FileDiffView
              fileNames={allFileNames}
              requestFileDiff={worker.requestFileDiff}
              initialFileName={fileDiffContext?.fileName}
              initialFilterRouteId={fileDiffContext?.filterRouteId}
            />
          )}
        </Box>
      )}
    </Box>
  );
}
