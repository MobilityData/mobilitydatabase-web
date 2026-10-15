import { type ReactElement, type ReactNode } from 'react';
import { Box, Typography, colors } from '@mui/material';
import {
  CheckCircle,
  DateRange,
  Info,
  InfoOutlined,
  Update,
  Verified,
  WarningAmber,
} from '@mui/icons-material';
import Image from 'next/image';
import { fontFamily } from '../../Theme';
import { getFeatureComponentDecorators } from '../../utils/consts';

/**
 * Code-built stand-ins for product screenshots in the feature cards. They
 * mirror the real UI (AdvancedSearchTable, GtfsFeatureTracker) and are purely
 * decorative, so they're hidden from assistive tech.
 */

/**
 * A light app surface that fills the whole tile, like a screenshot cropped to
 * cover it; the tile's rounded corners clip it and it's cropped at the bottom
 * when taller. Everything inside is sized in `em`, and the font size tracks
 * the tile's width (the tile is a size container), so the content always
 * fits edge to edge. `designWidth` is the content's width in em.
 */
const PreviewWindow = ({
  designWidth,
  children,
}: {
  designWidth: number;
  children: ReactNode;
}): ReactElement => (
  <Box
    aria-hidden='true'
    // The mock rows name real agencies and carry plausible-looking counts and
    // feed ids. A text extractor can't tell that chrome from the page's own
    // claims, so Google is told to keep it out of snippets and AI Overviews,
    // and FeaturePreviewsLazy keeps it out of the server-rendered HTML that
    // non-rendering crawlers read.
    data-nosnippet=''
    sx={{
      flex: 1,
      minWidth: 0,
      alignSelf: 'stretch',
      display: 'flex',
      flexDirection: 'column',
      fontSize: `clamp(10px, calc(100cqw / ${designWidth}), 14px)`,
      backgroundColor: 'background.paper',
      color: 'text.primary',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </Box>
);

const rowSx = {
  display: 'grid',
  alignItems: 'center',
  columnGap: '1.5em',
  px: '1em',
  flexShrink: 0,
  borderBottom: 1,
  borderColor: 'divider',
  '&:last-of-type': { borderBottom: 0 },
} as const;

const cellTextSx = {
  fontSize: '1em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

const cellSx = {
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
} as const;

// ---- Search results -------------------------------------------------------

export interface SearchPreviewLabels {
  gtfs: string;
  gtfsRt: string;
  gbfs: string;
  tripUpdates: string;
  serviceAlerts: string;
}

type SearchResult = {
  provider: string;
  official?: boolean;
  /** Omitted when the feed has no locations, as the real card does. */
  location?: { flag: string; country: string; count: number };
} & (
  | { dataType: 'gtfs'; feedName?: string; features: string[] }
  | { dataType: 'gtfsRt'; entity: 'tripUpdates' | 'serviceAlerts' }
  | { dataType: 'gbfs'; version: string; license: string }
);

const FRANCE = { flag: '🇫🇷', country: 'France' };

// Real Paris results, one per data type, as the feeds search shows them.
const SEARCH_RESULTS: SearchResult[] = [
  {
    provider: 'Île-de-France Mobilités',
    official: true,
    location: { ...FRANCE, count: 1319 },
    dataType: 'gtfs',
    feedName:
      "Réseaux urbains et interurbains d'Île-de-France Mobilités (IDFM)",
    features: [
      'Attributions',
      'Bike Allowed',
      'Continuous Stops',
      'Feed Information',
      'Headsigns',
      'Location Types',
      'Route Colors',
      'Shapes',
      'Stop Access',
      'Stops Wheelchair Accessibility',
      'Transfers',
      'Trips Wheelchair Accessibility',
    ],
  },
  {
    provider: 'Île-de-France Mobilités',
    dataType: 'gtfsRt',
    entity: 'tripUpdates',
  },
  {
    provider: "Vélib' Metropole",
    location: { ...FRANCE, count: 69 },
    dataType: 'gbfs',
    version: '1.0',
    license: 'CC-BY-4.0',
  },
  // Usually cropped by the tile; it lets the list run off the bottom.
  {
    provider: 'Île-de-France Mobilités',
    dataType: 'gtfsRt',
    entity: 'serviceAlerts',
  },
];

// The real chips' colors (GtfsRtEntities).
const RT_ENTITY_STYLES = {
  tripUpdates: { Icon: Update, bg: colors.blue[200], fg: colors.blue[900] },
  serviceAlerts: { Icon: WarningAmber, bg: colors.blue[900], fg: '#fff' },
};

// Sized relative to its own font size, like MUI's small chip (24px at 13px).
const chipSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3em',
  height: '1.85em',
  px: '0.6em',
  borderRadius: '1em',
  fontSize: '0.8125em',
  whiteSpace: 'nowrap',
} as const;

const ResultDetails = ({
  result,
  labels,
}: {
  result: SearchResult;
  labels: SearchPreviewLabels;
}): ReactElement => {
  switch (result.dataType) {
    case 'gtfs':
      return (
        <>
          {result.feedName !== undefined && (
            <Typography sx={{ fontSize: '1em', mb: '0.5em' }}>
              {result.feedName}
            </Typography>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em' }}>
            {result.features.map((feature) => (
              <Box
                key={feature}
                sx={{
                  ...chipSx,
                  bgcolor: getFeatureComponentDecorators(feature).color,
                  color: 'common.black',
                }}
              >
                {feature}
              </Box>
            ))}
          </Box>
        </>
      );
    case 'gtfsRt': {
      const { Icon, bg, fg } = RT_ENTITY_STYLES[result.entity];
      return (
        <Box
          sx={{
            ...chipSx,
            alignSelf: 'start',
            fontWeight: 700,
            bgcolor: bg,
            color: fg,
          }}
        >
          <Icon sx={{ fontSize: '1.3em' }} />
          {labels[result.entity]}
        </Box>
      );
    }
    case 'gbfs':
      return (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'end',
          }}
        >
          <Box
            sx={{
              ...chipSx,
              border: 1,
              borderColor: 'text.disabled',
            }}
          >
            v{result.version}
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3em',
              fontSize: '0.75em',
              opacity: 0.7,
            }}
          >
            <InfoOutlined sx={{ fontSize: '1.15em' }} />
            {result.license}
          </Box>
        </Box>
      );
  }
};

