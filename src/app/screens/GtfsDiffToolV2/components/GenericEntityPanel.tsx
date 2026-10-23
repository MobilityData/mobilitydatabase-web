'use client';

import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import React, { useMemo, useState } from 'react';
import type {
  DiffType,
  EntityChange,
  EntityTypeDiff,
} from '../lib/entity-diff-types';
import SummaryStatBar from '../../GtfsDiffTool/components/SummaryStatBar';
import { DiffBadge } from '../../GtfsDiffTool/components/EntityCard';
import { useEntityChanges } from '../lib/useEntityChanges';

const MONO_FONT = 'var(--font-ibm-plex-mono)';
const FIELD_PREVIEW = 3;
const cellSx = {
  fontFamily: MONO_FONT,
  fontSize: '0.72rem',
  verticalAlign: 'top',
};

function FieldChanges({
  change,
}: {
  change: EntityChange;
}): React.ReactElement | null {
  const fc = change.field_changes ?? [];
  if (fc.length === 0) return null;
  const line = (c: (typeof fc)[number]): React.ReactElement => (
    <Box key={c.field} sx={{ whiteSpace: 'nowrap' }}>
      <Box component='span' sx={{ color: 'text.secondary' }}>
        {c.field}:{' '}
      </Box>
      <Box component='span' sx={{ color: '#d32f2f' }}>
        {c.base_value || '∅'}
      </Box>
      {' → '}
      <Box component='span' sx={{ color: '#2e7d32' }}>
        {c.new_value || '∅'}
      </Box>
    </Box>
  );
  return (
    <Box>
      {fc.slice(0, FIELD_PREVIEW).map(line)}
      {fc.length > FIELD_PREVIEW && (
        <Tooltip title={<Box>{fc.slice(FIELD_PREVIEW).map(line)}</Box>}>
          <Typography variant='caption' color='primary' sx={{ cursor: 'help' }}>
            +{fc.length - FIELD_PREVIEW} more fields
          </Typography>
        </Tooltip>
      )}
    </Box>
  );
}

function ChildChanges({
  change,
}: {
  change: EntityChange;
}): React.ReactElement | null {
  if (!change.children) return null;
  return (
    <Box>
      {Object.entries(change.children).map(([file, c]) => (
        <Box key={file} sx={{ whiteSpace: 'nowrap' }}>
          <Box component='span' sx={{ color: 'text.secondary' }}>
            {file}{' '}
          </Box>
          {c.added > 0 && (
            <Box component='span' sx={{ color: '#2e7d32', mr: 0.75 }}>
              +{c.added}
            </Box>
          )}
          {c.deleted > 0 && (
            <Box component='span' sx={{ color: '#d32f2f', mr: 0.75 }}>
              −{c.deleted}
            </Box>
          )}
          {c.modified > 0 && (
            <Box component='span' sx={{ color: '#ed6c02' }}>
              ~{c.modified}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}

function EntityTypeTable({
  entityType,
}: {
  entityType: EntityTypeDiff;
}): React.ReactElement {
  const [filter, setFilter] = useState<DiffType | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const rows = useMemo(
    () =>
      filter
        ? entityType.changes.filter((c) => c.status === filter)
        : entityType.changes,
    [entityType.changes, filter],
  );
  // Long lists live in Parquet and are read a page at a time.
  const remoteUrl = entityType.changes_table?.url;
  const remote = useEntityChanges(
    remoteUrl,
    filter,
    page * rowsPerPage,
    rowsPerPage,
  );
  const pageRows =
    remoteUrl != null
      ? remote.rows
      : rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const total = remoteUrl != null ? remote.total : rows.length;
  const sample = remoteUrl != null ? remote.rows : entityType.changes;
  const contextCols = Object.keys(sample.find((c) => c.context)?.context ?? {});
  const hasChildren =
    entityType.child_files.length > 0 || sample.some((c) => c.children);
  const presence = !entityType.present.base
    ? 'Added in new feed'
    : !entityType.present.new
      ? 'Removed in new feed'
      : null;

  return (
    <Box
      sx={{ bgcolor: 'background.paper', borderRadius: '6px', p: 2.5, mb: 3 }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 2,
          flexWrap: 'wrap',
          mb: 1.5,
        }}
      >
        <Typography sx={{ fontFamily: MONO_FONT, fontWeight: 700 }}>
          {entityType.file}
          {entityType.child_files.length > 0 && (
            <Typography
              component='span'
              variant='caption'
              color='text.secondary'
              sx={{ ml: 1 }}
            >
              + {entityType.child_files.join(', ')}
            </Typography>
          )}
        </Typography>
        <Typography variant='caption' color='text.secondary'>
          Key: {entityType.primary_key.join(', ') || '(row)'} ·{' '}
          {entityType.total.base.toLocaleString()} →{' '}
          {entityType.total.new.toLocaleString()} entities
        </Typography>
        {presence && (
          <Typography variant='caption' fontWeight={700}>
            {presence}
          </Typography>
        )}
      </Box>
      <SummaryStatBar
        counts={entityType.counts}
        activeFilter={filter}
        onFilterClick={(f) => {
          setFilter(f === 'unchanged' ? null : f);
          setPage(0);
        }}
      />
      {remote.error != null && (
        <Typography color='error' variant='body2' sx={{ mt: 2 }}>
          Could not read {entityType.changes_table?.path}:{' '}
          {remote.error.message}
        </Typography>
      )}
      {(total > 0 || (remoteUrl != null && remote.loading)) && (
        <>
          <TableContainer sx={{ mt: 2 }}>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>
                    {entityType.primary_key.join(' / ') || 'Row'}
                  </TableCell>
                  {pageRows.some((r) => r.label) && (
                    <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                  )}
                  {contextCols.map((c) => (
                    <TableCell key={c} sx={{ fontWeight: 700 }}>
                      {c}
                    </TableCell>
                  ))}
                  <TableCell sx={{ fontWeight: 700 }}>Field changes</TableCell>
                  {hasChildren && (
                    <TableCell sx={{ fontWeight: 700 }}>Child rows</TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {pageRows.map((c) => (
                  <TableRow key={`${c.status}-${c.key}`} hover>
                    <TableCell>
                      <DiffBadge type={c.status} />
                    </TableCell>
                    <TableCell sx={{ ...cellSx, fontWeight: 700 }}>
                      {c.key}
                    </TableCell>
                    {pageRows.some((r) => r.label) && (
                      <TableCell
                        sx={{ fontSize: '0.78rem', verticalAlign: 'top' }}
                      >
                        {c.label ?? ''}
                      </TableCell>
                    )}
                    {contextCols.map((col) => (
                      <TableCell key={col} sx={cellSx}>
                        {c.context?.[col] ?? ''}
                      </TableCell>
                    ))}
                    <TableCell sx={cellSx}>
                      <FieldChanges change={c} />
                    </TableCell>
                    {hasChildren && (
                      <TableCell sx={cellSx}>
                        <ChildChanges change={c} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component='div'
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[25, 50, 100]}
          />
        </>
      )}
    </Box>
  );
}

interface GenericEntityPanelProps {
  entityTypes: EntityTypeDiff[];
}

export default function GenericEntityPanel({
  entityTypes,
}: GenericEntityPanelProps): React.ReactElement {
  if (entityTypes.length === 0) {
    return (
      <Typography color='text.secondary'>
        None of these files are present in either feed.
      </Typography>
    );
  }
  return (
    <Box>
      {entityTypes.map((et) => (
        <EntityTypeTable key={et.file} entityType={et} />
      ))}
    </Box>
  );
}
