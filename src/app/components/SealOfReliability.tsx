'use client';
import { Tooltip, styled } from '@mui/material';
import { useTranslations } from 'next-intl';

export type SealOfReliabilitySize =
  | 'xxlarge'
  | 'xlarge'
  | 'large'
  | 'medium'
  | 'small';

const ICON_SIZES: ReadonlySet<SealOfReliabilitySize> = new Set([
  'small',
  'medium',
]);

export type SealOfReliabilityBackground = 'transparent' | 'white';


export type SealOfReliabilityDetail = 'full' | 'compact';

/**
 * How the mark is coloured:
 * - `auto`: dark purple, switching to white on dark surfaces.
 * - `ink`: always the artwork's dark purple.
 * - `white`: always white, for a surface that stays dark in both themes.
 * - `reverse`: white in light mode, dark purple in dark mode - for a surface
 *   that inverts against the theme, such as the seal chip or the disc.
 */
export type SealOfReliabilityTone = 'auto' | 'ink' | 'white' | 'reverse';

export interface SealOfReliabilityProps {
  size?: SealOfReliabilitySize;
  background?: SealOfReliabilityBackground;
  detail?: SealOfReliabilityDetail;
  /**
   * Sit the mark on a filled circle, colours reversed against the surface:
   * a dark purple disc holding a white mark in light mode, a white disc
   * holding a dark purple mark in dark mode. Supersedes `tone`, and
   * expects the `transparent` artwork - the `white` variant's inner detail is
   * flattened away by the recolouring.
   */
  enableBackground?: boolean;
  /**
   * How to colour the mark. `auto` adapts to the surface, which is what an
   * ordinary page wants; name a tone explicitly on a surface that keeps its
   * colour across themes. Ignored when `enableBackground` is set, which owns
   * the colouring. Defaults to `auto` for the `transparent` artwork and `ink`
   * for `white`, whose inner detail any recolouring would flatten away.
   */
  tone?: SealOfReliabilityTone;
  disableTooltip?: boolean;
}

export const SEAL_INK = '#170A2E';

const SEAL_SRC: Record<
  SealOfReliabilityDetail,
  Record<SealOfReliabilityBackground, string>
> = {
  full: {
    transparent: '/assets/seal-of-reliability-logo-dark-purple-transparant.svg',
    white: '/assets/seal-of-reliability-logo-dark-purple-white.svg',
  },
  compact: {
    transparent:
      '/assets/seal-of-reliability-logo-dark-purple-transparant-small.svg',
    white: '/assets/seal-of-reliability-logo-dark-purple-white-small.svg',
  },
};

/** Overall height in px; width follows the artwork's own aspect ratio. */
const SEAL_HEIGHT_PX: Record<SealOfReliabilitySize, number> = {
  xxlarge: 250,
  xlarge: 160,
  large: 48,
  medium: 32,
  small: 24,
};

/** The full mark is taller than it is wide - forcing a square distorts it. */
const SEAL_ASPECT_RATIO: Record<SealOfReliabilityDetail, number> = {
  full: 403 / 431.6906,
  compact: 1,
};

/**
 * How much of the disc the mark occupies. The rest is breathing room that also
 * keeps the ribbon tails clear of the circle's clip - past ~0.85 they touch it.
 */
const SEAL_INSET_RATIO = 0.85;

/**
 * Snap an inner dimension so the space the disc leaves around it splits into
 * two whole pixels. A half-pixel remainder resolves against the device pixel
 * grid differently depending on where the disc happens to sit, which reads as
 * the mark wobbling inside its circle from one list row to the next.
 */
const snapToDisc = (diameter: number, inner: number): number =>
  diameter - 2 * Math.round((diameter - inner) / 2);

/**
 * `brightness(0)` flattens the fill to black, `invert(1)` takes it to solid
 * white, both leaving transparency untouched.
 */
const WHITEN = 'brightness(0) invert(1)';

/**
 * The tone actually applied, once `tone` and `enableBackground` are resolved.
 * - `ink`: never recoloured, left the artwork's dark purple.
 * - `white`: always whitened.
 * - `adaptive`: white on dark surfaces only.
 * - `reverse`: white in light mode, ink in dark mode.
 */
type ResolvedTone = 'ink' | 'white' | 'adaptive' | 'reverse';

/**
 * `filter` applies to an element's own background as well as its content, so
 * the disc has to live on a wrapper - painting both here would bleach it.
 */
const SealDisc = styled('span', {
  shouldForwardProp: (prop) => prop !== 'diameter',
})<{ diameter: number }>(({ theme, diameter }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: diameter,
  height: diameter,
  borderRadius: '50%',
  backgroundColor: SEAL_INK,
  ...theme.applyStyles('dark', { backgroundColor: '#FFFFFF' }),
}));

/**
 * A plain `img`, not `next/image`: the optimizer rejects `image/svg+xml` with
 * a 400 unless `dangerouslyAllowSVG` is set, and there is nothing for it to
 * optimize in a vector anyway.
 */
const SealImage = styled('img', {
  shouldForwardProp: (prop) => prop !== 'tone',
})<{ tone: ResolvedTone }>(({ theme, tone }) => ({
  display: 'block',
  objectFit: 'contain',
  ...(tone === 'white' ? { filter: WHITEN } : {}),
  ...(tone === 'adaptive' ? theme.applyStyles('dark', { filter: WHITEN }) : {}),
  ...(tone === 'reverse'
    ? { filter: WHITEN, ...theme.applyStyles('dark', { filter: 'none' }) }
    : {}),
}));

export default function SealOfReliability({
  size = 'large',
  background = 'transparent',
  detail = ICON_SIZES.has(size) ? 'compact' : 'full',
  enableBackground = false,
  tone = background === 'transparent' ? 'auto' : 'ink',
  disableTooltip = false,
}: SealOfReliabilityProps): React.ReactElement {
  const t = useTranslations('feeds');

  // The disc keeps the overall footprint at `size`, so turning it on shrinks
  // the mark rather than growing the component.
  const diameter = SEAL_HEIGHT_PX[size];
  const height = enableBackground
    ? snapToDisc(diameter, Math.round(diameter * SEAL_INSET_RATIO))
    : diameter;
  const rawWidth = Math.round(height * SEAL_ASPECT_RATIO[detail]);
  const width = enableBackground ? snapToDisc(diameter, rawWidth) : rawWidth;

  const resolvedTone: ResolvedTone = enableBackground
    ? 'reverse'
    : tone === 'auto'
      ? 'adaptive'
      : tone;

  let image = (
    <SealImage
      data-testid='seal-of-reliability-image'
      src={SEAL_SRC[detail][background]}
      alt={t('sealOfReliabilityAlt')}
      width={width}
      height={height}
      tone={resolvedTone}
    />
  );

  if (enableBackground) {
    image = <SealDisc diameter={diameter}>{image}</SealDisc>;
  }

  if (ICON_SIZES.has(size) && !disableTooltip) {
    return (
      <Tooltip title={t('sealOfReliabilityTooltipShort')} placement='top'>
        {image}
      </Tooltip>
    );
  }

  return image;
}
