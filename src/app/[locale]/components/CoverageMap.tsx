'use client';

import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Box, Container, ToggleButton, ToggleButtonGroup } from '@mui/material';
import dynamic from 'next/dynamic';
import MapIcon from '@mui/icons-material/Map';
import PublicIcon from '@mui/icons-material/Public';
import { useTranslations } from 'next-intl';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
} from '../../components/WorldGlobe/flat-map-geometry';
import GlobePlaceholder from './GlobePlaceholder';

// Both visuals are heavy: three.js, a 190 kB country topology and the feed
// counts, then a few hundred meshes built on mount. They sit well below the
// fold, so neither the code nor that work belongs in the landing page's first
// seconds -- loaded eagerly, building the globe was the page's longest task.
const WorldGlobeFeeds = dynamic(
  async () => await import('../../components/WorldGlobe/WorldGlobeFeeds'),
  { ssr: false },
);
const WorldFlatMapFeeds = dynamic(
  async () => await import('../../components/WorldGlobe/WorldFlatMapFeeds'),
  { ssr: false },
);

/** Start loading this far before the visual scrolls into view. */
const PRELOAD_MARGIN_PX = 600;
/** Cross-fade between the placeholder and the built globe. */
const FADE_MS = 400;

type CoverageView = 'globe' | 'map';

interface CoverageMapProps {
  /** Server-rendered section heading; the view toggle sits beneath it. */
  heading: ReactNode;
}

/**
 * Landing-page coverage row: heading and globe / flat map switch on the
 * left, the visual on the right. The flat map is far wider than tall, so
 * the row shrinks to fit it and the map bleeds into the page's right margin.
 */
export default function CoverageMap({
  heading,
}: CoverageMapProps): ReactElement {
  const t = useTranslations('home.globe');
  const [view, setView] = useState<CoverageView>('globe');
  const isMap = view === 'map';
  const visualRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  // Kept mounted through the fade: dropping it the instant the globe reports
  // ready left a blank frame, because the globe is still at opacity 0 then.
  const [placeholderGone, setPlaceholderGone] = useState(false);

  // Scroll-triggered rather than time-triggered: building the globe is a
  // single ~600ms block of main thread, so doing it for every visitor, even
  // the ones who never reach it, costs more in blocking time than it saves
  // in waiting. The placeholder below covers the gap instead.
  useEffect(() => {
    const element = visualRef.current;
    if (element === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setMounted(true);
        observer.disconnect();
      },
      { rootMargin: `${PRELOAD_MARGIN_PX}px` },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    // Clips the map's bleed: 100vw includes any classic scrollbar.
    <Box sx={{ overflowX: 'clip' }}>
      <Container
        maxWidth='lg'
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            md: 'minmax(0, 1fr) minmax(0, 1.8fr)',
          },
          gridTemplateAreas: { xs: '"text" "visual"', md: '"text visual"' },
          columnGap: { md: 4 },
        }}
      >
        {/* The section has no top padding so the globe starts right under
          the features; only the text column is pushed down. */}
        <Box
          sx={{
            gridArea: 'text',
            pt: { xs: 6, md: 10 },
            pb: { xs: 2, md: 0 },
            // Above the flat map, which reaches back under this column.
            position: 'relative',
            zIndex: 1,
          }}
        >
          {heading}
          <ToggleButtonGroup
            value={view}
            exclusive
            size='small'
            color='primary'
            aria-label={t('viewToggleLabel')}
            onChange={(_, next: CoverageView | null) => {
              // Exclusive groups emit null when the active button is re-clicked.
              if (next != null) setView(next);
            }}
            sx={{
              bgcolor: 'background.default',
              '& .MuiToggleButton-root': {
                gap: 0.75,
                px: 1.5,
                textTransform: 'none',
              },
            }}
          >
            <ToggleButton value='globe'>
              <PublicIcon fontSize='small' />
              {t('viewGlobe')}
            </ToggleButton>
            <ToggleButton value='map'>
              <MapIcon fontSize='small' />
              {t('viewMap')}
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        {isMap ? (
          <Box
            ref={visualRef}
            sx={(theme) => ({
              gridArea: 'visual',
              // Lines the map up with the heading rather than the section top.
              pt: { md: 10 },
              // The map's left edge is open Pacific, so it can tuck under the
              // text column; the extra width also makes the map bigger.
              ml: { md: -6, lg: -12 },
              // Out to the viewport edge once the container stops growing.
              mr: {
                md: `calc(-1 * max(0px, (100vw - ${theme.breakpoints.values.lg}px) / 2))`,
              },
            })}
          >
            <Box
              sx={{
                position: 'relative',
                aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
              }}
            >
              {mounted && <WorldFlatMapFeeds preview />}
            </Box>
          </Box>
        ) : (
          <Box
            ref={visualRef}
            sx={{
              gridArea: 'visual',
              position: 'relative',
              // Sized from the column's width, not the viewport's height: a
              // vh-based height left tall portrait tablets mostly empty.
              aspectRatio: '1 / 1',
              maxHeight: { xs: '70vh', md: '80vh' },
              mb: '-48px',
            }}
          >
            {!placeholderGone && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  opacity: ready ? 0 : 1,
                  transition: `opacity ${FADE_MS}ms ease-out`,
                  pointerEvents: 'none',
                }}
                onTransitionEnd={() => {
                  // Only once it has actually faded, so the pulse stops.
                  if (ready) setPlaceholderGone(true);
                }}
              >
                <GlobePlaceholder />
              </Box>
            )}
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                opacity: ready ? 1 : 0,
                transition: `opacity ${FADE_MS}ms ease-out`,
              }}
            >
              {mounted && (
                <WorldGlobeFeeds
                  preview
                  onReady={() => {
                    setReady(true);
                  }}
                />
              )}
            </Box>
          </Box>
        )}
      </Container>
    </Box>
  );
}
