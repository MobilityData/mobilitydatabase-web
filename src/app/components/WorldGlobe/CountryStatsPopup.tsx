import { Box, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { type ReactElement, type Ref } from 'react';
import { fontFamily } from '../../Theme';
import { type PopupPlacement } from './popup-placement';
import {
  type CountryStats,
  formatFeedCount,
  iso2ToFlagEmoji,
} from './feed-stats';

// `--popup-shift` slides the card sideways (to stay inside the container)
// while the outer div, and so the arrow's tip, stays on the anchor.
const SHIFT_X = 'calc(-50% + var(--popup-shift, 0px))';
const ABOVE_TRANSFORM = `translate(${SHIFT_X}, calc(-100% - 14px))`;
const BELOW_TRANSFORM = `translate(${SHIFT_X}, 14px)`;

const popIn = keyframes`
  0% {
    opacity: 0;
    transform: translate(${SHIFT_X}, calc(-100% - 2px)) scale(0.85);
  }
  60% {
    opacity: 1;
  }
  100% {
    opacity: 1;
    transform: ${ABOVE_TRANSFORM} scale(1);
  }
`;

const popInBelow = keyframes`
  0% {
    opacity: 0;
    transform: translate(${SHIFT_X}, 2px) scale(0.85);
  }
  60% {
    opacity: 1;
  }
  100% {
    opacity: 1;
    transform: ${BELOW_TRANSFORM} scale(1);
  }
`;

const POP_IN_EASING = '260ms cubic-bezier(0.34, 1.56, 0.64, 1)';

export const POPUP_WIDTH = 232;
/** Anchor-to-card distance, arrow included. */
export const POPUP_OFFSET = 14;

export const monoLabelSx = {
  fontFamily: fontFamily.secondary,
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'text.secondary',
} as const;

/**
 * Country popup shared by the globe and the flat map. The outer div carries
 * only the tracked screen position (compositor-only transform, which callers
 * write per frame through `ref`); the inner card holds the centring offset
 * and entrance animation, kept separate so the two transforms don't clash.
 *
 * Callers that need to keep the card in view can also flip it below the
 * anchor (`data-placement`) and slide it sideways (`--popup-shift`); both are
 * plain DOM attributes so they can be updated per frame without a render.
 */
export function CountryStatsPopup({
  stats: selected,
  position,
  placement = 'above',
  shift = 0,
  ref,
}: {
  stats: CountryStats;
  /** Initial screen position in container pixels. */
  position: { x: number; y: number };
  /** Initial side of the anchor the card opens on. */
  placement?: PopupPlacement;
  /** Initial horizontal card offset in pixels (the arrow stays put). */
  shift?: number;
  ref?: Ref<HTMLDivElement>;
}): ReactElement {
  return (
    <div
      ref={ref}
      data-placement={placement}
      style={{
        ['--popup-shift' as string]: `${shift}px`,
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        willChange: 'transform',
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: POPUP_WIDTH,
          transform: ABOVE_TRANSFORM,
          transformOrigin: 'bottom center',
          animation: `${popIn} ${POP_IN_EASING}`,
          '[data-placement="below"] &': {
            transform: BELOW_TRANSFORM,
            transformOrigin: 'top center',
            animation: `${popInBelow} ${POP_IN_EASING}`,
          },
          bgcolor: 'background.default',
          color: 'text.primary',
          border: '2px solid',
          borderColor: 'primary.main',
          borderRadius: '6px',
          boxShadow: 3,
          px: 1.75,
          py: 1.5,
        }}
      >
        <Typography
          component='div'
          sx={{
            ...monoLabelSx,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            lineHeight: 1.3,
          }}
        >
          <Box
            component='span'
            aria-hidden
            sx={{ fontFamily: fontFamily.primary, fontSize: 18 }}
          >
            {iso2ToFlagEmoji(selected.iso2)}
          </Box>
          <Box component='span'>{selected.name}</Box>
        </Typography>
        <Typography
          sx={{
            mt: 0.5,
            fontSize: 26,
            fontWeight: 800,
            lineHeight: 1.15,
            color: 'primary.main',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatFeedCount(selected.feedCount)}
        </Typography>

        {selected.topSubdivisions.length > 0 && (
          <Box
            sx={{
              mt: 1.25,
              pt: 1,
              borderTop: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography sx={{ ...monoLabelSx, mb: 0.5 }}>
              Top regions
            </Typography>
            <Box component='ul' sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {selected.topSubdivisions.map((sub) => (
                <Box
                  component='li'
                  key={sub.name}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 1.5,
                    py: 0.25,
                    fontSize: 13,
                  }}
                >
                  <Box
                    component='span'
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {sub.name}
                  </Box>
                  <Box
                    component='span'
                    sx={{
                      fontWeight: 700,
                      color: 'primary.main',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {sub.feedCount.toLocaleString('en-US')}
                  </Box>
                </Box>
              ))}
            </Box>
            {selected.remainingSubdivisionCount > 0 && (
              <Typography
                sx={{ mt: 0.5, fontSize: 12, color: 'text.secondary' }}
              >
                +{selected.remainingSubdivisionCount} more{' '}
                {selected.remainingSubdivisionCount === 1
                  ? 'region'
                  : 'regions'}
              </Typography>
            )}
          </Box>
        )}

        <Box
          sx={{
            position: 'absolute',
            left: 'calc(50% - var(--popup-shift, 0px))',
            bottom: -8,
            width: 14,
            height: 14,
            transform: 'translateX(-50%) rotate(45deg)',
            bgcolor: 'background.default',
            borderRight: '2px solid',
            borderBottom: '2px solid',
            borderColor: 'primary.main',
            '[data-placement="below"] &': {
              bottom: 'auto',
              top: -8,
              borderRight: 'none',
              borderBottom: 'none',
              borderLeft: '2px solid',
              borderTop: '2px solid',
              borderColor: 'primary.main',
            },
          }}
        />
      </Box>
    </div>
  );
}

export function FeedLegend({
  low,
  high,
}: {
  low: string;
  high: string;
}): ReactElement {
  return (
    <Box
      sx={{
        position: 'absolute',
        left: 12,
        bottom: 12,
        zIndex: 3,
        pointerEvents: 'none',
      }}
    >
      <Typography sx={{ ...monoLabelSx, mb: 0.5 }}>Feeds</Typography>
      <Box
        sx={{
          width: 140,
          height: 8,
          borderRadius: 4,
          background: `linear-gradient(90deg, ${low}, ${high})`,
        }}
      />
      <Box
        sx={{
          ...monoLabelSx,
          display: 'flex',
          justifyContent: 'space-between',
          mt: 0.25,
          fontSize: 10,
        }}
      >
        <span>Fewer</span>
        <span>More</span>
      </Box>
    </Box>
  );
}
