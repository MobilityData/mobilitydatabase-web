import { type ReactElement } from 'react';
import { Box, Typography } from '@mui/material';
import { getTranslations } from 'next-intl/server';
import {
  formatCount,
  getFeedCountEntries,
  type FeedCountDataType,
  type LocationDirectoryFeedCounts,
} from '../lib/location-directory';

interface Props {
  counts: LocationDirectoryFeedCounts | undefined;
  locale: string;
}

const LABEL_KEYS: Record<FeedCountDataType, string> = {
  gtfs: 'gtfsSchedule',
  gtfs_rt: 'gtfsRealtime',
  gbfs: 'gbfs',
};

/** The node's feed totals split by GTFS Schedule / GTFS Realtime / GBFS. */
export default async function FeedCountSummary({
  counts,
  locale,
}: Props): Promise<ReactElement> {
  const [tCommon, t] = await Promise.all([
    getTranslations('common'),
    getTranslations('locations'),
  ]);

  return (
    <Box
      component='dl'
      aria-label={t('feedCountsAria')}
      data-testid='location-feed-counts'
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: { xs: 1, sm: 2 },
        m: 0,
        maxWidth: 720,
      }}
    >
      {getFeedCountEntries(counts).map(({ dataType, count }) => (
        <Box
          key={dataType}
          sx={{
            display: 'flex',
            flexDirection: 'column-reverse',
            justifyContent: 'flex-end',
            gap: 0.5,
            px: { xs: 1.5, sm: 2 },
            py: 1.5,
            borderRadius: '6px',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Typography
            component='dt'
            variant='body2'
            color='text.secondary'
            sx={{ fontWeight: 600, lineHeight: 1.3 }}
          >
            {tCommon(LABEL_KEYS[dataType])}
          </Typography>
          <Typography
            component='dd'
            sx={{
              m: 0,
              fontSize: { xs: '1.5rem', sm: '2rem' },
              fontWeight: 700,
              lineHeight: 1.1,
              color: count > 0 ? 'primary.main' : 'text.disabled',
            }}
          >
            {formatCount(count, locale)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
