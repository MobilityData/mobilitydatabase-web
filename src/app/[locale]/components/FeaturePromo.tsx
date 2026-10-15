import { type ReactElement, type ReactNode } from 'react';
import { Box, Container, Typography } from '@mui/material';
import {
  ArrowForward,
  Code,
  Insights,
  Map as MapIcon,
  Public,
} from '@mui/icons-material';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '../../../i18n/navigation';
import SectionHeading from './SectionHeading';
import {
  ApiPreview,
  SearchPreview,
  TrackerPreview,
} from './FeaturePreviewsLazy';

type FeatureKey = 'discover' | 'visualization' | 'api' | 'tracker';

interface Feature {
  key: FeatureKey;
  href: string;
  /** Off-site links open in a new tab and skip locale prefixing. */
  external?: boolean;
  Icon: React.ElementType;
  /**
   * Drop a screenshot in /public and set its path here. Features without one
   * get a code-built preview, or failing that a styled placeholder.
   */
  imageSrc?: string;
  /** Dark-mode counterpart of `imageSrc`; shown instead of it in dark mode. */
  imageSrcDark?: string;
  /** object-position for the cover crop; screenshots are cropped to fit the tile. */
  imagePosition?: string;
  /** Placement in the desktop bento grid. */
  gridArea: string;
}

// Ordered by priority: the gallery shows them in this order on small screens,
// and the bento grid gives the first one the largest tile.
const FEATURES: Feature[] = [
  {
    key: 'discover',
    href: '/feeds',
    Icon: Public,
    gridArea: 'discover',
  },
  {
    key: 'visualization',
    href: '/feeds/gtfs/mdb-1830/map',
    Icon: MapIcon,
    imageSrc: '/assets/screenshots/mexico-viz-light.png',
    imageSrcDark: '/assets/screenshots/mexico-viz-dark.png',
    // Centre the crop on downtown, where the lines meet.
    imagePosition: '70% 55%',
    gridArea: 'visualization',
  },
  {
    key: 'api',
    href: 'https://mobilitydata.github.io/mobility-feed-api/SwaggerUI/index.html',
    external: true,
    Icon: Code,
    gridArea: 'api',
  },
  {
    key: 'tracker',
    href: '/gtfs-feature-tracker',
    Icon: Insights,
    gridArea: 'tracker',
  },
];

// Tints derived from the contrast text color so the panel reads on the
// primary background in both light and dark mode.
const tint = (alpha: number): string =>
  `rgba(var(--mui-palette-primary-contrastTextChannel) / ${alpha})`;

const FeatureImage = ({
  feature,
  alt,
  preview,
}: {
  feature: Feature;
  alt: string;
  preview?: ReactNode;
}): ReactElement => (
  <Box
    className='feature-image'
    sx={{
      position: 'relative',
      // Fills what the text leaves. The absolute 0px basis (not `flex: 1`'s
      // 0%, which resolves to content height here) keeps the cropped preview
      // from stretching the grid row to its full natural height.
      flex: '1 1 0px',
      minHeight: { xs: 180, md: 140 },
      borderRadius: 2,
      overflow: 'hidden',
      backgroundColor: tint(0.08),
      backgroundImage: `radial-gradient(${tint(0.18)} 1px, transparent 1px)`,
      backgroundSize: '18px 18px',
      display: 'flex',
      // `safe` falls back to top alignment when a preview is taller than the
      // tile, so it's cropped at the bottom rather than both ends.
      alignItems: 'safe center',
      justifyContent: 'center',
      // Lets code-built previews size their text to the tile's width.
      containerType: 'inline-size',
      // Both scheme variants are rendered and CSS picks one, so the right
      // screenshot shows on first paint. The hidden one is lazy and never
      // loads. A theme callback can't be used here: this is a Server Component.
      '& .screenshot-dark, .dark & .screenshot-light': { display: 'none' },
      '.dark & .screenshot-dark': { display: 'block' },
    }}
  >
    {feature.imageSrc !== undefined ? (
      <>
        <Image
          src={feature.imageSrc}
          alt={alt}
          className={
            feature.imageSrcDark !== undefined ? 'screenshot-light' : undefined
          }
          fill
          sizes='(max-width: 900px) 85vw, 50vw'
          style={{
            objectFit: 'cover',
            objectPosition: feature.imagePosition ?? 'center',
          }}
        />
        {feature.imageSrcDark !== undefined && (
          <Image
            src={feature.imageSrcDark}
            alt={alt}
            className='screenshot-dark'
            fill
            sizes='(max-width: 900px) 85vw, 50vw'
            style={{
              objectFit: 'cover',
              objectPosition: feature.imagePosition ?? 'center',
            }}
          />
        )}
      </>
    ) : (
      (preview ?? (
        <feature.Icon
          aria-hidden='true'
          sx={{
            fontSize: feature.key === 'discover' ? 120 : 72,
            color: tint(0.55),
          }}
        />
      ))
    )}
  </Box>
);

