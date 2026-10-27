'use client';

import { Box } from '@mui/material';
import React from 'react';

/** A route's short name on its route_color (struck through when removed). */
export function RouteBadge({
  label,
  color,
  textColor,
  removed = false,
  maxWidth = 112,
}: {
  label: string;
  /** routes.txt route_color / route_text_color, without '#'; may be empty. */
  color: string;
  textColor: string;
  removed?: boolean;
  /** Longer short names are cut with an ellipsis (full name on hover). */
  maxWidth?: number;
}): React.ReactElement {
  return (
    <Box
      component='span'
      title={label}
      sx={{
        display: 'inline-block',
        textAlign: 'center',
        flexShrink: 0,
        minWidth: 32,
        maxWidth,
        height: 22,
        px: 0.75,
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: 700,
        lineHeight: '20px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        bgcolor: color ? `#${color}` : 'action.selected',
        color: color
          ? textColor
            ? `#${textColor}`
            : '#ffffff'
          : 'text.primary',
        border: '1px solid',
        borderColor: color ? 'transparent' : 'divider',
        textDecoration: removed ? 'line-through' : undefined,
      }}
    >
      {label}
    </Box>
  );
}
