import { Box, Typography } from '@mui/material';
import { type ReactElement } from 'react';

export interface AxisTick {
  id: string;
  leftPercent: number;
  label: string;
}

/**
 * Keeps the first and last labels inside the track instead of letting them
 * hang off the edges.
 */
function tickTransform(leftPercent: number): string {
  if (leftPercent <= 5) return 'translateX(0)';
  // Right-align anything near the end so the final labels stack up against the
  // edge instead of overlapping each other.
  if (leftPercent >= 85) return 'translateX(-100%)';
  return 'translateX(-50%)';
}

export default function AxisTicks({
  ticks,
}: {
  ticks: AxisTick[];
}): ReactElement {
  return (
    <Box sx={{ position: 'relative', height: 18, mt: 0.5 }} aria-hidden>
      {ticks.map((tick) => (
        <Typography
          key={tick.id}
          variant='caption'
          sx={{
            position: 'absolute',
            top: 0,
            left: `${tick.leftPercent}%`,
            transform: tickTransform(tick.leftPercent),
            color: 'text.secondary',
            whiteSpace: 'nowrap',
          }}
        >
          {tick.label}
        </Typography>
      ))}
    </Box>
  );
}
