'use client';

import { Box } from '@mui/material';
import React from 'react';
import type { RouteChange } from '../../lib/map-table-query';
import { OVERVIEW_STYLES, ROUTE_CHANGE_LABELS } from '../../lib/routes-v2';

/** Path and stop changes share the map's "Path or stops changed" orange. */
const CHANGE_COLORS: Partial<Record<RouteChange, string>> = {
  added: OVERVIEW_STYLES.added.color,
  removed: OVERVIEW_STYLES.removed.color,
  path: OVERVIEW_STYLES.major.color,
  stops: OVERVIEW_STYLES.major.color,
};

/** Outlined pill like a "What changed" chip, as a list item. */
export function ChangePill({
  label,
  color,
  component = 'li',
}: {
  label: string;
  /** Border and text; neutral grey when absent. */
  color?: string;
  /** A span inside buttons, where lists aren't allowed. */
  component?: 'li' | 'span';
}): React.ReactElement {
  return (
    <Box
      component={component}
      sx={{
        listStyle: 'none',
        px: 0.75,
        height: 18,
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '9px',
        fontSize: '0.68rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        border: '1px solid',
        borderColor: color ?? 'divider',
        color: color ?? 'text.secondary',
      }}
    >
      {label}
    </Box>
  );
}

/** A route's changes, labelled like the "What changed" filter chips. */
export function ChangeChips({
  changes,
}: {
  changes: RouteChange[];
}): React.ReactElement | null {
  if (changes.length === 0) return null;
  return (
    <Box
      component='ul'
      aria-label='Changes'
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, m: 0, p: 0 }}
    >
      {changes.map((c) => (
        <ChangePill
          key={c}
          label={ROUTE_CHANGE_LABELS[c]}
          color={CHANGE_COLORS[c]}
        />
      ))}
    </Box>
  );
}
