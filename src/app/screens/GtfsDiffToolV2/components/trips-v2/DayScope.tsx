'use client';

import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Typography,
  alpha,
} from '@mui/material';
import React from 'react';
import type { DayDescription } from '../../lib/trips-v2-days';
import { DAY_PICKER_ID } from './DayPickerCard';

interface DayScopeProps {
  day: DayDescription;
  /** The day's trips are loading; the previous day is still shown. */
  loading: boolean;
  error?: Error;
}

/**
 * Everything worked out for the chosen day sits in this tinted section,
 * under a band naming the day that stays in view while scrolling, so no
 * table reads as if it covered the whole feed.
 */
export default function DayScope({
  day,
  loading,
  error,
  children,
}: React.PropsWithChildren<DayScopeProps>): React.ReactElement {
  return (
    <Box
      component='section'
      aria-label={`Changes on ${day.title}`}
      sx={{
        bgcolor: (t) => alpha(t.palette.primary.main, 0.05),
        borderRadius: '10px',
        p: { xs: 1.5, sm: 2 },
        mb: 3,
      }}
    >
      <Box
        sx={{
          position: 'sticky',
          // Below the fixed site header.
          top: { xs: 56, sm: 64 },
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
          px: 2,
          py: 1.25,
          mb: 1.5,
          borderRadius: '6px',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography
            variant='caption'
            sx={{ opacity: 0.85, display: 'block', lineHeight: 1.2 }}
          >
            Changes on
          </Typography>
          <Typography
            component='h2'
            sx={{ fontWeight: 700, fontSize: '1.15rem', lineHeight: 1.3 }}
          >
            {day.title}
          </Typography>
        </Box>
        <Button
          size='small'
          variant='outlined'
          color='inherit'
          onClick={() =>
            document
              .getElementById(DAY_PICKER_ID)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          sx={{ textTransform: 'none', borderColor: 'currentColor' }}
        >
          Change day
        </Button>
        {loading ? (
          <LinearProgress
            color='inherit'
            sx={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 3,
              borderRadius: '0 0 6px 6px',
            }}
          />
        ) : null}
      </Box>
      {day.note ? (
        <Typography
          variant='body2'
          color='text.secondary'
          sx={{ mb: 2, px: 0.5 }}
        >
          {day.note}
          {loading
            ? ' Loading this day’s trips… still showing the previous day.'
            : ''}
        </Typography>
      ) : null}
      {error != null ? (
        <Alert severity='error' sx={{ mb: 2 }}>
          Could not load this day&apos;s trips: {error.message}
        </Alert>
      ) : null}
      {children}
    </Box>
  );
}
