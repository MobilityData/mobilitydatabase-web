import { Box, Typography } from '@mui/material';
import { type ReactElement } from 'react';
import { theme } from '../Theme';
import {
  type TrackAnchor,
  type TrackPlacement,
  roundPercent,
} from '../utils/timeline';

export type TrackTone =
  | 'success'
  | 'successSolid'
  | 'warning'
  | 'warningDashed'
  | 'error'
  | 'errorSolid'
  | 'errorDashed'
  | 'neutral'
  | 'gap';

export interface TrackSegment extends TrackPlacement {
  id: string;
  label?: string;
  tone: TrackTone;
  /**
   * Floor on the drawn width, in pixels. A span of a few days on an axis of
   * years rounds to a fraction of a percent and would otherwise disappear,
   * which is exactly the case a reader needs to see.
   */
  minWidthPx?: number;
  /**
   * Which end stays put when `minWidthPx` widens the segment. Defaults to
   * `start`, which grows it rightwards; `end` pins its right edge and grows
   * it leftwards instead, for a band that sits at the far end of the bar it
   * describes.
   */
  anchor?: TrackAnchor;
  /**
   * False squares this segment's left corner and drops its left border, for
   * a segment that continues directly from the one before it with no gap -
   * so the pair reads as one shape rather than two touching pills. Defaults
   * to true.
   */
  roundedStart?: boolean;
  /** The right-corner counterpart of `roundedStart`. Defaults to true. */
  roundedEnd?: boolean;
}

export interface TrackMarker {
  id: string;
  leftPercent: number;
  tone: TrackTone;
  /** Annotation drawn just to the right of the marker line. */
  label?: string;
  /**
   * Solid draws a thicker, unbroken line, for the one marker on a track that
   * has to be read first. Defaults to dashed.
   */
  variant?: 'solid' | 'dashed';
  /**
   * False drops the vertical line, keeping only the label - for a marker
   * whose date is already drawn as the edge of an adjoining segment, where a
   * line of its own would sit directly on top of that edge. Defaults to true.
   */
  showLine?: boolean;
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
  /** For a filled tone, where the inherited text colour has no contrast. */
  labelColor?: string;
}

const { success, warning, error, text } = theme.vars.palette;

const toneStyles: Record<TrackTone, ToneStyle> = {
  success: {
    backgroundColor: `rgba(${success.mainChannel} / 0.25)`,
    borderColor: `rgba(${success.mainChannel} / 0.7)`,
    borderStyle: 'solid',
  },
  // The same green as `success`, at full opacity: a band drawn over a
  // `success` segment has to read as a distinct stretch of it, not a wash.
  successSolid: {
    backgroundColor: success.main,
    borderColor: success.main,
    borderStyle: 'solid',
    labelColor: success.contrastText,
  },
  // The grace-period counterpart of `error`: coverage is short, but the
  // criterion hasn't been marked failing yet.
  warning: {
    backgroundColor: `rgba(${warning.mainChannel} / 0.25)`,
    borderColor: `rgba(${warning.mainChannel} / 0.7)`,
    borderStyle: 'solid',
  },
  // The grace-period counterpart of `errorDashed`.
  warningDashed: {
    backgroundColor: 'transparent',
    borderColor: `rgba(${warning.mainChannel} / 0.9)`,
    borderStyle: 'dashed',
    labelColor: warning.main,
  },
  error: {
    backgroundColor: `rgba(${error.mainChannel} / 0.25)`,
    borderColor: `rgba(${error.mainChannel} / 0.7)`,
    borderStyle: 'solid',
  },
  // The counterpart of `successSolid`, for a stretch that has to be read as
  // the failure itself rather than as a tint over something else.
  errorSolid: {
    backgroundColor: error.main,
    borderColor: error.main,
    borderStyle: 'solid',
    labelColor: error.contrastText,
  },
  // An absence the reader has to act on: drawn as an outline, since there is
  // nothing there to fill, but in the failing colour so it is read as the gap
  // the band between the rows names.
  errorDashed: {
    backgroundColor: 'transparent',
    borderColor: `rgba(${error.mainChannel} / 0.9)`,
    borderStyle: 'dashed',
    // The background is transparent, so a label needs its own colour rather
    // than the inherited default to read as the failure it names.
    labelColor: error.main,
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

/**
 * A date axis drawn as a bar: `segments` are placed on it as percentages, so
 * the caller owns the axis and this component owns nothing but the drawing.
 * Shared by the seal's worked examples and by a feed's own coverage windows.
 */
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
            // Pinning the right edge rather than the left is what makes the
            // pixel floor below grow the segment leftwards.
            ...(segment.anchor === 'end'
              ? {
                  right: `${roundPercent(
                    100 - (segment.leftPercent + segment.widthPercent),
                  )}%`,
                }
              : { left: `${segment.leftPercent}%` }),
            width: `${segment.widthPercent}%`,
            ...(segment.minWidthPx != undefined && {
              minWidth: `${segment.minWidthPx}px`,
            }),
            borderTopWidth: '1px',
            borderBottomWidth: '1px',
            borderRightWidth: '1px',
            // Dropped when this segment continues one before it, so the pair
            // reads as one shape rather than two touching borders.
            borderLeftWidth: segment.roundedStart === false ? 0 : '1px',
            borderRadius: `${segment.roundedStart === false ? 0 : '4px'} ${
              segment.roundedEnd === false ? 0 : '4px'
            } ${segment.roundedEnd === false ? 0 : '4px'} ${
              segment.roundedStart === false ? 0 : '4px'
            }`,
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
              sx={{
                fontWeight: 700,
                px: 0.5,
                color: toneStyles[segment.tone].labelColor,
              }}
              noWrap
            >
              {segment.label}
            </Typography>
          ) : null}
        </Box>
      ))}
      {markers.map((marker) => (
        <Box key={marker.id}>
          {marker.showLine !== false && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${marker.leftPercent}%`,
                borderLeft:
                  marker.variant === 'solid' ? '3px solid' : '2px dashed',
                borderColor: toneStyles[marker.tone].borderColor,
              }}
            />
          )}
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
