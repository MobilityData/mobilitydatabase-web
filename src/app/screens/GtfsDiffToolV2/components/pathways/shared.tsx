'use client';

import { Box } from '@mui/material';
import React from 'react';
import type { CellChange, Severity } from '../../lib/pathways-utils';
import type { LinkStatus, RowStatus } from '../../lib/pathways-types';

export { MONO_FONT } from '../calendar/shared';

/** Line / outline colours for the schematic and the field table. */
export const DIFF_COLORS = {
  added: '#2e7d32',
  removed: '#c62828',
  changed: '#c77700',
  unchanged: '#9e9e9e',
};

export function statusColor(status: LinkStatus | RowStatus): string {
  if (status === 'added') return DIFF_COLORS.added;
  if (status === 'deleted') return DIFF_COLORS.removed;
  if (status === 'modified') return DIFF_COLORS.changed;
  return DIFF_COLORS.unchanged;
}

/** Filled badge colours; white text reads on all of them in both themes. */
const BADGE_BG: Record<Severity, string> = {
  error: '#7f1d1d',
  success: '#3d5a1e',
  warning: '#7a4a0c',
  info: '#5a4a1a',
  neutral: 'transparent',
};

interface StatusBadgeProps {
  label: string;
  severity: Severity;
}

export function StatusBadge({
  label,
  severity,
}: StatusBadgeProps): React.ReactElement {
  const neutral = severity === 'neutral';
  return (
    <Box
      component='span'
      sx={{
        display: 'inline-block',
        px: 0.75,
        py: 0.25,
        borderRadius: '3px',
        fontSize: '0.68rem',
        fontWeight: 700,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        bgcolor: neutral ? 'action.selected' : BADGE_BG[severity],
        color: neutral ? 'text.secondary' : '#fff',
      }}
    >
      {label}
    </Box>
  );
}

/** Tinted background + border for a reachability cell or summary pill. */
export interface Tone {
  bg: string;
  border: string;
}

export const TONES: Record<Severity, Tone> = {
  error: { bg: 'rgba(198, 40, 40, 0.10)', border: '#c62828' },
  success: { bg: 'rgba(46, 125, 50, 0.10)', border: '#2e7d32' },
  warning: { bg: 'rgba(199, 119, 0, 0.12)', border: '#c77700' },
  info: {
    bg: 'rgba(57, 89, 250, 0.06)',
    border: 'var(--mui-palette-primary-main)',
  },
  neutral: { bg: 'var(--mui-palette-action-hover)', border: 'transparent' },
};

export const CHANGE_SEVERITY: Record<CellChange, Severity> = {
  lost: 'error',
  gained: 'success',
  slower: 'warning',
  faster: 'success',
  unchanged: 'neutral',
  none: 'neutral',
};

export const CHANGE_LABELS: Record<CellChange, string> = {
  lost: 'Lost',
  gained: 'Gained',
  slower: 'Slower',
  faster: 'Faster',
  unchanged: 'No change',
  none: 'No route',
};

interface SectionProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

/** Outlined panel with a title row, as used for each part of the page. */
export function Section({
  title,
  description,
  action,
  children,
}: SectionProps): React.ReactElement {
  return (
    <Box
      component='section'
      sx={{
        border: '1px solid',
        borderColor: 'primary.light',
        borderRadius: '6px',
        bgcolor: 'background.paper',
        p: { xs: 2, md: 2.5 },
        mb: 3,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
          mb: 2,
        }}
      >
        <Box>
          <Box
            component='h2'
            sx={{
              m: 0,
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'primary.main',
            }}
          >
            {title}
          </Box>
          {description != null ? (
            <Box
              component='p'
              sx={{
                m: 0,
                mt: 0.5,
                fontSize: '0.85rem',
                color: 'text.secondary',
              }}
            >
              {description}
            </Box>
          ) : null}
        </Box>
        {action}
      </Box>
      {children}
    </Box>
  );
}
