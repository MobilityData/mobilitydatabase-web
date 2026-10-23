'use client';

import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import React from 'react';
import type { UnusedShapeDiff } from '../../lib/entity-diff-types';
import { shapeStatusHelp } from '../../lib/routes-utils';
import { formatDistance } from '../../lib/stops-utils';
import { MONO_FONT } from '../calendar/shared';
import { ShapeStatusChip } from './RouteShapes';

const cellSx = { fontSize: '0.75rem', py: 0.5 };

interface UnusedShapesProps {
  shapes: UnusedShapeDiff[];
  sameM: number;
  thresholdM: number;
}

/** Shapes in shapes.txt that no trip uses in either feed: dead data. */
export default function UnusedShapes({
  shapes,
  sameM,
  thresholdM,
}: UnusedShapesProps): React.ReactElement {
  return (
    <Box id='unused-shapes' sx={{ mb: 3, scrollMarginTop: 96 }}>
      <Typography variant='h6' fontWeight={700} sx={{ mb: 0.5 }}>
        Shapes no trip uses ({shapes.length.toLocaleString()})
      </Typography>
      <Typography variant='body2' color='text.secondary' sx={{ mb: 1.5 }}>
        In shapes.txt but referenced by no trip in either feed, so they belong
        to no route. They have no effect on riders and are usually leftovers.
      </Typography>
      <Box
        sx={{
          maxHeight: 320,
          overflowY: 'auto',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: '6px',
        }}
      >
        <Table size='small' stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>shape_id</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Change</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Deviation</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align='right'>
                Points
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {shapes.map((sh) => (
              <TableRow key={sh.shape_id}>
                <TableCell
                  sx={{ ...cellSx, fontFamily: MONO_FONT, fontWeight: 700 }}
                >
                  {sh.shape_id}
                </TableCell>
                <TableCell sx={cellSx}>
                  <ShapeStatusChip
                    status={sh.status}
                    help={shapeStatusHelp(sh.status, sameM, thresholdM)}
                  />
                </TableCell>
                <TableCell sx={cellSx}>
                  {sh.deviation_m == null
                    ? '—'
                    : formatDistance(sh.deviation_m)}
                </TableCell>
                <TableCell sx={cellSx} align='right'>
                  {sh.points.base === sh.points.new
                    ? sh.points.new
                    : `${sh.points.base} → ${sh.points.new}`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