export default async function FeaturePromo(): Promise<ReactElement> {
  const [t, tCommon] = await Promise.all([
    getTranslations('home.features'),
    getTranslations('common'),
  ]);

  const previews: Partial<Record<FeatureKey, ReactNode>> = {
    discover: (
      <SearchPreview
        labels={{
          gtfs: tCommon('gtfs'),
          gtfsRt: tCommon('gtfs_rt'),
          gbfs: tCommon('gbfs'),
          tripUpdates: tCommon('gtfsRealtimeEntities.tripUpdates'),
          serviceAlerts: tCommon('gtfsRealtimeEntities.serviceAlerts'),
        }}
      />
    ),
    api: <ApiPreview />,
    tracker: (
      <TrackerPreview
        everyFeed={t('previews.everyFeed')}
        someFieldsIgnored={t('previews.someFieldsIgnored')}
      />
    ),
  };

  return (
    <Box
      component='section'
      aria-labelledby='feature-promo-title'
      sx={{
        minHeight: '45vh',
        backgroundColor: 'primary.main',
        color: 'primary.contrastText',
        py: { xs: 6, md: 10 },
      }}
    >
      <Container maxWidth='lg'>
        <SectionHeading
          id='feature-promo-title'
          eyebrow={t('eyebrow')}
          title={t('title')}
        />

        <Box
          sx={{
            // Horizontal snap gallery on small screens, bento grid from md up.
            display: { xs: 'flex', md: 'grid' },
            gap: { xs: 2, md: 3 },
            overflowX: { xs: 'auto', md: 'visible' },
            scrollSnapType: { xs: 'x mandatory', md: 'none' },
            scrollPaddingInline: { xs: 16, sm: 24, md: 0 },
            mx: { xs: -2, sm: -3, md: 0 },
            px: { xs: 2, sm: 3, md: 0 },
            pb: { xs: 2, md: 0 },
            gridTemplateColumns: { md: '1.3fr 1fr 1fr' },
            gridTemplateRows: { md: 'repeat(2, minmax(300px, auto))' },
            gridTemplateAreas: {
              md: `"discover visualization visualization" "discover api tracker"`,
            },
          }}
        >
          {FEATURES.map((feature) => (
            // Link wraps the card rather than being passed as `component`:
            // a Server Component can't hand a component function to MUI.
            <Box
              key={feature.key}
              sx={{
                gridArea: { md: feature.gridArea },
                flex: { xs: '0 0 85%', sm: '0 0 55%', md: 'initial' },
                height: { xs: 400, md: 'auto' },
                scrollSnapAlign: 'start',
                '& .feature-card': {
                  transition:
                    'transform 0.25s ease, background-color 0.25s ease, border-color 0.25s ease',
                },
                '& .feature-image': {
                  transition: 'transform 0.4s ease',
                },
                '& .feature-cta svg': {
                  transition: 'transform 0.25s ease',
                },
                '&:hover, &:has(.feature-link:focus-visible)': {
                  '& .feature-card': {
                    transform: 'translateY(-4px)',
                    backgroundColor: tint(0.12),
                    borderColor: tint(0.35),
                  },
                  '& .feature-image': { transform: 'scale(1.02)' },
                  '& .feature-cta svg': { transform: 'translateX(4px)' },
                },
                '& .feature-link:focus-visible': {
                  outline: `2px solid ${tint(0.9)}`,
                  outlineOffset: 2,
                  borderRadius: 4,
                },
                '@media (prefers-reduced-motion: reduce)': {
                  '& .feature-card, & .feature-image, & .feature-cta svg': {
                    transition: 'none',
                  },
                  '&:hover, &:has(.feature-link:focus-visible)': {
                    '& .feature-card': { transform: 'none' },
                  },
                },
              }}
            >
              <Link
                href={feature.href}
                // One prefetch per feature card, all firing while the hero is
                // still fetching. The targets are statically rendered.
                prefetch={false}
                {...(feature.external === true && {
                  target: '_blank',
                  rel: 'noopener noreferrer',
                })}
                className='feature-link'
                style={{
                  display: 'block',
                  height: '100%',
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                <Box
                  className='feature-card'
                  sx={{
                    height: '100%',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    p: 2,
                    borderRadius: 4,
                    backgroundColor: tint(0.06),
                    border: `1px solid ${tint(0.18)}`,
                  }}
                >
                  <FeatureImage
                    feature={feature}
                    alt={t(`items.${feature.key}.title`)}
                    preview={previews[feature.key]}
                  />
                  <Box sx={{ px: 1, pb: 1 }}>
                    <Typography
                      component='h3'
                      sx={{
                        fontWeight: 700,
                        // Only the bento grid's large tile gets a bigger
                        // title; the mobile gallery's cards are all equal.
                        fontSize: {
                          xs: '1.15rem',
                          md: feature.key === 'discover' ? '1.5rem' : '1.15rem',
                        },
                        lineHeight: 1.25,
                        mb: 1,
                      }}
                    >
                      {t(`items.${feature.key}.title`)}
                    </Typography>
                    <Typography
                      sx={{ fontSize: '0.9rem', opacity: 0.85, mb: 1.5 }}
                    >
                      {t(`items.${feature.key}.description`)}
                    </Typography>
                    <Typography
                      component='span'
                      className='feature-cta'
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        fontWeight: 700,
                        fontSize: '0.875rem',
                      }}
                    >
                      {t(`items.${feature.key}.cta`)}
                      <ArrowForward sx={{ fontSize: '1rem' }} />
                    </Typography>
                  </Box>
                </Box>
              </Link>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}
