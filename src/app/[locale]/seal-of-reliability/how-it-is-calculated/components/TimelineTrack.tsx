import { Box, Typography } from '@mui/material';
import { type ReactElement } from 'react';
import { theme } from '../../../../Theme';
import { type TrackPlacement } from '../lib/timeline';

export type TrackTone = 'success' | 'error' | 'neutral' | 'gap';

export interface TrackSegment extends TrackPlacement {
  id: string;
  label?: string;
  tone: TrackTone;
}

export interface TrackMarker {
  id: string;
  leftPercent: number;
  tone: TrackTone;
  /** Annotation drawn just to the right of the marker line. */
  label?: string;
}

interface TimelineTrackProps {
  segments: TrackSegment[];
  markers?: TrackMarker[];
  /** Describes the diagram for screen readers, which cannot read the bars. */
  ariaLabel: string;
}

interface ToneStyle {
  backgroundColor: string;
  borderColor: string;
  borderStyle: string;
}

const { success, error, text } = theme.vars.palette;

const toneStyles: Record<TrackTone, ToneStyle> = {
  success: {
    backgroundColor: `rgba(${success.mainChannel} / 0.25)`,
    borderColor: `rgba(${success.mainChannel} / 0.7)`,
    borderStyle: 'solid',
  },
  error: {
    backgroundColor: `rgba(${error.mainChannel} / 0.25)`,
    borderColor: `rgba(${error.mainChannel} / 0.7)`,
    borderStyle: 'solid',
  },
  neutral: {
    backgroundColor: `rgba(${text.primaryChannel} / 0.12)`,
    // Strong enough to stay legible where a marker crosses a coloured segment.
    borderColor: `rgba(${text.primaryChannel} / 0.6)`,
    borderStyle: 'solid',
  },
  // Missing service between two datasets: outlined rather than filled, so it
  // reads as an absence next to the solid dataset bars.
  gap: {
    backgroundColor: 'transparent',
    borderColor: `rgba(${text.primaryChannel} / 0.45)`,
    borderStyle: 'dashed',
  },
};

const trackStyle = {
  position: 'relative',
  height: 28,
  borderRadius: '4px',
  backgroundColor: 'action.hover',
  overflow: 'hidden',
} as const;

export default function TimelineTrack({
  segments,
  markers = [],
  ariaLabel,
}: TimelineTrackProps): ReactElement {
  return (
    <Box role='img' aria-label={ariaLabel} sx={trackStyle}>
      {segments.map((segment) => (
        <Box
          key={segment.id}
          sx={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${segment.leftPercent}%`,
            width: `${segment.widthPercent}%`,
            borderWidth: '1px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            ...toneStyles[segment.tone],
          }}
        >
          {segment.label != undefined ? (
            <Typography
              variant='caption'
              sx={{ fontWeight: 700, px: 0.5 }}
              noWrap
            >
              {segment.label}
            </Typography>
          ) : null}
        </Box>
      ))}
      {markers.map((marker) => (
        <Box key={marker.id}>
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${marker.leftPercent}%`,
              borderLeft: '2px dashed',
              borderColor: toneStyles[marker.tone].borderColor,
            }}
          />
          {marker.label != undefined ? (
            <Typography
              variant='caption'
              sx={{
                position: 'absolute',
                top: '50%',
                left: `${marker.leftPercent}%`,
                transform: 'translateY(-50%)',
                ml: '6px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {marker.label}
            </Typography>
          ) : null}
        </Box>
      ))}
    </Box>
  );
}
