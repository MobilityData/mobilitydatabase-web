'use client';

import {
  Box,
  ButtonBase,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import React, { useState } from 'react';

/** A line sample: solid, dashed, or a translucent band (halo). */
export function LegendLine({
  color,
  width = 3,
  dashed = false,
  halo = false,
}: {
  color: string;
  width?: number;
  dashed?: boolean;
  halo?: boolean;
}): React.ReactElement {
  return (
    <Box
      aria-hidden
      sx={{
        width: 22,
        flexShrink: 0,
        height: halo ? 8 : 0,
        borderTop: halo
          ? undefined
          : `${Math.max(1.5, width)}px ${dashed ? 'dashed' : 'solid'} ${color}`,
        bgcolor: halo ? color : undefined,
        opacity: halo ? 0.35 : 1,
        borderRadius: halo ? '4px' : undefined,
      }}
    />
  );
}

/** A point sample: a filled dot with a stroke. */
export function LegendDot({
  fill,
  stroke,
}: {
  fill: string;
  stroke: string;
}): React.ReactElement {
  return (
    <Box
      aria-hidden
      sx={{
        width: 10,
        height: 10,
        mx: '6px',
        flexShrink: 0,
        borderRadius: '50%',
        bgcolor: fill,
        border: `2px solid ${stroke}`,
      }}
    />
  );
}

export interface LegendItem {
  symbol: React.ReactElement;
  label: string;
}

/**
 * Collapsible legend over a diff map's bottom-left corner (the Routes v2
 * map's): open by default, collapsed on small screens where the map is
 * short. Place it inside the map's positioned frame.
 */
export default function MapLegend({
  items,
  note,
}: {
  items: LegendItem[];
  /** Muted line under the items. */
  note?: string;
}): React.ReactElement {
  const theme = useTheme();
  const small = useMediaQuery(theme.breakpoints.down('md'));
  const [toggled, setToggled] = useState(false);
  const open = small === toggled;
  return (
    <Box
      component='section'
      aria-label='Map legend'
      sx={{
        position: 'absolute',
        left: 8,
        bottom: 24,
        zIndex: 1,
        maxWidth: 'calc(100% - 16px)',
        bgcolor: 'background.paper',
        opacity: 0.94,
        borderRadius: '6px',
        boxShadow: 1,
        px: 1.25,
        py: 0.5,
      }}
    >
      <ButtonBase
        onClick={() => setToggled((t) => !t)}
        aria-expanded={open}
        sx={{ fontSize: '0.75rem', fontWeight: 700, py: 0.25 }}
      >
        Legend {open ? '▾' : '▸'}
      </ButtonBase>
      {open ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'auto auto',
            columnGap: 1,
            rowGap: 0.25,
            alignItems: 'center',
            pb: 0.25,
          }}
        >
          {items.map((item) => (
            <React.Fragment key={item.label}>
              {item.symbol}
              <Typography variant='caption' sx={{ lineHeight: 1.4 }}>
                {item.label}
              </Typography>
            </React.Fragment>
          ))}
          {note ? (
            <Typography
              variant='caption'
              color='text.secondary'
              sx={{ gridColumn: '1 / -1', lineHeight: 1.4 }}
            >
              {note}
            </Typography>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
