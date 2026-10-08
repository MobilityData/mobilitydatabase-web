'use client';

import { type ReactElement } from 'react';
import { Box, Chip } from '@mui/material';
import { useTranslations } from 'next-intl';
import { Link } from '../../../../i18n/navigation';
import { fontFamily } from '../../../Theme';

// The journey hero's standard chips (GBFS, GTFS-RT, GTFS) as real links to
// the feeds search, filtered to that data type, each with the feed file the
// element comes from beside it. The scene sits behind the page content, so
// these live in an overlay above it; the scene moves each one onto its pin
// or station every frame and fades it in with the pins.

export type ChipId = 'gbfs' | 'gtfsRt' | 'gtfs';

export const STANDARD_CHIPS: ReadonlyArray<{
  id: ChipId;
  label: string;
  href: string;
  /** The feed file behind the element the chip names. */
  file: string;
}> = [
  {
    id: 'gbfs',
    label: 'GBFS',
    href: '/feeds?gbfs=true',
    file: 'station_information.json',
  },
  {
    id: 'gtfsRt',
    label: 'GTFS-RT',
    href: '/feeds?gtfs_rt=true',
    file: 'service_alerts.pb',
  },
  { id: 'gtfs', label: 'GTFS', href: '/feeds?gtfs=true', file: 'routes.txt' },
];

export type ChipElements = Partial<Record<ChipId, HTMLDivElement | null>>;

interface JourneyStandardChipsProps {
  /** Filled in with each chip's positioned wrapper, for the scene to move. */
  elements: ChipElements;
}

export default function JourneyStandardChips({
  elements,
}: JourneyStandardChipsProps): ReactElement {
  const t = useTranslations('home.heroChips');

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        overflow: 'hidden',
        pointerEvents: 'none',
        // Phones stack the hero's actions over the trip, and even fully
        // backed off the trip is wider than the screen, so the chips would
        // land on the buttons and off its left edge. The scene stays as a
        // backdrop; "Browse Feeds" covers what the chips link to.
        display: { xs: 'none', sm: 'block' },
        // Held sideways, a phone or tablet is wide enough to clear the xs
        // rule but too short: the heading and search bar fill the hero and
        // the chips land on top of them. A coarse pointer is what separates
        // those from a laptop, which is landscape too but has the height.
        '@media (orientation: landscape) and (pointer: coarse)': {
          display: 'none',
        },
      }}
    >
      {STANDARD_CHIPS.map(({ id, label, href, file }) => (
        // The wrapper is the chip's size, so the scene centers the chip
        // itself on its anchor. The file name hangs off to its right, or
        // sits above it on narrower screens, where it would run into the
        // next chip; left-aligned there so the GBFS chip's label, near the
        // scene's left edge, isn't clipped.
        <div
          key={id}
          ref={(element) => {
            elements[id] = element;
          }}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            // Hidden until the scene places it.
            opacity: 0,
            visibility: 'hidden',
            willChange: 'transform, opacity',
          }}
        >
          <Chip
            component={Link}
            href={href}
            // Three chips sitting over the hero; prefetching their feeds
            // searches competes with the hero's own data and tiles.
            prefetch={false}
            clickable
            color='primary'
            label={label}
            aria-label={t(id)}
            title={t(id)}
            // One step up from MUI's medium chip (32px tall, 13px text).
            sx={{
              pointerEvents: 'auto',
              fontWeight: 700,
              height: 40,
              borderRadius: 5,
              fontSize: 15,
              '& .MuiChip-label': { px: 2 },
            }}
          />
          <Box
            component='span'
            aria-hidden='true'
            sx={{
              position: 'absolute',
              left: { xs: 0, md: 'calc(100% + 6px)' },
              top: { xs: 'auto', md: '50%' },
              bottom: { xs: 'calc(100% + 6px)', md: 'auto' },
              transform: { xs: 'none', md: 'translateY(-50%)' },
              whiteSpace: 'nowrap',
              px: 0.75,
              py: 0.25,
              borderRadius: 1,
              bgcolor: 'background.default',
              color: 'text.secondary',
              fontFamily: fontFamily.secondary,
              fontSize: 14,
              lineHeight: 1.4,
            }}
          >
            {file}
          </Box>
        </div>
      ))}
    </Box>
  );
}
