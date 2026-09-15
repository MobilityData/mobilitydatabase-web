import { Box, Tooltip, Typography } from '@mui/material';
import { type ReactElement } from 'react';

export interface AxisTick {
  id: string;
  leftPercent: number;
  label: string;
  /** Matches the weight of a solid marker, so the pair read as one. */
  bold?: boolean;
  center?: boolean;
  tooltip?: string;
}

/**
 * Keeps the first and last labels inside the track instead of letting them
 * hang off the edges.
 */
function tickTransform(leftPercent: number, center = false): string {
  if (center) return 'translateX(-50%)';
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
      {ticks.map((tick) => {
        const label = (
          <Typography
            key={tick.id}
            variant='caption'
            sx={{
              position: 'absolute',
              top: 0,
              left: `${tick.leftPercent}%`,
              transform: tickTransform(tick.leftPercent, tick.center),
              color: tick.bold === true ? 'text.primary' : 'text.secondary',
              fontWeight: tick.bold === true ? 700 : undefined,
              whiteSpace: 'nowrap',
              ...(tick.tooltip != undefined && {
                cursor: 'help',
                textDecoration: 'underline dotted',
                textDecorationThickness: '1px',
                textUnderlineOffset: '3px',
              }),
            }}
          >
            {tick.label}
          </Typography>
        );
        return tick.tooltip != undefined ? (
          <Tooltip
            key={tick.id}
            title={tick.tooltip}
            placement='top'
            arrow
            enterTouchDelay={0}
          >
            {label}
          </Tooltip>
        ) : (
          label
        );
      })}
    </Box>
  );
}