export const SearchPreview = ({
  labels,
}: {
  labels: SearchPreviewLabels;
}): ReactElement => (
  <PreviewWindow designWidth={30}>
    {SEARCH_RESULTS.map((result, index) => (
      <Box
        // Static list; the provider alone isn't unique.
        key={index}
        sx={{
          flexShrink: 0,
          mx: '0.75em',
          mt: '0.75em',
          px: '0.75em',
          py: '0.6em',
          borderRadius: '0.25em',
          bgcolor: 'background.default',
          boxShadow: 1,
          whiteSpace: 'normal',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75em',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}>
            <Typography
              sx={{ fontSize: '1.25em', fontWeight: 700, lineHeight: 1.3 }}
            >
              {result.provider}
            </Typography>
            {result.official === true && (
              <Verified
                sx={{
                  flexShrink: 0,
                  fontSize: '1.5em',
                  p: '0.1em',
                  borderRadius: '50%',
                  color: 'common.white',
                  background:
                    'linear-gradient(25deg, var(--mui-palette-primary-light), var(--mui-palette-primary-dark))',
                }}
              />
            )}
            {/* Active status; GBFS cards don't show one. */}
            {result.dataType !== 'gbfs' && (
              <Box
                sx={{
                  flexShrink: 0,
                  width: '0.75em',
                  height: '0.75em',
                  borderRadius: '50%',
                  bgcolor: 'success.main',
                }}
              />
            )}
          </Box>
          <Typography
            sx={{ fontSize: '1em', fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            {labels[result.dataType]}
          </Typography>
        </Box>
        {result.location !== undefined && (
          <Typography sx={{ fontSize: '1em', mt: '0.15em' }}>
            <Box component='span' sx={{ mr: '0.5em' }}>
              {result.location.flag}
            </Box>
            {result.location.country}
            <Box
              component='span'
              sx={{ fontSize: '0.75em', fontStyle: 'italic', fontWeight: 700 }}
            >
              &nbsp;({result.location.count})
            </Box>
          </Typography>
        )}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            mt: '0.5em',
            pt: '0.6em',
            pb: '0.2em',
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <ResultDetails result={result} labels={labels} />
        </Box>
      </Box>
    ))}
  </PreviewWindow>
);

// ---- Feature tracker ------------------------------------------------------

interface TrackerPreviewProps {
  everyFeed: string;
  someFieldsIgnored: string;
}

const CONSUMERS = [
  { name: 'Google', logo: '/assets/tripPlannerLogos/gmaps.png' },
  { name: 'Transit', logo: '/assets/tripPlannerLogos/transitapp.png' },
];

type Status = 'every' | 'partial';

// One row per GTFS feature, one cell per consumer above.
const TRACKER_ROWS: Status[][] = [
  ['every', 'every'],
  ['partial', 'every'],
];

// The first column is wider: it holds the long "some fields ignored" status.
const TRACKER_COLUMNS = 'minmax(0, 1.5fr) minmax(0, 1fr)';

export const TrackerPreview = ({
  everyFeed,
  someFieldsIgnored,
}: TrackerPreviewProps): ReactElement => (
  <PreviewWindow designWidth={26}>
    <Box sx={{ ...rowSx, gridTemplateColumns: TRACKER_COLUMNS }}>
      {CONSUMERS.map((consumer) => (
        <Box key={consumer.name} sx={{ ...cellSx, gap: '0.6em', py: '0.8em' }}>
          <Image
            src={consumer.logo}
            alt=''
            width={24}
            height={24}
            // Tiny static logos; skip the optimizer round-trip.
            unoptimized
            style={{
              width: '1.7em',
              height: '1.7em',
              objectFit: 'contain',
              borderRadius: 6,
            }}
          />
          <Typography sx={{ ...cellTextSx, fontWeight: 700 }}>
            {consumer.name}
          </Typography>
        </Box>
      ))}
    </Box>
    {TRACKER_ROWS.map((row, rowIndex) => (
      // Status rows share the leftover height so the table fills the tile.
      <Box
        key={rowIndex}
        sx={{ ...rowSx, gridTemplateColumns: TRACKER_COLUMNS, flex: 1 }}
      >
        {row.map((status, cellIndex) => (
          <Box key={cellIndex} sx={{ ...cellSx, gap: '0.45em', py: '0.9em' }}>
            {status === 'every' ? (
              <CheckCircle color='success' sx={{ fontSize: '1.25em' }} />
            ) : (
              <Info color='info' sx={{ fontSize: '1.25em' }} />
            )}
            <Typography sx={cellTextSx}>
              {status === 'every' ? everyFeed : someFieldsIgnored}
            </Typography>
          </Box>
        ))}
      </Box>
    ))}
  </PreviewWindow>
);

// ---- API access -----------------------------------------------------------

type JsonToken = [kind: 'key' | 'string' | 'punct', text: string];

// A trimmed /v1/gtfs_feeds response for the Montréal feed the visualization
// card links to. One entry per line: indent depth, then its tokens.
const API_RESPONSE: Array<[depth: number, tokens: JsonToken[]]> = [
  [0, [['punct', '[']]],
  [1, [['punct', '{']]],
  [
    2,
    [
      ['key', '"id"'],
      ['punct', ': '],
      ['string', '"mdb-2126"'],
      ['punct', ','],
    ],
  ],
  [
    2,
    [
      ['key', '"data_type"'],
      ['punct', ': '],
      ['string', '"gtfs"'],
      ['punct', ','],
    ],
  ],
  [
    2,
    [
      ['key', '"status"'],
      ['punct', ': '],
      ['string', '"active"'],
      ['punct', ','],
    ],
  ],
  [
    2,
    [
      ['key', '"provider"'],
      ['punct', ': '],
      ['string', '"Société de transport de Montréal"'],
      ['punct', ','],
    ],
  ],
  [
    2,
    [
      ['key', '"locations"'],
      ['punct', ': [{'],
    ],
  ],
  [
    3,
    [
      ['key', '"country_code"'],
      ['punct', ': '],
      ['string', '"CA"'],
      ['punct', ','],
    ],
  ],
  [
    3,
    [
      ['key', '"municipality"'],
      ['punct', ': '],
      ['string', '"Montréal"'],
    ],
  ],
  [2, [['punct', '}],']]],
  [
    2,
    [
      ['key', '"latest_dataset"'],
      ['punct', ': { … }'],
    ],
  ],
  [1, [['punct', '},']]],
];

const TOKEN_COLORS: Record<JsonToken[0], string> = {
  key: 'primary.main',
  string: 'success.main',
  punct: 'text.secondary',
};

export const ApiPreview = (): ReactElement => (
  <PreviewWindow designWidth={26}>
    <Box
      sx={{
        ...rowSx,
        display: 'flex',
        gap: '0.6em',
        py: '0.8em',
        fontFamily: fontFamily.secondary,
      }}
    >
      <Box
        component='span'
        sx={{
          px: '0.5em',
          py: '0.15em',
          borderRadius: '0.3em',
          fontSize: '0.85em',
          fontWeight: 700,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
        }}
      >
        GET
      </Box>
      <Typography
        sx={{ ...cellTextSx, fontFamily: 'inherit', fontWeight: 700 }}
      >
        /v1/gtfs_feeds?country_code=CA
      </Typography>
    </Box>
    <Box
      sx={{
        px: '1em',
        py: '0.8em',
        fontFamily: fontFamily.secondary,
        fontSize: '0.9em',
        lineHeight: 1.6,
      }}
    >
      {API_RESPONSE.map(([depth, tokens], lineIndex) => (
        <Box
          key={lineIndex}
          sx={{
            pl: `${depth * 1.2}em`,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {tokens.map(([kind, text], tokenIndex) => (
            <Box
              key={tokenIndex}
              component='span'
              sx={{ color: TOKEN_COLORS[kind] }}
            >
              {text}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  </PreviewWindow>
);

// ---- Dataset history ------------------------------------------------------

interface HistoryPreviewProps {
  locale: string;
  downloadedAtLabel: string;
  serviceDateRangeLabel: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Day offsets from the latest download, shaped like a real feed's history:
// re-downloads of an unchanged dataset, then older service periods.
const HISTORY_ROWS = [
  { downloaded: 0, start: -71, end: 61 },
  { downloaded: -14, start: -71, end: 61 },
  { downloaded: -83, start: -155, end: -2 },
  { downloaded: -88, start: -232, end: -72 },
];

const HISTORY_COLUMNS = 'minmax(0, 0.8fr) minmax(0, 1.2fr)';

// Read once at module load: the home page is statically rendered, so this is
// the build date, which keeps the dates current without hard-coding a year.
const LATEST_DOWNLOAD = Date.now() - 2 * DAY_MS;

export const HistoryPreview = ({
  locale,
  downloadedAtLabel,
  serviceDateRangeLabel,
}: HistoryPreviewProps): ReactElement => {
  const day = (offset: number): Date =>
    new Date(LATEST_DOWNLOAD + offset * DAY_MS);
  // Shorter than the real table's formats so both columns fit the tile.
  const dateFormat = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <PreviewWindow designWidth={26}>
      <Box sx={{ ...rowSx, gridTemplateColumns: HISTORY_COLUMNS }}>
        {[downloadedAtLabel, serviceDateRangeLabel].map((label) => (
          <Typography
            key={label}
            sx={{ ...cellTextSx, fontWeight: 700, py: '0.9em' }}
          >
            {label}
          </Typography>
        ))}
      </Box>
      {HISTORY_ROWS.map((row) => (
        <Box
          key={row.downloaded}
          sx={{ ...rowSx, gridTemplateColumns: HISTORY_COLUMNS }}
        >
          <Typography sx={{ ...cellTextSx, py: '0.9em' }}>
            {dateFormat.format(day(row.downloaded))}
          </Typography>
          <Box sx={{ ...cellSx, gap: '0.5em' }}>
            <DateRange sx={{ fontSize: '1.3em' }} />
            <Typography sx={cellTextSx}>
              {dateFormat.formatRange(day(row.start), day(row.end))}
            </Typography>
          </Box>
        </Box>
      ))}
    </PreviewWindow>
  );
};
