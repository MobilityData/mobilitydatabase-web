import * as React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { theme } from '../../../Theme';

export type CoverageStepTone = 'success' | 'warning' | 'error';

export interface CoverageStep {
  id: string;
  /** Caption above the date. */
  label: string;
  value: string;
  /** Tints the stop, for the one carrying a criterion's verdict. */
  tone?: CoverageStepTone;
  /**
   * Shown on hover, for a label that names a date without saying how it was
   * reached. Never the sole home of what it says.
   */
  tooltip?: string;
}

export interface CoverageConnector {
  /** What the distance between two stops means, e.g. "35d margin". */
  label: string;
  /** Tints the cell, for a span that is itself the criterion's verdict. */
  tone?: CoverageStepTone;
  /**
   * Shown on hover, for a label that names a measurement without saying what
   * it is measured against. Never the sole home of what it says.
   */
  tooltip?: string;
}

export interface CoverageStepsProps {
  steps: CoverageStep[];
  /** One fewer than `steps`: connector *i* sits between stop *i* and *i+1*. */
  connectors: CoverageConnector[];
  /** Merged into the row, for a caller that wants to size or space it. */
  sx?: React.ComponentProps<typeof Box>['sx'];
}

const { success, warning, error } = theme.vars.palette;

/**
 * Tint for the stop carrying the verdict. Built from the palette's colour
 * channels rather than the `light` tokens, which are tuned for chip-sized
 * surfaces and read as too saturated across a panel.
 */
const toneStyles: Record<CoverageStepTone, Record<string, string>> = {
  success: {
    color: success.dark,
    backgroundColor: `rgba(${success.mainChannel} / 0.12)`,
  },
  warning: {
    color: warning.dark,
    backgroundColor: `rgba(${warning.mainChannel} / 0.12)`,
  },
  error: {
    color: error.dark,
    backgroundColor: `rgba(${error.mainChannel} / 0.12)`,
  },
};

/**
 * Cells sit flush against each other inside one banded row, so each carries
 * its own divider rather than the row carrying gaps.
 */
const cellStyle = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  py: 1.5,
  textAlign: 'center',
  borderRight: '1px solid',
  borderColor: 'divider',
  '&:last-of-type': { borderRight: 'none' },
} as const;

const stepStyle = {
  ...cellStyle,
  flex: '1 1 140px',
  px: 2,
} as const;

const connectorStyle = {
  ...cellStyle,
  alignItems: 'center',
  flex: '0 0 auto',
  minWidth: '92px',
  px: 1,
} as const;

/**
 * A row of dated stops with the distance between each pair called out in
 * between - the shape both Fresh criteria open with, so a reader meets the
 * same summary whether they are looking at a rolling window or a continuous
 * one.
 *
 * Drawn as one banded row divided into cells rather than as separate cards,
 * so the stops read left to right as a single progression. Wraps to a column
 * on a narrow screen; the arrows turn with it.
 */
export default function CoverageSteps({
  steps,
  connectors,
  sx,
}: CoverageStepsProps): React.ReactElement {
  return (
    <Box
      sx={[
        {
          display: 'flex',
          flexWrap: 'wrap',
          // Stretch, so the dividers run the full height of the band.
          alignItems: 'stretch',
          mt: 2,
          borderRadius: '8px',
          // Clips the tinted cell back to the band's rounded corners.
          overflow: 'hidden',
          backgroundColor: 'action.hover',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          {index > 0 && connectors[index - 1] != undefined && (
            <Connector connector={connectors[index - 1]} />
          )}
          <Step step={step} />
        </React.Fragment>
      ))}
    </Box>
  );
}

function Step({ step }: { step: CoverageStep }): React.ReactElement {
  const cell = (
    <Box
      sx={{
        ...stepStyle,
        ...(step.tone != undefined && toneStyles[step.tone]),
        ...(step.tooltip != undefined && { cursor: 'help' }),
      }}
    >
      <Typography
        variant='caption'
        component='div'
        sx={{
          color: step.tone != undefined ? 'inherit' : 'text.secondary',
          // The conventional mark for a word that holds more than it shows.
          ...(step.tooltip != undefined && {
            display: 'inline-block',
            textDecoration: 'underline dotted',
            textDecorationThickness: '1px',
            textUnderlineOffset: '3px',
          }),
        }}
      >
        {step.label}
      </Typography>
      <Typography
        variant='h6'
        component='div'
        sx={{ mb: 0, fontWeight: 700, color: 'inherit' }}
      >
        {step.value}
      </Typography>
    </Box>
  );
  return step.tooltip != undefined ? (
    <Tooltip title={step.tooltip} arrow enterTouchDelay={0}>
      {cell}
    </Tooltip>
  ) : (
    cell
  );
}

function Connector({
  connector,
}: {
  connector: CoverageConnector;
}): React.ReactElement {
  // Toned the same way a stop is, so a verdict reads the same wherever it
  // falls on the row - on a date, or on the distance between two of them.
  const color = connector.tone != undefined ? 'inherit' : 'text.secondary';
  const cell = (
    <Box
      sx={{
        ...connectorStyle,
        ...(connector.tone != undefined && toneStyles[connector.tone]),
        ...(connector.tooltip != undefined && { cursor: 'help' }),
      }}
    >
      <Typography
        variant='caption'
        sx={{
          color,
          fontWeight: 600,
          // The conventional mark for a word that holds more than it shows.
          ...(connector.tooltip != undefined && {
            textDecoration: 'underline dotted',
            textDecorationThickness: '1px',
            textUnderlineOffset: '3px',
          }),
        }}
      >
        {connector.label}
      </Typography>
      <ArrowForwardIcon
        aria-hidden
        fontSize='small'
        sx={{ color, transform: { xs: 'rotate(90deg)', sm: 'none' } }}
      />
    </Box>
  );
  return connector.tooltip != undefined ? (
    <Tooltip title={connector.tooltip} arrow enterTouchDelay={0}>
      {cell}
    </Tooltip>
  ) : (
    cell
  );
}
