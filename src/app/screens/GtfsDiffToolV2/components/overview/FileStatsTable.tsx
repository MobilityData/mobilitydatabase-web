'use client';

import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import React from 'react';
import { MONO_FONT } from '../calendar/shared';

/** Row counts of one GTFS file between the two feeds. */
export interface FileStatRow {
  file: string;
  before: number;
  after: number;
  added: number;
  removed: number;
  modified: number;
}

const COLUMNS: Array<{
  label: string;
  value: (r: FileStatRow) => number;
  color?: string;
}> = [
  { label: 'Rows before', value: (r) => r.before },
  { label: 'Rows after', value: (r) => r.after },
  { label: 'Added', value: (r) => r.added, color: '#2e7d32' },
  { label: 'Removed', value: (r) => r.removed, color: '#d32f2f' },
  { label: 'Modified', value: (r) => r.modified, color: '#ed6c02' },
];

/** One row per file, one column per measure. */
export default function FileStatsTable({
  rows,
}: {
  rows: FileStatRow[];
}): React.ReactElement {
  const head = { fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' };
  const cell = { fontSize: '0.85rem', fontVariantNumeric: 'tabular-nums' };
  return (
    <Box sx={{ mb: 3, overflowX: 'auto' }}>
      <Table size='small' aria-label='Row changes per file'>
        <TableHead>
          <TableRow>
            <TableCell sx={head}>File</TableCell>
            {COLUMNS.map((c) => (
              <TableCell key={c.label} align='right' sx={head}>
                {c.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.file}>
              <TableCell
                component='th'
                scope='row'
                sx={{ ...cell, fontFamily: MONO_FONT, fontWeight: 700 }}
              >
                {r.file}
              </TableCell>
              {COLUMNS.map((c) => {
                const v = c.value(r);
                return (
                  <TableCell
                    key={c.label}
                    align='right'
                    sx={{ ...cell, color: v ? c.color : undefined }}
                  >
                    {v.toLocaleString()}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
