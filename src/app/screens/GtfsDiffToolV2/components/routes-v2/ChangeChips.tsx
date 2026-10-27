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
      {changes.map((c) => {
        const color = CHANGE_COLORS[c];
        return (
          <Box
            component='li'
            key={c}
            sx={{
              listStyle: 'none',
              px: 0.75,
              height: 18,
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '9px',
              fontSize: '0.68rem',
              fontWeight: 600,
              border: '1px solid',
              borderColor: color ?? 'divider',
              color: color ?? 'text.secondary',
            }}
          >
            {ROUTE_CHANGE_LABELS[c]}
          </Box>
        );
      })}
    </Box>
  );
}
