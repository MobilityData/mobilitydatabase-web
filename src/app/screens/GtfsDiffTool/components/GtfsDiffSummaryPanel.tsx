'use client';

import {
  Box,
  Chip,
  Collapse,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import React, { useState } from 'react';
import type { GtfsDiff, FileSummary, FileStats } from '../lib/gtfs-diff-types';

// ── Helpers ────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtNum(n: number | undefined): string {
  if (n === undefined || n === 0) return '—';
  return n.toLocaleString();
}

function fmtNumOrNA(n: number | undefined, notCompared: boolean): string {
  if (notCompared) return 'N/A';
  return fmtNum(n);
}

const STATUS_COLORS: Record<FileSummary['status'], string> = {
  added: '#2e7d32',
  deleted: '#d32f2f',
  modified: '#ed6c02',
  not_compared: '#757575',
};

interface GtfsDiffSummaryPanelProps {
  diff: GtfsDiff;
}

// ── Component ──────────────────────────────────────────────────────

export default function GtfsDiffSummaryPanel({
  diff,
}: GtfsDiffSummaryPanelProps): React.ReactElement {
  const theme = useTheme();
  const { metadata, summary } = diff;

  // Per-file counts live in file_diffs[].stats under the v2 schema.
  const statsByFile = new Map<string, FileStats | undefined>(
    diff.file_diffs.map((d) => [d.file_name, d.stats]),
  );

  const statChips = [
    { label: `${summary.files_added_count} files added`, color: '#2e7d32' },
    { label: `${summary.files_modified_count} files modified`, color: '#ed6c02' },
    { label: `${summary.files_deleted_count} files deleted`, color: '#d32f2f' },
    {
      label: `${summary.files_not_compared_count} files not compared`,
      color: '#757575',
    },
  ].filter((c) => !c.label.startsWith('0'));

  const unsupported = metadata.unsupported_files;
  const [open, setOpen] = useState(true);

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        borderRadius: '6px',
        p: 2.5,
        mb: 3,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: open ? 1.5 : 0,
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <Typography variant='subtitle1' fontWeight={700}>
          Diff Summary
        </Typography>
        <Tooltip title={open ? 'Collapse' : 'Expand'}>
          <IconButton size='small' sx={{ p: 0.25, ml: 'auto' }} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
            {open ? <ExpandLess sx={{ fontSize: '1rem' }} /> : <ExpandMore sx={{ fontSize: '1rem' }} />}
          </IconButton>
        </Tooltip>
      </Box>
      <Collapse in={open}>

      {/* Aggregate stats */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Typography variant='body2' fontWeight={700}>
          {summary.total_changes.toLocaleString()} total changes
        </Typography>
        {statChips.map((c) => (
          <Chip
            key={c.label}
            label={c.label}
            size='small'
            sx={{
              color: c.color,
              border: `1px solid ${c.color}`,
              bgcolor: 'transparent',
              fontWeight: 600,
            }}
          />
        ))}
      </Box>

      {/* Per-file table */}
      {summary.files.length > 0 ? (
        <TableContainer>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>File</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell align='right' sx={{ fontWeight: 700 }}>
                  Rows +
                </TableCell>
                <TableCell align='right' sx={{ fontWeight: 700 }}>
                  Rows −
                </TableCell>
                <TableCell align='right' sx={{ fontWeight: 700 }}>
                  Rows ~
                </TableCell>
                <TableCell align='right' sx={{ fontWeight: 700 }}>
                  Cols +
                </TableCell>
                <TableCell align='right' sx={{ fontWeight: 700 }}>
                  Cols −
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {summary.files.map((file, idx) => {
                const stats = statsByFile.get(file.file_name);
                const isEven = idx % 2 === 1;
                const isNotCompared = file.status === 'not_compared';
                return (
                  <TableRow key={file.file_name} sx={{ bgcolor: isEven ? 'action.hover' : 'transparent' }}>
                    <TableCell
                      sx={{
                        fontFamily: 'var(--font-ibm-plex-mono)',
                        fontSize: '0.75rem',
                      }}
                    >
                      {file.file_name}
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant='caption'
                        sx={{
                          color: STATUS_COLORS[file.status],
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        {file.status.replace('_', ' ')}
                      </Typography>
                    </TableCell>
                    <TableCell
                      align='right'
                      sx={{ color: isNotCompared ? 'text.disabled' : '#2e7d32', fontFamily: 'var(--font-ibm-plex-mono)', fontSize: '0.75rem' }}
                    >
                      {fmtNumOrNA(stats?.rows_added_count, isNotCompared)}
                    </TableCell>
                    <TableCell
                      align='right'
                      sx={{ color: isNotCompared ? 'text.disabled' : '#d32f2f', fontFamily: 'var(--font-ibm-plex-mono)', fontSize: '0.75rem' }}
                    >
                      {fmtNumOrNA(stats?.rows_deleted_count, isNotCompared)}
                    </TableCell>
                    <TableCell
                      align='right'
                      sx={{ color: isNotCompared ? 'text.disabled' : '#ed6c02', fontFamily: 'var(--font-ibm-plex-mono)', fontSize: '0.75rem' }}
                    >
                      {fmtNumOrNA(stats?.rows_modified_count, isNotCompared)}
                    </TableCell>
                    <TableCell
                      align='right'
                      sx={{ color: '#2e7d32', fontFamily: 'var(--font-ibm-plex-mono)', fontSize: '0.75rem' }}
                    >
                      {fmtNum(stats?.columns_added_count)}
                    </TableCell>
                    <TableCell
                      align='right'
                      sx={{ color: '#d32f2f', fontFamily: 'var(--font-ibm-plex-mono)', fontSize: '0.75rem' }}
                    >
                      {fmtNum(stats?.columns_deleted_count)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography variant='body2' color='text.secondary'>
          No file-level changes detected.
        </Typography>
      )}

      {/* Unsupported files */}
      {unsupported.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant='caption' color='text.secondary'>
            Unsupported files (not parsed):{' '}
            {unsupported.map((f) => (
              <Tooltip key={f.file_name} title={`Present in: ${f.present_in}`}>
                <Chip
                  label={f.file_name}
                  size='small'
                  sx={{ mx: 0.25, fontSize: '0.65rem', bgcolor: theme.palette.action.hover }}
                />
              </Tooltip>
            ))}
          </Typography>
        </Box>
      )}

      {/* Schema version + generation time */}
      <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant='caption' color='text.secondary'>
          Schema v{metadata.schema_version}
        </Typography>
        <Typography variant='caption' color='text.secondary'>
          Generated {fmtDate(metadata.generated_at)}
        </Typography>
        {metadata.row_changes_cap_per_file !== null && (
          <Typography variant='caption' color='text.secondary'>
            Row cap: {metadata.row_changes_cap_per_file.toLocaleString()} per file
          </Typography>
        )}
      </Box>
      </Collapse>
    </Box>
  );
}
