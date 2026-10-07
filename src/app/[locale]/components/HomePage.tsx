import { type ReactElement } from 'react';
import { Box, Typography, Button, Container } from '@mui/material';
import SearchBox from './SearchBox';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import HeroBackground from './hero-animation/HeroBackground';
import { JOURNEY_DATA_URL } from './hero-animation/montreal-journey';
import { tilePreloadScript } from './hero-animation/journey-tiles';
import HeroGridPlaceholder from './hero-animation/HeroGridPlaceholder';
import FeaturePromo from './FeaturePromo';
import SectionHeading from './SectionHeading';
import CoverageMap from './CoverageMap';
import { FEED_COUNTS_AS_OF } from '../../components/WorldGlobe/feed-stats';

interface ActionBoxProps {
  buttonHref: string;
  buttonText: string;
  /** Filled primary button for the main call to action. */
  primary?: boolean;
}

const ActionBox = ({
  buttonHref,
  buttonText,
  primary = false,
}: ActionBoxProps): React.ReactElement => (
  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
    {/* These sit in the hero, so their RSC prefetches land in exactly the
      window the hero needs for its own data and tiles. All three targets are
      statically rendered, so a cold navigation is cheap. */}
    <Link href={buttonHref} prefetch={false}>
      <Button
        variant={primary ? 'contained' : 'outlined'}
        color='primary'
        sx={{
          px: 2,
          // Over the map, a solid page-colored fill keeps the label legible.
          ...(!primary && {
            bgcolor: 'background.default',
            '&:hover': {
              bgcolor:
                'color-mix(in srgb, var(--mui-palette-primary-main) 8%, var(--mui-palette-background-default))',
            },
          }),
        }}
      >
        {buttonText}
      </Button>
    </Link>
  </Box>
);

/**
 * Home page component that fetches translations directly.
 * Used by [locale]/page.tsx.
 */
export default async function HomePage(): Promise<ReactElement> {
  const t = await getTranslations('home');

  return (
    <Box component='main'>
      {/* Hoisted into <head>. The hero is the only thing on the site that
        talks to the tile CDN, so the hints live with it rather than in the
        root layout.
        `crossOrigin='anonymous'` is credentials mode `same-origin`, which is
        what a plain `fetch()` uses; without it the two modes differ and the
        browser makes the request twice. */}
      <link
        rel='preconnect'
        href='https://a.basemaps.cartocdn.com'
        crossOrigin='anonymous'
      />
      {/* Runs during HTML parse, well before any bundle, so the hero's thirty
        tiles are in flight about a second earlier. See `tilePreloadScript`. */}
      <script dangerouslySetInnerHTML={{ __html: tilePreloadScript() }} />
      <link
        rel='preload'
        as='fetch'
        href={JOURNEY_DATA_URL}
        crossOrigin='anonymous'
      />
      <Container sx={{ px: { xs: 0, md: 3 } }}>
        {/* Server-rendered stand-in for the scene's first frame, so the hero
          area is never blank. The scene fades it out once it paints. */}
        <HeroGridPlaceholder />
        <HeroBackground />

        <Box
          component='section'
          sx={{
            minHeight: '80vh',
            // Flexible rows around the search bar; the bottom one is a bit
            // larger so the search sits slightly above the section's centre.
            // The heading hugs the top of the first row and the actions the
            // top of the last. A tall heading grows its row instead of
            // overlapping the search.
            display: 'grid',
            gridTemplateRows:
              'minmax(min-content, 1fr) auto minmax(min-content, 1.4fr)',
            // An implicit `auto` column would grow to the nav's fixed 700px
            // width on narrow screens, overflowing the viewport.
            gridTemplateColumns: 'minmax(0, 1fr)',
          }}
          mx={{ xs: '20px', m: 'auto' }}
          maxWidth={{ xs: '100%', md: '1600px' }}
          role='main'
          aria-label='Mobility Database Home'
        >
          <Box sx={{ alignSelf: 'start', pt: { xs: 4, md: 5 }, pb: 4 }}>
            <Typography
              component='h1'
              sx={{
                fontSize: {
                  xs: '36px',
                  sm: '48px',
                  md: '60px',
                },
                fontWeight: 700,
                lineHeight: 1.1,
                textAlign: 'center',
              }}
              data-testid='home-title'
            >
              {t.rich('title', {
                emphasis: (chunks) => (
                  <Box component='span' sx={{ color: 'primary.main' }}>
                    {chunks}
                  </Box>
                ),
              })}
            </Typography>

            <Typography
              component='p'
              variant='h6'
              sx={{
                // Hugs the text so the translucent backdrop sits just behind
                // it, lifting it off the animated hero without a full band.
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                columnGap: 3,
                width: 'fit-content',
                maxWidth: '100%',
                mx: 'auto',
                px: 1.5,
                py: 0.25,
                borderRadius: 2,
                bgcolor:
                  'color-mix(in srgb, var(--mui-palette-background-default) 75%, transparent)',
                textAlign: 'center',
                color: 'text.secondary',
                mt: 3,
              }}
            >
              {t.rich('subtitle', {
                stat: (chunks) => <span>{chunks}</span>,
                b: (chunks) => (
                  <Box
                    component='strong'
                    sx={{ fontWeight: 700, color: 'text.primary' }}
                  >
                    {chunks}
                  </Box>
                ),
              })}
            </Typography>
          </Box>
          <SearchBox />
          <Box
            component='nav'
            sx={{
              display: 'flex',
              justifyContent: 'center',
              gap: 4,
              flexDirection: { xs: 'column', sm: 'row' },
              width: '700px',
              maxWidth: '100%',
              mx: 'auto',
              // Replaces the buttons' old 16px margin so the row sits where
              // it did relative to the search bar.
              mt: 4,
              alignSelf: 'start',
            }}
            role='navigation'
            aria-label='Main actions'
          >
            <ActionBox
              buttonHref='/feeds'
              buttonText={t('browseFeeds')}
              primary
            />
            <ActionBox buttonHref='/contribute' buttonText={t('addFeed')} />
            <ActionBox buttonHref='/sign-up' buttonText={t('signUpApi')} />
          </Box>
        </Box>
      </Container>
      <FeaturePromo />
      <Box component='section' aria-labelledby='globe-title'>
        <CoverageMap
          heading={
            <SectionHeading
              id='globe-title'
              eyebrow={t('globe.eyebrow')}
              title={t('globe.title')}
              description={t('globe.description')}
              caveat={t('globe.caveat', { date: FEED_COUNTS_AS_OF })}
              eyebrowColor='primary.main'
              sx={{ mb: 3 }}
            />
          }
        />
      </Box>
    </Box>
  );
}
