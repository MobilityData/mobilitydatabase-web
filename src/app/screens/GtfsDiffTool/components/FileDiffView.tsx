'use client';

import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from '@mui/material';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type DiffType,
  type FileDiffResult,
  GTFS_DEFAULT_KEYS,
  type RowDiff,
} from '../lib/gtfs-types';
import ColumnIntensityBar from './ColumnIntensityBar';
import SummaryStatBar from './SummaryStatBar';

// ── Row rendering ──────────────────────────────────────────────────

const ROW_LIMIT = 200;

const TYPE_BG: Record<DiffType, string> = {
  added: 'rgba(46,125,50,.06)',
  deleted: 'rgba(211,47,47,.06)',
  modified: 'rgba(237,108,2,.06)',
  unchanged: 'transparent',
};

function CellValue({
  oldVal,
  newVal,
  isKey,
  showUnchanged,
}: {
  oldVal: string | undefined;
  newVal: string | undefined;
  isKey: boolean;
  showUnchanged: boolean;
}): React.ReactElement {
  const old = oldVal ?? '';
  const nv = newVal ?? '';

  if (old === nv) {
    if (!showUnchanged && !isKey) return <></>;
    return (
      <Typography
        variant='caption'
        sx={{ fontFamily: 'var(--font-ibm-plex-mono)', fontSize: '0.7rem' }}
      >
        {old || '—'}
      </Typography>
    );
  }

  return (
    <Box>
      {old && (
        <Typography
          variant='caption'
          sx={{
            fontFamily: 'var(--font-ibm-plex-mono)',
            fontSize: '0.7rem',
            textDecoration: 'line-through',
            color: '#d32f2f',
            display: 'block',
          }}
        >
          {old}
        </Typography>
      )}
      <Typography
        variant='caption'
        sx={{
          fontFamily: 'var(--font-ibm-plex-mono)',
          fontSize: '0.7rem',
          color: '#2e7d32',
          fontWeight: 500,
          display: 'block',
        }}
      >
        {nv || '(empty)'}
      </Typography>
    </Box>
  );
}

// ── Grouping logic ─────────────────────────────────────────────────

type GroupAxis = 'change-type' | 'route_id' | 'service_id' | 'column-changed';

function groupRows(
  rows: RowDiff[],
  axis: GroupAxis,
): Map<string, RowDiff[]> {
  const groups = new Map<string, RowDiff[]>();
  for (const row of rows) {
    let groupKey: string;
    switch (axis) {
      case 'change-type':
        groupKey = row.type;
        break;
      case 'route_id':
        groupKey = row.newRow?.route_id ?? row.oldRow?.route_id ?? 'unknown';
        break;
      case 'service_id':
        groupKey =
          row.newRow?.service_id ?? row.oldRow?.service_id ?? 'unknown';
        break;
      case 'column-changed':
        groupKey =
          row.changedColumns.length > 0
            ? row.changedColumns.sort().join(', ')
            : row.type;
        break;
      default:
        groupKey = row.type;
    }
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push(row);
  }
  return groups;
}

// ── Main file diff view ────────────────────────────────────────────

interface FileDiffViewProps {
  fileNames: string[];
  /** Request a file diff from the worker (lazy, off main thread). */
  requestFileDiff: (
    fileName: string,
    keyColumns?: string[],
    filterRouteId?: string,
  ) => Promise<FileDiffResult>;
  initialFileName?: string;
  initialFilterRouteId?: string;
}

