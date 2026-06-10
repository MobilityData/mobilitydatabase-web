'use client';

import {
  Alert,
  Box,
  Chip,
  Collapse,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import React, { useMemo, useState } from 'react';
import { List } from 'react-window';
import type { CSSProperties } from 'react';
import type {
  FileDiff,
  FieldChange,
  RowAdded,
  RowDeleted,
  RowModified,
} from '../lib/gtfs-diff-types';

// ── Constants ──────────────────────────────────────────────────────

const COLORS = {
  added: '#2e7d32',
  deleted: '#d32f2f',
  modified: '#ed6c02',
  not_compared: '#757575',
  addedBg: 'rgba(46,125,50,.07)',
  deletedBg: 'rgba(211,47,47,.07)',
  modifiedBg: 'rgba(237,108,2,.07)',
};

const MONO_FONT = 'var(--font-ibm-plex-mono)';
const ROW_H = 30;       // px — virtual row height
const HDR_H = 36;       // px — virtual list header height
const MAX_LIST_H = 440; // px — max virtual list body height
const LINE_COL_W = 72;  // px — "Line #" column width

// ── Helpers ────────────────────────────────────────────────────────

function colWidth(name: string): number {
  return Math.max(72, Math.min(name.length * 9 + 16, 200));
}

/** RFC 4180-aware CSV parser for a single line. */
function parseCSVRow(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      result.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function identifierLabel(identifier: Record<string, string>): string {
  return Object.values(identifier).join(' / ');
}

// Inline style for virtual row cells (avoids MUI sx overhead per cell).
const cellStyle: CSSProperties = {
  fontFamily: MONO_FONT,
  fontSize: '0.68rem',
  paddingLeft: 8,
  paddingRight: 8,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  display: 'flex',
  alignItems: 'center',
  boxSizing: 'border-box',
  flexShrink: 0,
};

// ── Virtual row components (module-level — never re-created) ───────

type VirtualBase = {
  ariaAttributes: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' };
  index: number;
  style: CSSProperties;
};

type AddedVirtualProps = {
  rows: RowAdded[];
  columns: string[];
  colWidths: number[];
  pkSet: Set<string>;
};

function AddedVirtualRow({
  ariaAttributes,
  index,
  style,
  rows,
  columns,
  colWidths,
  pkSet,
}: VirtualBase & AddedVirtualProps): React.ReactElement {
  const row = rows[index];
  const vals = parseCSVRow(row.raw_value);
  return (
    <Box
      {...ariaAttributes}
      style={style}
      sx={{
        display: 'flex',
        alignItems: 'center',
        bgcolor: COLORS.addedBg,
        borderBottom: '1px solid rgba(0,0,0,0.04)',
      }}
    >
      <span style={{ ...cellStyle, width: LINE_COL_W, color: '#777' }}>{row.new_line_number}</span>
      {columns.map((col, ci) => (
        <span
          key={col}
          style={{
            ...cellStyle,
            width: colWidths[ci],
            color: COLORS.added,
            fontWeight: pkSet.has(col) ? 700 : 400,
          }}
        >
          {vals[ci] ?? ''}
        </span>
      ))}
    </Box>
  );
}

type DeletedVirtualProps = {
  rows: RowDeleted[];
  columns: string[];
  colWidths: number[];
  pkSet: Set<string>;
};

function DeletedVirtualRow({
  ariaAttributes,
  index,
  style,
  rows,
  columns,
  colWidths,
  pkSet,
}: VirtualBase & DeletedVirtualProps): React.ReactElement {
  const row = rows[index];
  const vals = parseCSVRow(row.raw_value);
  return (
    <Box
      {...ariaAttributes}
      style={style}
      sx={{
        display: 'flex',
        alignItems: 'center',
        bgcolor: COLORS.deletedBg,
        borderBottom: '1px solid rgba(0,0,0,0.04)',
      }}
    >
      <span style={{ ...cellStyle, width: LINE_COL_W, color: '#777' }}>{row.base_line_number}</span>
      {columns.map((col, ci) => (
        <span
          key={col}
          style={{
            ...cellStyle,
            width: colWidths[ci],
            color: COLORS.deleted,
            fontWeight: pkSet.has(col) ? 700 : 400,
          }}
        >
          {vals[ci] ?? ''}
        </span>
      ))}
    </Box>
  );
}

// ── VirtualRowTable — used for added and deleted rows ──────────────

interface VirtualRowTableProps {
  rowType: 'added' | 'deleted';
  rows: RowAdded[] | RowDeleted[];
  columns: string[];
  primaryKey: string[];
}

function VirtualRowTable({
  rowType,
  rows,
  columns,
  primaryKey,
}: VirtualRowTableProps): React.ReactElement {
  const pkSet = useMemo(() => new Set(primaryKey), [primaryKey]);
  const colWidths = useMemo(() => columns.map(colWidth), [columns]);
  const totalWidth = LINE_COL_W + colWidths.reduce((s, w) => s + w, 0);
  const listHeight = Math.min(rows.length * ROW_H, MAX_LIST_H);
  const emptyLabel = rowType === 'added' ? 'No added rows.' : 'No deleted rows.';

  if (rows.length === 0) {
    return (
      <Typography variant='body2' color='text.secondary'>
        {emptyLabel}
      </Typography>
    );
  }

  return (
    // Outer wrapper handles horizontal scroll for both header and body together.
    <Box
      sx={{
        overflowX: 'auto',
        borderRadius: '4px',
      }}
    >
      {/* Header (always visible above the scrollable List) */}
      <Box
        sx={{
          display: 'flex',
          minWidth: totalWidth,
          height: HDR_H,
          bgcolor: 'background.paper',
        }}
      >
        <Box
          sx={{
            fontFamily: MONO_FONT,
            fontSize: '0.68rem',
            fontWeight: 700,
            width: LINE_COL_W,
            flexShrink: 0,
            px: 1,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          Line
        </Box>
        {columns.map((col, ci) => (
          <Box
            key={col}
            sx={{
              fontFamily: MONO_FONT,
              fontSize: '0.68rem',
              fontWeight: pkSet.has(col) ? 700 : 400,
              width: colWidths[ci],
              flexShrink: 0,
              px: 1,
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}
          >
            {col}
          </Box>
        ))}
      </Box>

      {/* Virtual body — List handles vertical scroll; outer Box handles horizontal */}
      {rowType === 'added' ? (
        <List<AddedVirtualProps>
          rowCount={rows.length}
          rowHeight={ROW_H}
          rowComponent={AddedVirtualRow}
          rowProps={{ rows: rows as RowAdded[], columns, colWidths, pkSet }}
          style={{ height: listHeight, minWidth: totalWidth, overflowX: 'hidden' }}
          defaultHeight={MAX_LIST_H}
          overscanCount={8}
        />
      ) : (
        <List<DeletedVirtualProps>
          rowCount={rows.length}
          rowHeight={ROW_H}
          rowComponent={DeletedVirtualRow}
          rowProps={{ rows: rows as RowDeleted[], columns, colWidths, pkSet }}
          style={{ height: listHeight, minWidth: totalWidth, overflowX: 'hidden' }}
          defaultHeight={MAX_LIST_H}
          overscanCount={8}
        />
      )}
    </Box>
  );
}

// ── Modified rows table ────────────────────────────────────────────

function FieldChangeBadge({ change }: { change: FieldChange }): React.ReactElement {
  return (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', mr: 1.5, mb: 0.5, minWidth: 56 }}>
      <Typography
        variant='caption'
        sx={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: '0.65rem' }}
      >
        {change.field}
      </Typography>
      <Typography
        variant='caption'
        sx={{
          fontFamily: MONO_FONT,
          fontSize: '0.65rem',
          textDecoration: 'line-through',
          color: COLORS.deleted,
        }}
      >
        {change.base_value || '(empty)'}
      </Typography>
      <Typography
        variant='caption'
        sx={{ fontFamily: MONO_FONT, fontSize: '0.65rem', color: COLORS.added, fontWeight: 500 }}
      >
        {change.new_value || '(empty)'}
      </Typography>
    </Box>
  );
}

interface ModifiedRowsTableProps {
  rows: RowModified[];
  columns: string[];
  primaryKey: string[];
  viewMode: 'summary' | 'inline';
}

function ModifiedRowsTable({ rows, columns, viewMode }: ModifiedRowsTableProps): React.ReactElement {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleRow = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });

  if (rows.length === 0) {
    return (
      <Typography variant='body2' color='text.secondary'>
        No modified rows.
      </Typography>
    );
  }

  return (
    <>
      <TableContainer
        sx={{
          maxHeight: MAX_LIST_H + HDR_H,
          borderRadius: '4px',
          overflowX: 'auto',
        }}
      >
        {viewMode === 'summary' ? (
          <Table size='small' stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 36, px: 0.5, bgcolor: 'background.paper' }} />
                <TableCell sx={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: '0.7rem', bgcolor: 'background.paper' }}>
                  Identifier
                </TableCell>
                <TableCell sx={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: '0.7rem', bgcolor: 'background.paper' }}>
                  Base line
                </TableCell>
                <TableCell sx={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: '0.7rem', bgcolor: 'background.paper' }}>
                  New line
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: 'background.paper' }}>
                  Changes
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, i) => {
                const isExpanded = expanded.has(i);
                const fcMap = new Map(row.field_changes.map((f) => [f.field, f]));
                const baseVals = parseCSVRow(row.raw_value);

                return (
                  <React.Fragment key={i}>
                    {/* Summary row */}
                    <TableRow sx={{ bgcolor: COLORS.modifiedBg, verticalAlign: 'top' }}>
                      <TableCell sx={{ px: 0.5, py: 0.5 }}>
                        <Tooltip title={isExpanded ? 'Collapse full row' : 'Expand full row'}>
                          <IconButton size='small' onClick={() => toggleRow(i)} sx={{ p: 0.25 }}>
                            {isExpanded
                              ? <ExpandLess sx={{ fontSize: '1rem' }} />
                              : <ExpandMore sx={{ fontSize: '1rem' }} />
                            }
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.7rem', py: 0.5, color: 'text.secondary' }}>
                        {identifierLabel(row.identifier)}
                      </TableCell>
                      <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.7rem', py: 0.5 }}>
                        {row.base_line_number}
                      </TableCell>
                      <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.7rem', py: 0.5 }}>
                        {row.new_line_number}
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                          {row.field_changes.map((fc) => (
                            <FieldChangeBadge key={fc.field} change={fc} />
                          ))}
                        </Box>
                      </TableCell>
                    </TableRow>

                    {/* Expanded: full row view showing base → new for every column */}
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={5} sx={{ p: 0, bgcolor: 'background.default' }}>
                          <Box sx={{ overflowX: 'auto', borderTop: '1px solid', borderColor: 'divider' }}>
                            <Table size='small'>
                              <TableHead>
                                <TableRow>
                                  <TableCell
                                    sx={{ fontFamily: MONO_FONT, fontSize: '0.65rem', py: 0.5, px: 1, fontWeight: 700, whiteSpace: 'nowrap' }}
                                  />
                                  {columns.map((col) => (
                                    <TableCell
                                      key={col}
                                      sx={{
                                        fontFamily: MONO_FONT,
                                        fontSize: '0.65rem',
                                        py: 0.5,
                                        px: 1,
                                        fontWeight: fcMap.has(col) ? 700 : 400,
                                        color: fcMap.has(col) ? COLORS.modified : 'inherit',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {col}
                                      {fcMap.has(col) && (
                                        <Box component='span' sx={{ ml: 0.25, color: COLORS.modified, verticalAlign: 'middle' }}>
                                          ●
                                        </Box>
                                      )}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {/* Base values row */}
                                <TableRow>
                                  <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.6rem', py: 0.5, px: 1, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                                    base
                                  </TableCell>
                                  {columns.map((col, ci) => {
                                    const fc = fcMap.get(col);
                                    return (
                                      <TableCell
                                        key={col}
                                        sx={{
                                          fontFamily: MONO_FONT,
                                          fontSize: '0.65rem',
                                          py: 0.5,
                                          px: 1,
                                          whiteSpace: 'nowrap',
                                          bgcolor: fc ? 'rgba(211,47,47,.08)' : 'transparent',
                                          color: fc ? COLORS.deleted : 'text.secondary',
                                          textDecoration: fc ? 'line-through' : 'none',
                                        }}
                                      >
                                        {fc ? fc.base_value || '(empty)' : (baseVals[ci] ?? '')}
                                      </TableCell>
                                    );
                                  })}
                                </TableRow>
                                {/* New values row */}
                                <TableRow>
                                  <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.6rem', py: 0.5, px: 1, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                                    new
                                  </TableCell>
                                  {columns.map((col, ci) => {
                                    const fc = fcMap.get(col);
                                    return (
                                      <TableCell
                                        key={col}
                                        sx={{
                                          fontFamily: MONO_FONT,
                                          fontSize: '0.65rem',
                                          py: 0.5,
                                          px: 1,
                                          whiteSpace: 'nowrap',
                                          bgcolor: fc ? 'rgba(46,125,50,.08)' : 'transparent',
                                          color: fc ? COLORS.added : 'text.secondary',
                                          fontWeight: fc ? 600 : 400,
                                        }}
                                      >
                                        {fc ? fc.new_value || '(empty)' : (baseVals[ci] ?? '')}
                                      </TableCell>
                                    );
                                  })}
                                </TableRow>
                              </TableBody>
                            </Table>
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          /* ── Inline diff view ─────────────────────────────────────── */
          <Table size='small' stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: '0.7rem', bgcolor: 'background.paper', whiteSpace: 'nowrap' }}>
                  Identifier
                </TableCell>
                {columns.map((col) => (
                  <TableCell key={col} sx={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: '0.65rem', bgcolor: 'background.paper', whiteSpace: 'nowrap' }}>
                    {col}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, i) => {
                const fcMap = new Map(row.field_changes.map((f) => [f.field, f]));
                const baseVals = parseCSVRow(row.raw_value);
                return (
                  <TableRow key={i} sx={{ bgcolor: COLORS.modifiedBg, verticalAlign: 'top' }}>
                    <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.7rem', py: 0.5, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                      {identifierLabel(row.identifier)}
                    </TableCell>
                    {columns.map((col, ci) => {
                      const fc = fcMap.get(col);
                      if (!fc) {
                        return (
                          <TableCell key={col} sx={{ fontFamily: MONO_FONT, fontSize: '0.65rem', py: 0.5, whiteSpace: 'nowrap', color: 'text.secondary' }}>
                            {baseVals[ci] ?? ''}
                          </TableCell>
                        );
                      }
                      return (
                        <TableCell key={col} sx={{ py: 0.5, whiteSpace: 'nowrap' }}>
                          {fc.base_value != null && fc.base_value !== '' && (
                            <Box
                              component='span'
                              sx={{
                                fontFamily: MONO_FONT,
                                fontSize: '0.65rem',
                                color: COLORS.deleted,
                                textDecoration: 'line-through',
                                mr: 0.5,
                              }}
                            >
                              {fc.base_value}
                            </Box>
                          )}
                          <Box
                            component='span'
                            sx={{
                              fontFamily: MONO_FONT,
                              fontSize: '0.65rem',
                              color: COLORS.added,
                              fontWeight: 600,
                            }}
                          >
                            {fc.new_value || '(empty)'}
                          </Box>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableContainer>
    </>
  );
}

// ── Column changes ─────────────────────────────────────────────────

function ColumnChanges({ diff }: { diff: FileDiff }): React.ReactElement | null {
  const columnsAdded = diff.columns_added ?? [];
  const columnsDeleted = diff.columns_deleted ?? [];
  if (columnsAdded.length === 0 && columnsDeleted.length === 0) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant='body2' fontWeight={600} sx={{ mb: 1 }}>
        Column Changes
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {columnsAdded.map((col) => (
          <Chip
            key={`a-${col.name}`}
            label={`+ ${col.name} (pos ${col.position})`}
            size='small'
            sx={{ color: COLORS.added, border: `1px solid ${COLORS.added}`, bgcolor: 'transparent' }}
          />
        ))}
        {columnsDeleted.map((col) => (
          <Chip
            key={`d-${col.name}`}
            label={`− ${col.name} (pos ${col.position})`}
            size='small'
            sx={{ color: COLORS.deleted, border: `1px solid ${COLORS.deleted}`, bgcolor: 'transparent' }}
          />
        ))}
      </Box>
    </Box>
  );
}

// ── Single file panel ──────────────────────────────────────────────

interface FileDiffPanelProps {
  diff: FileDiff;
}

function FileDiffPanel({ diff }: FileDiffPanelProps): React.ReactElement {
  const rc = diff.row_changes;
  const addedCount = rc?.added.length ?? 0;
  const deletedCount = rc?.deleted.length ?? 0;
  const modifiedCount = rc?.modified.length ?? 0;
  const omitted = diff.truncated?.omitted_count ?? 0;
  const columnsAdded = diff.columns_added ?? [];
  const columnsDeleted = diff.columns_deleted ?? [];
  const ignoredColumns = diff.ignored_columns ?? [];

  // Default to the tab that has data, preferring modified → added → deleted.
  const [tab, setTab] = useState<'added' | 'deleted' | 'modified'>(() => {
    if (modifiedCount > 0) return 'modified';
    if (addedCount > 0) return 'added';
    return 'deleted';
  });
  const [open, setOpen] = useState(false);
  const [modifiedViewMode, setModifiedViewMode] = useState<'summary' | 'inline'>('summary');

  const statusColor =
    diff.file_action === 'added'
      ? COLORS.added
      : diff.file_action === 'deleted'
        ? COLORS.deleted
        : diff.file_action === 'not_compared'
          ? COLORS.not_compared
          : COLORS.modified;

  const hasRowChanges = rc
    ? addedCount + deletedCount + modifiedCount > 0 || omitted > 0
    : false;

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        borderRadius: '6px',
        mb: 2,
        overflow: 'hidden',
      }}
    >
      {/* ── Header bar ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 1.5,
          flexWrap: 'wrap',
          bgcolor: 'background.paper',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <Typography variant='body1' fontWeight={700} sx={{ fontFamily: MONO_FONT }}>
          {diff.file_name}
        </Typography>
        <Chip
          label={diff.file_action.toUpperCase().replace('_', ' ')}
          size='small'
          sx={{ bgcolor: statusColor, color: '#fff', fontWeight: 700, fontSize: '0.65rem' }}
        />

        {/* True counts from stats (includes truncated rows) */}
        {diff.stats != null ? (
          <>
            {(diff.stats.rows_added_count ?? 0) > 0 && (
              <Typography variant='caption' sx={{ color: COLORS.added }}>
                +{(diff.stats.rows_added_count ?? 0).toLocaleString()} rows
              </Typography>
            )}
            {(diff.stats.rows_deleted_count ?? 0) > 0 && (
              <Typography variant='caption' sx={{ color: COLORS.deleted }}>
                −{(diff.stats.rows_deleted_count ?? 0).toLocaleString()} rows
              </Typography>
            )}
            {(diff.stats.rows_modified_count ?? 0) > 0 && (
              <Typography variant='caption' sx={{ color: COLORS.modified }}>
                ~{(diff.stats.rows_modified_count ?? 0).toLocaleString()} rows
              </Typography>
            )}
          </>
        ) : (
          <>
            {addedCount > 0 && (
              <Typography variant='caption' sx={{ color: COLORS.added }}>
                +{addedCount.toLocaleString()} rows
              </Typography>
            )}
            {deletedCount > 0 && (
              <Typography variant='caption' sx={{ color: COLORS.deleted }}>
                −{deletedCount.toLocaleString()} rows
              </Typography>
            )}
            {modifiedCount > 0 && (
              <Typography variant='caption' sx={{ color: COLORS.modified }}>
                ~{modifiedCount.toLocaleString()} rows
              </Typography>
            )}
          </>
        )}

        {omitted > 0 && (
          <Typography variant='caption' color='text.secondary'>
            ({omitted.toLocaleString()} more omitted)
          </Typography>
        )}

        {diff.stats?.rows_changed_percentage != null &&
          diff.stats.rows_changed_percentage > 0 && (
            <Chip
              label={`${diff.stats.rows_changed_percentage}% rows changed`}
              size='small'
              variant='outlined'
              sx={{ fontSize: '0.65rem' }}
            />
          )}
        <Tooltip title={open ? 'Collapse' : 'Expand'}>
          <IconButton size='small' sx={{ p: 0.25, ml: 'auto' }} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
            {open ? <ExpandLess sx={{ fontSize: '1rem' }} /> : <ExpandMore sx={{ fontSize: '1rem' }} />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Body ── */}
      <Collapse in={open}>
      <Box sx={{ p: 2 }}>
        {/* Not-compared reason */}
        {diff.file_action === 'not_compared' && diff.not_compared_reason && (
          <Alert severity='info' sx={{ mb: 2 }}>
            <Typography variant='body2' fontWeight={600}>
              Not compared ({diff.not_compared_reason.code})
            </Typography>
            <Typography variant='body2'>{diff.not_compared_reason.message}</Typography>
          </Alert>
        )}

        {/* Ignored columns */}
        {ignoredColumns.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant='body2' fontWeight={600} sx={{ mb: 1 }}>
              Ignored Columns
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {ignoredColumns.map((ic) => (
                <Chip
                  key={ic.column}
                  label={`${ic.column}: ${ic.reason.message}`}
                  size='small'
                  sx={{
                    color: COLORS.not_compared,
                    border: `1px solid ${COLORS.not_compared}`,
                    bgcolor: 'transparent',
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Column changes */}
        <ColumnChanges diff={diff} />

        {/* Row changes */}
        {rc && hasRowChanges ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
              <Tabs
                value={tab}
                onChange={(_, v) => setTab(v)}
                sx={{ minHeight: 36, flexShrink: 0 }}
                TabIndicatorProps={{ style: { height: 2 } }}
              >
                <Tab
                  label={`Added (${addedCount.toLocaleString()})`}
                  value='added'
                  sx={{ minHeight: 36, fontSize: '0.8rem', textTransform: 'none' }}
                />
                <Tab
                  label={`Deleted (${deletedCount.toLocaleString()})`}
                  value='deleted'
                  sx={{ minHeight: 36, fontSize: '0.8rem', textTransform: 'none' }}
                />
                <Tab
                  label={`Modified (${modifiedCount.toLocaleString()})`}
                  value='modified'
                  sx={{ minHeight: 36, fontSize: '0.8rem', textTransform: 'none' }}
                />
              </Tabs>
              {tab === 'modified' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ml: 2 }}>
                  <Typography variant='caption' color='text.secondary'>View:</Typography>
                  <Chip
                    label='Summary'
                    size='small'
                    variant={modifiedViewMode === 'summary' ? 'filled' : 'outlined'}
                    onClick={() => setModifiedViewMode('summary')}
                    sx={{ fontSize: '0.65rem', cursor: 'pointer' }}
                  />
                  <Chip
                    label='Inline diff'
                    size='small'
                    variant={modifiedViewMode === 'inline' ? 'filled' : 'outlined'}
                    onClick={() => setModifiedViewMode('inline')}
                    sx={{ fontSize: '0.65rem', cursor: 'pointer' }}
                  />
                </Box>
              )}
            </Box>

            {tab === 'added' && (
              <VirtualRowTable
                rowType='added'
                rows={rc.added}
                columns={rc.columns}
                primaryKey={rc.primary_key}
              />
            )}
            {tab === 'deleted' && (
              <VirtualRowTable
                rowType='deleted'
                rows={rc.deleted}
                columns={rc.columns}
                primaryKey={rc.primary_key}
              />
            )}
            {tab === 'modified' && (
              <ModifiedRowsTable
                rows={rc.modified}
                columns={rc.columns}
                primaryKey={rc.primary_key}
                viewMode={modifiedViewMode}
              />
            )}
          </>
        ) : columnsAdded.length === 0 && columnsDeleted.length === 0 ? (
          <Typography variant='body2' color='text.secondary'>
            No row or column changes in this file.
          </Typography>
        ) : null}
      </Box>
      </Collapse>
    </Box>
  );
}

// ── Top-level component ────────────────────────────────────────────

interface GtfsDiffFileDiffPanelProps {
  fileDiffs: FileDiff[];
}

type FilterAction = 'all' | 'added' | 'deleted' | 'modified' | 'not_compared';

export default function GtfsDiffFileDiffPanel({
  fileDiffs,
}: GtfsDiffFileDiffPanelProps): React.ReactElement {
  const [filter, setFilter] = useState<FilterAction>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? fileDiffs : fileDiffs.filter((d) => d.file_action === filter)),
    [fileDiffs, filter],
  );

  if (fileDiffs.length === 0) {
    return (
      <Alert severity='success'>
        No file-level changes detected — the two feeds are identical.
      </Alert>
    );
  }

  return (
    <Box>
      {/* Filter toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <FormControl size='small' sx={{ minWidth: 180 }}>
          <InputLabel>Filter by action</InputLabel>
          <Select
            value={filter}
            label='Filter by action'
            onChange={(e) => setFilter(e.target.value as FilterAction)}
          >
            <MenuItem value='all'>All ({fileDiffs.length})</MenuItem>
            <MenuItem value='added'>
              Added ({fileDiffs.filter((d) => d.file_action === 'added').length})
            </MenuItem>
            <MenuItem value='modified'>
              Modified ({fileDiffs.filter((d) => d.file_action === 'modified').length})
            </MenuItem>
            <MenuItem value='deleted'>
              Deleted ({fileDiffs.filter((d) => d.file_action === 'deleted').length})
            </MenuItem>
            {fileDiffs.some((d) => d.file_action === 'not_compared') && (
              <MenuItem value='not_compared'>
                Not compared (
                {fileDiffs.filter((d) => d.file_action === 'not_compared').length})
              </MenuItem>
            )}
          </Select>
        </FormControl>
        <Typography variant='body2' color='text.secondary'>
          Showing {filtered.length} of {fileDiffs.length} file(s)
        </Typography>
      </Box>

      {filtered.map((diff) => (
        <FileDiffPanel key={diff.file_name} diff={diff} />
      ))}
    </Box>
  );
}
