'use client';

import {
  Box,
  Chip,
  Divider,
  Paper,
  Typography,
  useTheme,
} from '@mui/material';
import React, { useMemo } from 'react';
import {
  type DiffType,
  type EntityDiffRecord,
} from '../lib/gtfs-types';
import type { SemanticDiffResult } from '../lib/semantic-diff';
import type { FileMetadata } from '../lib/worker-types';

interface DiffOverviewProps {
  semantic: SemanticDiffResult;
  filesAMeta: FileMetadata[];
  filesBMeta: FileMetadata[];
}

function countByType<T>(records: EntityDiffRecord<T>[]): Record<DiffType, number> {
  const counts: Record<DiffType, number> = {
    added: 0,
    deleted: 0,
    modified: 0,
    unchanged: 0,
  };
  for (const r of records) {
    counts[r.type]++;
  }
  return counts;
}

interface FileChangeInfo {
  fileName: string;
  onlyInA: boolean;
  onlyInB: boolean;
  rowCountA: number;
  rowCountB: number;
}

function computeFileChanges(
  filesAMeta: FileMetadata[],
  filesBMeta: FileMetadata[],
): FileChangeInfo[] {
  const metaA = new Map<string, FileMetadata>();
  for (const m of filesAMeta) metaA.set(m.fileName, m);
  const metaB = new Map<string, FileMetadata>();
  for (const m of filesBMeta) metaB.set(m.fileName, m);

  const allNames = new Set<string>();
  metaA.forEach((_, k) => allNames.add(k));
  metaB.forEach((_, k) => allNames.add(k));

  const result: FileChangeInfo[] = [];
  allNames.forEach((name) => {
    const a = metaA.get(name);
    const b = metaB.get(name);
    const countA = a ? a.rowCount : 0;
    const countB = b ? b.rowCount : 0;

    // Include if file is only in one feed, or row counts differ,
    // or columns differ (indicating structural change)
    const columnsChanged = a && b &&
      JSON.stringify(a.columns) !== JSON.stringify(b.columns);

    if (!a || !b || countA !== countB || columnsChanged) {
      result.push({
        fileName: name,
        onlyInA: !b,
        onlyInB: !a,
        rowCountA: countA,
        rowCountB: countB,
      });
    }
  });

  return result.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

const STAT_ITEMS: Array<{ type: DiffType; label: string; color: string }> = [
  { type: 'modified', label: 'Modified', color: '#ed6c02' },
  { type: 'added', label: 'Added', color: '#2e7d32' },
  { type: 'deleted', label: 'Deleted', color: '#d32f2f' },
  { type: 'unchanged', label: 'Unchanged', color: '#757575' },
];

export default function DiffOverview({
  semantic,
  filesAMeta,
  filesBMeta,
}: DiffOverviewProps): React.ReactElement {
  const theme = useTheme();

  const totals = useMemo(() => {
    const routes = countByType(semantic.routes);
    const services = countByType(semantic.servicePeriods);
    const stops = countByType(semantic.stops);

    const combined: Record<DiffType, number> = {
      added: routes.added + services.added + stops.added,
      deleted: routes.deleted + services.deleted + stops.deleted,
      modified: routes.modified + services.modified + stops.modified,
      unchanged: routes.unchanged + services.unchanged + stops.unchanged,
    };

    return { routes, services, stops, combined };
  }, [semantic]);

  const changedFiles = useMemo(
    () => computeFileChanges(filesAMeta, filesBMeta),
    [filesAMeta, filesBMeta],
  );

  const totalEntities =
    totals.combined.added +
    totals.combined.deleted +
    totals.combined.modified +
    totals.combined.unchanged;

  return (
    <Paper
      variant='outlined'
      sx={{ p: 2.5, mb: 3, bgcolor: theme.palette.background.default }}
    >
      <Typography variant='subtitle1' fontWeight={700} sx={{ mb: 1.5 }}>
        Diff Overview
      </Typography>

      {/* Aggregate entity counts */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        <Typography variant='body2' color='text.secondary'>
          {totalEntities.toLocaleString()} total entities:
        </Typography>
        {STAT_ITEMS.map(({ type, label, color }) => (
          <Chip
            key={type}
            label={`${totals.combined[type].toLocaleString()} ${label}`}
            size='small'
            sx={{
              color,
              border: `1px solid ${color}`,
              bgcolor: 'transparent',
              fontWeight: 600,
            }}
          />
        ))}
      </Box>

      {/* Per-entity breakdown */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 1.5,
          mb: 2,
        }}
      >
        {([
          { label: 'Routes', counts: totals.routes },
          { label: 'Service Periods', counts: totals.services },
          { label: 'Stops', counts: totals.stops },
        ] as const).map(({ label, counts }) => {
          const entityTotal = counts.added + counts.deleted + counts.modified + counts.unchanged;
          const hasChanges = counts.added + counts.deleted + counts.modified > 0;
          return (
            <Box
              key={label}
              sx={{
                p: 1.5,
                borderRadius: 1,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: theme.palette.background.paper,
              }}
            >
              <Typography variant='body2' fontWeight={600} sx={{ mb: 0.5 }}>
                {label}
                <Typography
                  component='span'
                  variant='body2'
                  color='text.secondary'
                  sx={{ ml: 0.5 }}
                >
                  ({entityTotal})
                </Typography>
              </Typography>
              {hasChanges ? (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {counts.modified > 0 && (
                    <Typography variant='caption' sx={{ color: '#ed6c02' }}>
                      {counts.modified} modified
                    </Typography>
                  )}
                  {counts.added > 0 && (
                    <Typography variant='caption' sx={{ color: '#2e7d32' }}>
                      {counts.modified > 0 ? ' · ' : ''}
                      {counts.added} added
                    </Typography>
                  )}
                  {counts.deleted > 0 && (
                    <Typography variant='caption' sx={{ color: '#d32f2f' }}>
                      {(counts.modified > 0 || counts.added > 0) ? ' · ' : ''}
                      {counts.deleted} deleted
                    </Typography>
                  )}
                </Box>
              ) : (
                <Typography variant='caption' color='text.secondary'>
                  No changes
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* Changed files */}
      <Typography variant='body2' fontWeight={600} sx={{ mb: 1 }}>
        Files with changes
      </Typography>
      {changedFiles.length === 0 ? (
        <Typography variant='body2' color='text.secondary'>
          No file-level differences detected.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {changedFiles.map(({ fileName, onlyInA, onlyInB, rowCountA, rowCountB }) => {
            let chipColor: string;
            let detail: string;
            if (onlyInA) {
              chipColor = '#d32f2f';
              detail = `removed (${rowCountA} rows)`;
            } else if (onlyInB) {
              chipColor = '#2e7d32';
              detail = `added (${rowCountB} rows)`;
            } else {
              chipColor = '#ed6c02';
              const delta = rowCountB - rowCountA;
              const sign = delta >= 0 ? '+' : '';
              detail = `${rowCountA} → ${rowCountB} rows (${sign}${delta})`;
            }
            return (
              <Chip
                key={fileName}
                label={
                  <span>
                    <strong>{fileName}</strong>
                    <Typography
                      component='span'
                      variant='caption'
                      sx={{ ml: 0.5, opacity: 0.85 }}
                    >
                      {detail}
                    </Typography>
                  </span>
                }
                size='small'
                sx={{
                  color: chipColor,
                  border: `1px solid ${chipColor}`,
                  bgcolor: 'transparent',
                  '& .MuiChip-label': { display: 'flex', alignItems: 'center' },
                }}
              />
            );
          })}
        </Box>
      )}
    </Paper>
  );
}
