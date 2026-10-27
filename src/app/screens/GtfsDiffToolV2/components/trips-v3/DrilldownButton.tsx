'use client';

import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import { Close, InfoOutlined } from '@mui/icons-material';
import React, { useState } from 'react';
import type { TripPair } from '../../lib/trips-types';
import TechnicalDrilldownCard from '../trips-v2/TechnicalDrilldownCard';

interface DrilldownButtonProps {
  /** Pairs in scope: the day's, or one route's. */
  pairs: TripPair[];
  /** The day compared: "Weekday · Tue 8 Sep". */
  scope: string;
  /** What the pairs cover: "Every route", "Route 24". */
  subject: string;
}

/**
 * The technical drill-down (ID-only trips, trip_id mapping, raw field
 * counts) behind an info icon, in a popup.
 */
export default function DrilldownButton({
  pairs,
  scope,
  subject,
}: DrilldownButtonProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip title='Technical drill-down'>
        <IconButton
          size='small'
          aria-label='Technical drill-down'
          onClick={() => setOpen(true)}
        >
          <InfoOutlined />
        </IconButton>
      </Tooltip>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth='md'
        fullWidth
        scroll='paper'
      >
        <DialogTitle
          sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant='h6' component='div' fontWeight={700}>
              Technical drill-down
            </Typography>
            <Typography variant='caption' color='text.secondary'>
              {subject} · {scope}
            </Typography>
          </Box>
          <IconButton
            size='small'
            onClick={() => setOpen(false)}
            aria-label='Close'
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <TechnicalDrilldownCard
            bare
            pairs={pairs}
            scope={scope}
            subject={subject}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