export default function FileDiffView({
  fileNames,
  requestFileDiff,
  initialFileName,
  initialFilterRouteId,
}: FileDiffViewProps): React.ReactElement {
  const theme = useTheme();

  const [selectedFile, setSelectedFile] = useState(
    initialFileName ?? fileNames[0] ?? '',
  );
  const [customKeyColumns, setCustomKeyColumns] = useState<string[] | null>(
    null,
  );
  const [groupAxis, setGroupAxis] = useState<GroupAxis>('change-type');
  const [showUnchangedCols, setShowUnchangedCols] = useState(false);
  const [typeFilter, setTypeFilter] = useState<DiffType | null>(null);

  // Lazy-loaded diff result
  const [diffResult, setDiffResult] = useState<FileDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Fetch diff from worker whenever selection changes
  const fetchDiff = useCallback(async (
    fileName: string,
    keyColumns: string[] | null,
    filterRouteId?: string,
  ) => {
    if (!fileName) return;
    setLoading(true);
    setDiffError(null);
    try {
      const result = await requestFileDiff(
        fileName,
        keyColumns ?? undefined,
        filterRouteId,
      );
      setDiffResult(result);
    } catch (e) {
      setDiffError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [requestFileDiff]);

  // Trigger fetch on mount and when file/key changes
  useEffect(() => {
    fetchDiff(selectedFile, customKeyColumns, initialFilterRouteId);
  }, [selectedFile, customKeyColumns, initialFilterRouteId, fetchDiff]);

  if (fileNames.length === 0) {
    return (
      <Typography color='text.secondary'>
        No files uploaded yet.
      </Typography>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 4 }}>
        <CircularProgress size={24} />
        <Typography color='text.secondary'>
          Computing diff for {selectedFile}…
        </Typography>
      </Box>
    );
  }

  if (diffError) {
    return <Alert severity='error'>{diffError}</Alert>;
  }

  if (!diffResult) {
    return (
      <Typography color='text.secondary'>
        Select a file to view its diff.
      </Typography>
    );
  }

  // Determine visible columns
  const keyColumnSet = new Set(diffResult.keyColumns);
  const visibleColumns = showUnchangedCols
    ? diffResult.allColumns
    : [
        ...diffResult.keyColumns,
        ...diffResult.columnIntensities.map((ci) => ci.column),
      ];
  const uniqueVisibleColumns = Array.from(new Set(visibleColumns));

  // Grouping
  const filteredRows = typeFilter
    ? diffResult.rows.filter((r) => r.type === typeFilter)
    : diffResult.rows;
  const grouped = groupRows(filteredRows, groupAxis);

  const counts = {
    added: diffResult.addedCount,
    deleted: diffResult.deletedCount,
    modified: diffResult.modifiedCount,
    unchanged: diffResult.unchangedCount,
  };

  return (
    <Box>
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          flexWrap: 'wrap',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <FormControl size='small' sx={{ minWidth: 180 }}>
          <InputLabel>File</InputLabel>
          <Select
            value={selectedFile}
            label='File'
            onChange={(e) => {
              setSelectedFile(e.target.value);
              setCustomKeyColumns(null);
            }}
          >
            {fileNames.map((f) => (
              <MenuItem key={f} value={f}>
                {f}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size='small' sx={{ minWidth: 150 }}>
          <InputLabel>Group by</InputLabel>
          <Select
            value={groupAxis}
            label='Group by'
            onChange={(e) => setGroupAxis(e.target.value as GroupAxis)}
          >
            <MenuItem value='change-type'>Change type</MenuItem>
            <MenuItem value='route_id'>Route ID</MenuItem>
            <MenuItem value='service_id'>Service ID</MenuItem>
            <MenuItem value='column-changed'>Column changed</MenuItem>
          </Select>
        </FormControl>

        <FormControl size='small' sx={{ minWidth: 180 }}>
          <InputLabel>Key column(s)</InputLabel>
          <Select
            multiple
            value={customKeyColumns ?? diffResult.keyColumns}
            label='Key column(s)'
            onChange={(e) => {
              const val = e.target.value as string[];
              setCustomKeyColumns(val.length > 0 ? val : null);
            }}
            renderValue={(selected) => (selected as string[]).join(', ')}
          >
            {diffResult.allColumns.map((col) => (
              <MenuItem key={col} value={col}>
                {col}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControlLabel
          control={
            <Switch
              size='small'
              checked={showUnchangedCols}
              onChange={(e) => setShowUnchangedCols(e.target.checked)}
            />
          }
          label={
            <Typography variant='caption'>Show unchanged columns</Typography>
          }
        />
      </Box>

      {/* Key identity notice */}
      <Alert severity='info' sx={{ mb: 2, py: 0 }}>
        <Typography variant='caption'>
          <strong>Key identity:</strong> {diffResult.keyColumns.join(' + ')}
        </Typography>
      </Alert>

      {/* Duplicate key warning */}
      {diffResult.duplicateKeys.length > 0 && (
        <Alert severity='warning' sx={{ mb: 2, py: 0 }}>
          <Typography variant='caption'>
            Duplicate keys detected ({diffResult.duplicateKeys.length}). The
            current key may not be a true primary key. Duplicates:{' '}
            {diffResult.duplicateKeys.slice(0, 5).join(', ')}
            {diffResult.duplicateKeys.length > 5 && '…'}
          </Typography>
        </Alert>
      )}

      {/* Batch patterns */}
      {diffResult.batchPatterns.length > 0 && (
        <Box sx={{ mb: 2 }}>
          {diffResult.batchPatterns.map((bp, i) => (
            <Alert key={i} severity='info' sx={{ mb: 0.5, py: 0 }}>
              <Typography variant='caption'>
                <strong>Pattern:</strong> {bp.description}
              </Typography>
            </Alert>
          ))}
        </Box>
      )}

      {/* Summary stats */}
      <SummaryStatBar
        counts={counts}
        activeFilter={typeFilter}
        onFilterClick={setTypeFilter}
      />

      {/* Column intensity */}
      <Box sx={{ mt: 2 }}>
        <ColumnIntensityBar intensities={diffResult.columnIntensities} />
      </Box>

      {/* Grouped tables */}
      {Array.from(grouped.entries()).map(([groupKey, groupedRows]) => {
        const displayRows = groupedRows.slice(0, ROW_LIMIT);
        const truncated = groupedRows.length - displayRows.length;

        return (
          <Box key={groupKey} sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography variant='subtitle2' fontWeight={700}>
                {groupKey}
              </Typography>
              <Chip
                label={`${groupedRows.length.toLocaleString()} rows`}
                size='small'
                variant='outlined'
                sx={{ fontSize: '0.65rem', height: 18 }}
              />
            </Box>
            <TableContainer
              component={Paper}
              variant='outlined'
              sx={{ maxHeight: 500, overflow: 'auto' }}
            >
              <Table size='small' stickyHeader>
                <TableHead>
                  <TableRow>
                    {uniqueVisibleColumns.map((col) => (
                      <TableCell
                        key={col}
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.7rem',
                          fontFamily: 'var(--font-ibm-plex-mono)',
                          bgcolor: keyColumnSet.has(col)
                            ? theme.palette.grey[100]
                            : undefined,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {col}
                        {keyColumnSet.has(col) && ' 🔑'}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {displayRows.map((row: RowDiff, idx: number) => (
                    <TableRow
                      key={`${row.key}-${idx}`}
                      sx={{ bgcolor: TYPE_BG[row.type] }}
                    >
                      {uniqueVisibleColumns.map((col) => (
                        <TableCell
                          key={col}
                          sx={{
                            py: 0.25,
                            px: 0.75,
                            borderRight: '1px solid',
                            borderColor: 'divider',
                          }}
                        >
                          <CellValue
                            oldVal={row.oldRow?.[col]}
                            newVal={row.newRow?.[col]}
                            isKey={keyColumnSet.has(col)}
                            showUnchanged={showUnchangedCols}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {truncated > 0 && (
              <Typography
                variant='caption'
                color='text.secondary'
                sx={{ mt: 0.5, display: 'block' }}
              >
                {truncated.toLocaleString()} additional rows not shown.
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
